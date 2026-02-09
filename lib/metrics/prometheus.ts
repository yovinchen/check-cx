/**
 * Prometheus text format 序列化器
 * 零依赖实现，仅支持 Gauge/Counter 类型
 */

export interface MetricValue {
  labels: Record<string, string>;
  value: number;
}

export interface MetricLine {
  name: string;
  help: string;
  type: "gauge" | "counter";
  values: MetricValue[];
}

/**
 * 转义 Prometheus HELP 文本中的特殊字符
 */
function escapeHelpText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

/**
 * 转义 Prometheus label 值中的特殊字符
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * 将 labels 对象格式化为 Prometheus label 字符串
 * 例: {id="abc", name="GPT-4o"}
 */
function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const parts = entries.map(
    ([k, v]) => `${k}="${escapeLabelValue(v)}"`
  );
  return `{${parts.join(",")}}`;
}

/**
 * 将 MetricLine[] 序列化为 Prometheus exposition format 文本
 */
export function serializeMetrics(metrics: MetricLine[]): string {
  const lines: string[] = [];

  for (const metric of metrics) {
    if (metric.values.length === 0) continue;

    lines.push(`# HELP ${metric.name} ${escapeHelpText(metric.help)}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    for (const { labels, value } of metric.values) {
      const labelStr = formatLabels(labels);
      lines.push(`${metric.name}${labelStr} ${value}`);
    }

    lines.push("");
  }

  // Prometheus 规范要求末尾以换行符结尾
  return lines.join("\n") + "\n";
}
