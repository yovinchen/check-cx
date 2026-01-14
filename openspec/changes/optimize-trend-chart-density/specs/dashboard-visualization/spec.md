## ADDED Requirements

### Requirement: 延迟趋势图数据密度优化

系统 SHALL 在渲染延迟趋势图时，根据数据量自动优化显示密度，确保图表在任何数据量下都具有可读性。

#### Scenario: 数据点超过阈值时进行采样

- **WHEN** 趋势数据点数量超过 `MAX_VISIBLE_DOTS`（默认 60）
- **THEN** 系统应对数据进行等间隔采样，减少渲染点数
- **AND** 采样时保留首尾点、状态变化点、延迟极值点

#### Scenario: 数据点未超过阈值时保持原样

- **WHEN** 趋势数据点数量 <= `MAX_VISIBLE_DOTS`
- **THEN** 系统应保持原有渲染行为，显示所有数据点

### Requirement: 智能圆点显示

系统 SHALL 只在关键数据点显示圆点标记，避免视觉杂乱。

#### Scenario: 关键点显示圆点

- **WHEN** 数据点为状态变化点（与前一点状态不同）
- **OR** 数据点为延迟最大值或最小值
- **THEN** 该点应显示圆点标记

#### Scenario: 普通点不显示圆点

- **WHEN** 数据点为普通连续点（状态未变化、非极值）
- **AND** 总数据点超过阈值
- **THEN** 该点不应显示圆点标记，仅通过折线连接

### Requirement: Tooltip 数据完整性

系统 SHALL 在 hover 时显示该点的完整信息，即使该点未显示圆点。

#### Scenario: Hover 显示详情

- **WHEN** 用户 hover 到图表任意位置
- **THEN** 应显示最近数据点的状态、延迟、时间戳
