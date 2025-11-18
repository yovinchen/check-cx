/**
 * 官方状态轮询器
 * 独立于 Provider 检查,按固定间隔检查各 Provider 的官方服务状态
 */

import type { ProviderType, OfficialStatusResult } from "../types";
import { checkAllOfficialStatuses } from "../official-status";
import { getOfficialStatusIntervalMs } from "./polling-config";
import { logError } from "../utils/error-handler";

/**
 * 官方状态缓存
 * 使用 Map 存储每个 Provider 的最新官方状态
 */
const officialStatusCache = new Map<ProviderType, OfficialStatusResult>();

/**
 * 轮询器运行标志
 * 防止重复创建定时器(Next.js 热重载场景)
 */
let pollingTimerId: NodeJS.Timeout | null = null;
let isPolling = false;

/**
 * 获取指定 Provider 的官方状态(从缓存)
 * @param type - Provider 类型
 * @returns 官方状态结果,如果未缓存则返回 undefined
 */
export function getOfficialStatus(
  type: ProviderType
): OfficialStatusResult | undefined {
  return officialStatusCache.get(type);
}

/**
 * 获取所有 Provider 的官方状态缓存
 */
export function getAllOfficialStatuses(): Map<
  ProviderType,
  OfficialStatusResult
> {
  return new Map(officialStatusCache);
}

/**
 * 执行一次官方状态检查
 * 更新所有 Provider 的官方状态缓存
 */
async function runOfficialStatusCheck(): Promise<void> {
  if (isPolling) {
    console.log(
      "[官方状态] 跳过本次检查(上次检查仍在进行中)..."
    );
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    console.log("[官方状态] 开始检查官方服务状态...");

    // 获取所有需要检查的 Provider 类型
    const allTypes: ProviderType[] = ["openai", "gemini", "anthropic"];

    // 并发检查所有 Provider 的官方状态
    const results = await checkAllOfficialStatuses(allTypes);

    // 更新缓存
    results.forEach((result, type) => {
      officialStatusCache.set(type, result);
      console.log(
        `[官方状态] ${type}: ${result.status} - ${result.message}`
      );
    });

    const duration = Date.now() - startTime;
    console.log(`[官方状态] 检查完成,耗时 ${duration}ms`);
  } catch (error) {
    logError("runOfficialStatusCheck", error);
    console.error("[官方状态] 检查失败:", error);
  } finally {
    isPolling = false;
  }
}

/**
 * 启动官方状态轮询器
 * 在模块加载时自动调用,不对外暴露
 */
export function startOfficialStatusPoller(): void {
  if (pollingTimerId !== null) {
    console.log("[官方状态] 轮询器已在运行,跳过启动");
    return;
  }

  const intervalMs = getOfficialStatusIntervalMs();
  console.log(
    `[官方状态] 启动轮询器,间隔 ${intervalMs / 1000} 秒...`
  );

  // 立即执行一次检查
  runOfficialStatusCheck().catch((error) => {
    logError("startOfficialStatusPoller.initial", error);
  });

  // 设置定时器
  pollingTimerId = setInterval(() => {
    runOfficialStatusCheck().catch((error) => {
      logError("startOfficialStatusPoller.interval", error);
    });
  }, intervalMs);
}

/**
 * 停止官方状态轮询器(用于测试或清理)
 */
export function stopOfficialStatusPoller(): void {
  if (pollingTimerId !== null) {
    clearInterval(pollingTimerId);
    pollingTimerId = null;
    console.log("[官方状态] 轮询器已停止");
  }
}
