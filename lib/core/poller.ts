/**
 * 后台轮询器
 * 在应用启动时自动初始化并持续运行
 *
 * 支持每个模型自定义轮询间隔：
 * - 全局间隔由 CHECK_POLL_INTERVAL_SECONDS 环境变量控制（默认 60 秒）
 * - 每个 config 可通过 metadata.poll_interval_seconds 覆盖全局值
 * - 轮询器以全局间隔运行 tick，每次 tick 仅检查已到达各自间隔的 config
 * - 若存在比全局间隔更短的自定义间隔，tick 结束后会安排一次补充检查
 */

import {historySnapshotStore} from "../database/history";
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {runProviderChecks} from "../providers";
import {
  getPollingIntervalMs,
  getPollingIntervalLabel,
  getOfficialStatusIntervalLabel,
  getCheckConcurrency,
  getEffectivePollIntervalMs,
} from "./polling-config";
import {
  getConfigLastCheckedAt,
  getLastPingStartedAt,
  getPollerTimer,
  pruneConfigLastChecked,
  setConfigLastCheckedAt,
  setLastPingStartedAt,
  setPollerTimer,
} from "./global-state";
import {startOfficialStatusPoller} from "./official-status-poller";
import {ensurePollerLeadership, isPollerLeader} from "./poller-leadership";
import type {HealthStatus, ProviderConfig} from "../types";
import {getDatabaseProvider} from "../db";
import {HISTORY_RETENTION_DAYS} from "../database/history";

const POLL_INTERVAL_MS = getPollingIntervalMs();

/** 补充 tick 的定时器，用于处理比全局间隔更短的自定义间隔 */
let supplementaryTimer: NodeJS.Timeout | undefined;

/**
 * 输出启动配置参数
 */
function logStartupConfig() {
  const nodeId = process.env.CHECK_NODE_ID || process.env.HOSTNAME || "local";
  const dbProvider = getDatabaseProvider();

  console.log("[check-cx] ========== 启动配置 ==========");
  console.log(`[check-cx]   节点 ID: ${nodeId}`);
  console.log(`[check-cx]   数据库: ${dbProvider}`);
  console.log(`[check-cx]   全局轮询间隔: ${getPollingIntervalLabel()}`);
  console.log(`[check-cx]   状态检查间隔: ${getOfficialStatusIntervalLabel()}`);
  console.log(`[check-cx]   最大并发数: ${getCheckConcurrency()}`);
  console.log(`[check-cx]   历史保留: ${HISTORY_RETENTION_DAYS} 天`);
  console.log(`[check-cx]   支持每模型自定义轮询间隔 (metadata.poll_interval_seconds)`);
  console.log("[check-cx] ================================");
}

/**
 * 根据每个 config 的自定义轮询间隔，筛选出本轮需要检查的 config
 */
function filterDueConfigs(configs: ProviderConfig[], now: number): ProviderConfig[] {
  return configs.filter((cfg) => {
    const intervalMs = getEffectivePollIntervalMs(cfg.metadata);
    const lastChecked = getConfigLastCheckedAt(cfg.id);
    // 首次检查（lastChecked === 0）或已到达间隔
    return lastChecked === 0 || (now - lastChecked) >= intervalMs;
  });
}

/**
 * 计算下一个最近的 due 时间距现在的毫秒数
 * 仅考虑自定义间隔比全局间隔短的 config
 * 返回 null 表示不需要补充 tick
 */
function getNextSupplementaryDelayMs(
  configs: ProviderConfig[],
  now: number
): number | null {
  let earliest = Infinity;

  for (const cfg of configs) {
    const intervalMs = getEffectivePollIntervalMs(cfg.metadata);
    // 只关心比全局间隔短的自定义间隔
    if (intervalMs >= POLL_INTERVAL_MS) continue;

    const lastChecked = getConfigLastCheckedAt(cfg.id);
    if (lastChecked === 0) continue; // 首次检查已在本轮完成

    const nextDueAt = lastChecked + intervalMs;
    if (nextDueAt < earliest) {
      earliest = nextDueAt;
    }
  }

  if (!Number.isFinite(earliest)) return null;

  const delay = earliest - now;
  // 至少等 5 秒，避免过于频繁
  return delay > 5_000 ? delay : 5_000;
}

/**
 * 安排补充 tick（如果有比全局间隔更短的自定义间隔）
 */
function scheduleSupplementaryTick(
  activeConfigs: ProviderConfig[],
  now: number
): void {
  // 清除之前的补充定时器
  if (supplementaryTimer) {
    clearTimeout(supplementaryTimer);
    supplementaryTimer = undefined;
  }

  const delayMs = getNextSupplementaryDelayMs(activeConfigs, now);
  if (delayMs === null) return;

  // 如果补充 tick 的时间已经接近下一次全局 tick，就不安排了
  if (delayMs >= POLL_INTERVAL_MS - 2_000) return;

  supplementaryTimer = setTimeout(() => {
    supplementaryTimer = undefined;
    tick().catch((error) => console.error("[check-cx] 补充检测失败", error));
  }, delayMs);
}

