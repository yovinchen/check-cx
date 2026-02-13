/**
 * Prometheus 指标采集模块
 *
 * 从内存缓存中读取 Provider 最新状态、延迟和可用性统计，
 * 组装为 MetricLine[] 供序列化器输出。
 */

import "server-only";

import { historySnapshotStore } from "@/lib/database/history";
import { loadProviderConfigsFromDB } from "@/lib/database/config-loader";
import { getAvailabilityStats } from "@/lib/database/availability";
import type { AvailabilityStatsMap, HealthStatus, HistorySnapshot, ProviderConfig } from "@/lib/types";
import type { MetricLine, MetricValue } from "./prometheus";

/**
 * HealthStatus → 数值映射
 */
const STATUS_MAP: Record<HealthStatus, number> = {
  operational: 0,
  degraded: 1,
  failed: 2,
  validation_failed: 3,
  maintenance: 4,
  error: 5,
};

/**
 * 构建 Provider 公共 label
 */
function providerLabels(
  id: string,
  name: string,
  type: string,
  model: string,
  group: string
): Record<string, string> {
  return { id, name, type, model, group };
}

/**
 * 从历史快照中提取实时状态和延迟指标
 */
function collectProviderMetrics(
  snapshot: HistorySnapshot,
  configs: ProviderConfig[]
): MetricLine[] {
  const upValues: MetricValue[] = [];
  const statusValues: MetricValue[] = [];
  const latencyValues: MetricValue[] = [];
  const pingLatencyValues: MetricValue[] = [];

  // 用 config 列表构建 id → metadata 映射，确保 label 完整
  const configMap = new Map<string, ProviderConfig>();
  for (const cfg of configs) {
    configMap.set(cfg.id, cfg);
  }

  // 遍历所有有历史数据的 Provider
  for (const [id, items] of Object.entries(snapshot)) {
    if (items.length === 0) continue;

    const latest = items[0]; // 已按 checkedAt 倒序排列
    const cfg = configMap.get(id);
    const labels = providerLabels(
      id,
      latest.name,
      latest.type,
      latest.model,
      cfg?.groupName ?? latest.groupName ?? ""
    );

    upValues.push({
      labels,
      value: latest.status === "operational" ? 1 : 0,
    });

    statusValues.push({
      labels,
      value: STATUS_MAP[latest.status] ?? 5,
    });

    if (latest.latencyMs !== null) {
      latencyValues.push({ labels, value: latest.latencyMs });
    }

    if (latest.pingLatencyMs !== null) {
      pingLatencyValues.push({ labels, value: latest.pingLatencyMs });
    }
  }

  // 补充维护中但无历史记录的 Provider
  for (const cfg of configs) {
    if (snapshot[cfg.id]) continue;
    if (!cfg.is_maintenance) continue;

    const labels = providerLabels(
      cfg.id,
      cfg.name,
      cfg.type,
      cfg.model,
      cfg.groupName ?? ""
    );

    upValues.push({ labels, value: 0 });
    statusValues.push({ labels, value: STATUS_MAP.maintenance });
  }

  return [
    {
      name: "model_monitor_provider_up",
      help: "Provider 是否正常 (1=operational, 0=其他)",
      type: "gauge",
      values: upValues,
    },
    {
      name: "model_monitor_provider_status",
      help: "Provider 状态枚举值 (0=operational, 1=degraded, 2=failed, 3=validation_failed, 4=maintenance, 5=error)",
      type: "gauge",
      values: statusValues,
    },
    {
      name: "model_monitor_provider_latency_ms",
      help: "最近一次首 token 延迟 (毫秒)",
      type: "gauge",
      values: latencyValues,
    },
    {
      name: "model_monitor_provider_ping_latency_ms",
      help: "最近一次端点 Ping 延迟 (毫秒)",
      type: "gauge",
      values: pingLatencyValues,
    },
  ];
}

/**
 * 从可用性统计中提取可用率指标
 */
function collectAvailabilityMetrics(
  statsMap: AvailabilityStatsMap,
  snapshot: HistorySnapshot,
  configs: ProviderConfig[]
): MetricLine[] {
  const values: MetricValue[] = [];

  // 构建 id → metadata 映射
  const metaMap = new Map<string, { name: string; type: string; model: string; group: string }>();
  for (const cfg of configs) {
    metaMap.set(cfg.id, {
      name: cfg.name,
      type: cfg.type,
      model: cfg.model,
      group: cfg.groupName ?? "",
    });
  }
  // 补充来自 snapshot 的元数据（以防 config 缓存不全）
  for (const [id, items] of Object.entries(snapshot)) {
    if (metaMap.has(id) || items.length === 0) continue;
    const latest = items[0];
    metaMap.set(id, {
      name: latest.name,
      type: latest.type,
      model: latest.model,
      group: latest.groupName ?? "",
    });
  }

  for (const [id, stats] of Object.entries(statsMap)) {
    const meta = metaMap.get(id);
    if (!meta) continue;

    for (const stat of stats) {
      if (stat.availabilityPct === null) continue;

      values.push({
        labels: {
          id,
          name: meta.name,
          type: meta.type,
          model: meta.model,
          group: meta.group,
          period: stat.period,
        },
        value: stat.availabilityPct,
      });
    }
  }

  return [
    {
      name: "model_monitor_provider_availability_pct",
      help: "Provider 可用率百分比",
      type: "gauge",
      values,
    },
  ];
}

/**
 * 采集所有 Prometheus 指标
 * 仅包含启用检查的 Provider（enabled = true）
 */
export async function collectAllMetrics(): Promise<MetricLine[]> {
  // loadProviderConfigsFromDB 只返回 enabled = true 的配置
  const configs = await loadProviderConfigsFromDB();

  // 只查询启用配置的 id，排除已禁用的历史数据
  const activeIds = new Set(configs.map((c) => c.id));

  const [snapshot, availabilityStats] = await Promise.all([
    historySnapshotStore.fetch({ allowedIds: activeIds, limitPerConfig: 1 }),
    getAvailabilityStats(activeIds),
  ]);

  const providerMetrics = collectProviderMetrics(snapshot, configs);
  const availabilityMetrics = collectAvailabilityMetrics(
    availabilityStats,
    snapshot,
    configs
  );

  return [...providerMetrics, ...availabilityMetrics];
}
