# Change: 优化延迟趋势图数据密度渲染

## Why

当前延迟趋势图为每个数据点都渲染圆点（dot），在长周期（7天/15天/30天）数据量较大时，数百个圆点密密麻麻挤在一起，视觉上毫无可读性，失去了趋势图的意义。

## What Changes

- 实现智能数据采样：根据图表宽度动态决定显示的数据点数量
- 优化圆点显示策略：只在关键点（状态变化、极值）显示圆点，而非每个数据点
- 保持 tooltip 功能：采样后仍能通过 hover 查看具体数据

## Impact

- Affected specs: 无现有 spec（新增 dashboard-visualization spec）
- Affected code: `components/history-trend-chart.tsx`