/**
 * 执行一次轮询检查
 */
async function tick() {
  try {
    await ensurePollerLeadership();
  } catch (error) {
    console.error("[check-cx] 主节点选举失败，跳过本轮轮询", error);
    return;
  }
  if (!isPollerLeader()) {
    return;
  }
  // 原子操作：检查并设置运行状态
  if (globalThis.__checkCxPollerRunning) {
    const lastStartedAt = getLastPingStartedAt();
    const duration = lastStartedAt ? Date.now() - lastStartedAt : null;
    console.log(
      `[check-cx] 跳过 ping：上一轮仍在执行${
        duration !== null ? `（已耗时 ${duration}ms）` : ""
      }`
    );
    return;
  }
  globalThis.__checkCxPollerRunning = true;

  const startedAt = Date.now();
  setLastPingStartedAt(startedAt);

  try {
    const allConfigs = await loadProviderConfigsFromDB();
    // 过滤掉维护中的配置
    const activeConfigs = allConfigs.filter((cfg) => !cfg.is_maintenance);

    if (activeConfigs.length === 0) {
      return;
    }

    // 清理已不存在的 config 的检查时间记录
    pruneConfigLastChecked(new Set(activeConfigs.map((c) => c.id)));

    // 筛选本轮需要检查的 config
    const dueConfigs = filterDueConfigs(activeConfigs, startedAt);

    if (dueConfigs.length === 0) {
      // 没有到期的 config，但可能有自定义短间隔需要补充 tick
      scheduleSupplementaryTick(activeConfigs, startedAt);
      return;
    }

    const skippedCount = activeConfigs.length - dueConfigs.length;
    console.log(
      `[check-cx] 后台 ping 开始 · ${new Date(startedAt).toISOString()} · ` +
      `全局间隔=${POLL_INTERVAL_MS / 1000}s · ` +
      `本轮检查 ${dueConfigs.length} 个模型` +
      (skippedCount > 0 ? `（跳过 ${skippedCount} 个未到间隔）` : "")
    );

    const results = await runProviderChecks(dueConfigs);

    // 更新已检查 config 的时间戳
    const checkedIds = results.map((r) => r.id);
    setConfigLastCheckedAt(checkedIds, Date.now());

    console.log("[check-cx] 本轮检测明细：");
    results.forEach((result) => {
      const latency =
        typeof result.latencyMs === "number" ? `${result.latencyMs}ms` : "N/A";
      const pingLatency =
        typeof result.pingLatencyMs === "number"
          ? `${result.pingLatencyMs}ms`
          : "N/A";
      const sanitizedMessage = (result.message || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      // 查找对应 config 的自定义间隔
      const cfg = dueConfigs.find((c) => c.id === result.id);
      const intervalMs = cfg ? getEffectivePollIntervalMs(cfg.metadata) : POLL_INTERVAL_MS;
      console.log(
        `[check-cx]   · ${result.name}(${result.type}/${result.model}) -> ${
          result.status
        } | latency=${latency} | ping=${pingLatency} | interval=${
          intervalMs / 1000
        }s | message=${
          sanitizedMessage || "无"
        }`
      );
    });

    console.log(`[check-cx] 正在写入历史记录（${results.length} 条）…`);
    await historySnapshotStore.append(results);
    const providerCount = new Set(results.map((item) => item.id)).size;
    console.log(
      `[check-cx] 历史记录更新完成：providers=${providerCount}，本轮新增=${results.length}`
    );

    const statusCounts: Record<HealthStatus, number> = {
      operational: 0,
      degraded: 0,
      failed: 0,
      validation_failed: 0,
      maintenance: 0,
      error: 0,
    };
    results.forEach((result) => {
      statusCounts[result.status] += 1;
    });

    const elapsed = Date.now() - startedAt;
    console.log(
      `[check-cx] 本轮 ping 完成，用时 ${elapsed}ms；operational=${
        statusCounts.operational
      } degraded=${statusCounts.degraded} failed=${
        statusCounts.failed
      } error=${statusCounts.error}`
    );

    // 安排补充 tick（如果有比全局间隔更短的自定义间隔）
    scheduleSupplementaryTick(activeConfigs, Date.now());
  } catch (error) {
    console.error("[check-cx] 轮询检测失败", error);
  } finally {
    globalThis.__checkCxPollerRunning = false;
  }
}

// 自动初始化轮询器
if (!getPollerTimer()) {
  logStartupConfig();
  const firstCheckAt = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();
  console.log(
    `[check-cx] 初始化后台轮询器，首次检测预计 ${firstCheckAt}`
  );
  ensurePollerLeadership().catch((error) => {
    console.error("[check-cx] 初始化主节点选举失败", error);
  });
  const timer = setInterval(() => {
    tick().catch((error) => console.error("[check-cx] 定时检测失败", error));
  }, POLL_INTERVAL_MS);
  setPollerTimer(timer);

  // 启动官方状态轮询器
  startOfficialStatusPoller();
}
