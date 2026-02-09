"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { adminFetch } from "./admin-api";

interface ConfigRow {
  id: string;
  name: string;
  type: string;
  model: string;
  endpoint: string;
  api_key: string;
  enabled: boolean;
  is_maintenance: boolean;
  request_header: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ConfigFormData {
  name: string;
  type: string;
  model: string;
  endpoint: string;
  api_key: string;
  enabled: boolean;
  is_maintenance: boolean;
  request_header: string;
  metadata: string;
  group_name: string;
  degraded_threshold_ms: string;
  timeout_ms: string;
  poll_interval_seconds: string;
}

const EMPTY_FORM: ConfigFormData = {
  name: "",
  type: "openai",
  model: "",
  endpoint: "",
  api_key: "",
  enabled: true,
  is_maintenance: false,
  request_header: "",
  metadata: "",
  group_name: "",
  degraded_threshold_ms: "",
  timeout_ms: "",
  poll_interval_seconds: "",
};

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
];

export function ConfigManager({ token }: { token: string }) {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ConfigFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchThreshold, setShowBatchThreshold] = useState(false);
  const [batchThresholdMs, setBatchThresholdMs] = useState("");
  const [batchTimeoutMs, setBatchTimeoutMs] = useState("");
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [batchConfig, setBatchConfig] = useState({
    endpoint: "", type: "", group_name: "", api_key: "",
    degraded_threshold_ms: "", timeout_ms: "", poll_interval_seconds: "",
    request_header: "", metadata: "",
  });

  const fetchConfigs = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const { data, error: err } = await adminFetch<ConfigRow[]>("/api/admin/configs", token);
    if (err) setError(err);
    else { setConfigs(data ?? []); setError(""); }
    if (showLoader) setLoading(false);
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // 搜索 + 筛选
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return configs.filter((c) => {
      if (filterType && c.type !== filterType) return false;
      if (filterGroup && (c.group_name || "") !== filterGroup) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        c.endpoint.toLowerCase().includes(q) ||
        (c.group_name || "").toLowerCase().includes(q)
      );
    });
  }, [configs, search, filterType, filterGroup]);

  const groupNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of configs) if (c.group_name) set.add(c.group_name);
    return Array.from(set).sort();
  }, [configs]);

  // 选择
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 批量操作
  const batchAction = async (action: string, data?: Record<string, unknown>) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchLoading(true);
    const { error: err } = await adminFetch("/api/admin/batch", token, {
      method: "POST",
      body: JSON.stringify({ action, table: "check_configs", ids, data }),
    });
    if (err) setError(err);
    else { setSelected(new Set()); await fetchConfigs(false); }
    setBatchLoading(false);
  };

  const handleBatchDelete = () => {
    if (!confirm(`确定删除选中的 ${selected.size} 条配置？关联的历史记录也会被删除。`)) return;
    batchAction("delete");
  };

  // 批量设置阈值/超时
  const handleBatchThreshold = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const patch: Record<string, number> = {};
    if (batchThresholdMs.trim()) {
      const v = Number(batchThresholdMs);
      if (!Number.isFinite(v) || v < 100 || v > 120000) {
        setError("降级阈值范围: 100 ~ 120000 ms"); return;
      }
      patch.degraded_threshold_ms = v;
    }
    if (batchTimeoutMs.trim()) {
      const v = Number(batchTimeoutMs);
      if (!Number.isFinite(v) || v < 1000 || v > 300000) {
        setError("超时时间范围: 1000 ~ 300000 ms"); return;
      }
      patch.timeout_ms = v;
    }
    if (Object.keys(patch).length === 0) {
      setError("请至少填写一个阈值"); return;
    }

    setBatchLoading(true);
    const { error: err } = await adminFetch("/api/admin/batch", token, {
      method: "POST",
      body: JSON.stringify({ action: "merge_metadata", table: "check_configs", ids, data: patch }),
    });
    if (err) setError(err);
    else {
      setSelected(new Set());
      setShowBatchThreshold(false);
      setBatchThresholdMs("");
      setBatchTimeoutMs("");
      await fetchConfigs(false);
    }
    setBatchLoading(false);
  };

  // 批量填写配置
  const handleBatchConfig = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const directUpdate: Record<string, unknown> = {};
    const metaPatch: Record<string, number> = {};

    if (batchConfig.endpoint.trim()) directUpdate.endpoint = batchConfig.endpoint.trim();
    if (batchConfig.type) directUpdate.type = batchConfig.type;
    if (batchConfig.group_name.trim()) directUpdate.group_name = batchConfig.group_name.trim();
    if (batchConfig.api_key.trim()) directUpdate.api_key = batchConfig.api_key.trim();

    if (batchConfig.request_header.trim()) {
      try { directUpdate.request_header = JSON.parse(batchConfig.request_header); }
      catch { setError("自定义请求头不是有效的 JSON"); return; }
    }
    if (batchConfig.metadata.trim()) {
      try { directUpdate.metadata = JSON.parse(batchConfig.metadata); }
      catch { setError("自定义 Metadata 不是有效的 JSON"); return; }
    }

    if (batchConfig.degraded_threshold_ms.trim()) {
      const v = Number(batchConfig.degraded_threshold_ms);
      if (!Number.isFinite(v) || v < 100 || v > 120000) {
        setError("降级阈值范围: 100 ~ 120000 ms"); return;
      }
      metaPatch.degraded_threshold_ms = v;
    }
    if (batchConfig.timeout_ms.trim()) {
      const v = Number(batchConfig.timeout_ms);
      if (!Number.isFinite(v) || v < 1000 || v > 300000) {
        setError("超时时间范围: 1000 ~ 300000 ms"); return;
      }
      metaPatch.timeout_ms = v;
    }
    if (batchConfig.poll_interval_seconds.trim()) {
      const v = Number(batchConfig.poll_interval_seconds);
      if (!Number.isFinite(v) || v < 15 || v > 3600) {
        setError("轮询间隔范围: 15 ~ 3600 秒"); return;
      }
      metaPatch.poll_interval_seconds = v;
    }

    const hasDirectUpdate = Object.keys(directUpdate).length > 0;
    const hasMetaPatch = Object.keys(metaPatch).length > 0;
    if (!hasDirectUpdate && !hasMetaPatch) {
      setError("请至少填写一个字段"); return;
    }

    setBatchLoading(true);
    if (hasDirectUpdate) {
      const { error: err } = await adminFetch("/api/admin/batch", token, {
        method: "POST",
        body: JSON.stringify({ action: "update", table: "check_configs", ids, data: directUpdate }),
      });
      if (err) { setError(err); setBatchLoading(false); return; }
    }
    if (hasMetaPatch) {
      const { error: err } = await adminFetch("/api/admin/batch", token, {
        method: "POST",
        body: JSON.stringify({ action: "merge_metadata", table: "check_configs", ids, data: metaPatch }),
      });
      if (err) { setError(err); setBatchLoading(false); return; }
    }

    setSelected(new Set());
    setShowBatchConfig(false);
    setBatchConfig({ endpoint: "", type: "", group_name: "", api_key: "", degraded_threshold_ms: "", timeout_ms: "", poll_interval_seconds: "", request_header: "", metadata: "" });
    await fetchConfigs(false);
    setBatchLoading(false);
  };

  // 单条操作 — 乐观更新
  const handleToggle = async (config: ConfigRow, field: "enabled" | "is_maintenance") => {
    const newVal = !config[field];
    setConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, [field]: newVal } : c));
    const { error: err } = await adminFetch(`/api/admin/configs/${config.id}`, token, {
      method: "PUT",
      body: JSON.stringify({ [field]: newVal }),
    });
    if (err) { setError(err); await fetchConfigs(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除配置「${name}」？关联的历史记录也会被删除。`)) return;
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    const { error: err } = await adminFetch(`/api/admin/configs/${id}`, token, { method: "DELETE" });
    if (err) { setError(err); await fetchConfigs(false); }
  };

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (config: ConfigRow) => {
    // 从 metadata 中提取阈值配置，剩余的作为通用 metadata
    const meta = config.metadata ? { ...config.metadata } : {};
    const thresholdMs = meta.degraded_threshold_ms;
    const timeoutMs = meta.timeout_ms;
    const pollInterval = meta.poll_interval_seconds;
    delete meta.degraded_threshold_ms;
    delete meta.timeout_ms;
    delete meta.poll_interval_seconds;
    const hasOtherMeta = Object.keys(meta).length > 0;

    setForm({
      name: config.name, type: config.type, model: config.model,
      endpoint: config.endpoint, api_key: "", enabled: config.enabled,
      is_maintenance: config.is_maintenance,
      request_header: config.request_header ? JSON.stringify(config.request_header, null, 2) : "",
      metadata: hasOtherMeta ? JSON.stringify(meta, null, 2) : "",
      group_name: config.group_name || "",
      degraded_threshold_ms: thresholdMs != null ? String(thresholdMs) : "",
      timeout_ms: timeoutMs != null ? String(timeoutMs) : "",
      poll_interval_seconds: pollInterval != null ? String(pollInterval) : "",
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const payload: Record<string, unknown> = {
      name: form.name, type: form.type, model: form.model,
      endpoint: form.endpoint, enabled: form.enabled,
      is_maintenance: form.is_maintenance, group_name: form.group_name || null,
    };
    if (form.api_key) payload.api_key = form.api_key;
    if (form.request_header.trim()) {
      try { payload.request_header = JSON.parse(form.request_header); }
      catch { setError("request_header 不是有效的 JSON"); setSaving(false); return; }
    } else { payload.request_header = null; }
    if (form.metadata.trim()) {
      try { payload.metadata = JSON.parse(form.metadata); }
      catch { setError("metadata 不是有效的 JSON"); setSaving(false); return; }
    } else { payload.metadata = null; }

    // 将阈值设置合并到 metadata 中
    const mergedMeta: Record<string, unknown> = (payload.metadata as Record<string, unknown>) ?? {};
    if (form.degraded_threshold_ms.trim()) {
      const v = Number(form.degraded_threshold_ms);
      if (!Number.isFinite(v) || v < 100 || v > 120000) {
        setError("降级阈值范围: 100 ~ 120000 ms"); setSaving(false); return;
      }
      mergedMeta.degraded_threshold_ms = v;
    }
    if (form.timeout_ms.trim()) {
      const v = Number(form.timeout_ms);
      if (!Number.isFinite(v) || v < 1000 || v > 300000) {
        setError("超时时间范围: 1000 ~ 300000 ms"); setSaving(false); return;
      }
      mergedMeta.timeout_ms = v;
    }
    if (form.poll_interval_seconds.trim()) {
      const v = Number(form.poll_interval_seconds);
      if (!Number.isFinite(v) || v < 15 || v > 3600) {
        setError("轮询间隔范围: 15 ~ 3600 秒"); setSaving(false); return;
      }
      mergedMeta.poll_interval_seconds = v;
    }
    payload.metadata = Object.keys(mergedMeta).length > 0 ? mergedMeta : null;

    if (editingId) {
      const { error: err } = await adminFetch(`/api/admin/configs/${editingId}`, token, {
        method: "PUT", body: JSON.stringify(payload),
      });
      if (err) { setError(err); setSaving(false); return; }
    } else {
      if (!form.api_key) { setError("新建配置必须填写 API Key"); setSaving(false); return; }
      payload.api_key = form.api_key;
      const { error: err } = await adminFetch("/api/admin/configs", token, {
        method: "POST", body: JSON.stringify(payload),
      });
      if (err) { setError(err); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    fetchConfigs(false);
  };

  const updateField = (field: keyof ConfigFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return <div className="text-muted-foreground animate-pulse">加载配置中...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-medium shrink-0">
          服务配置 ({filtered.length}/{configs.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称/模型/端点/分组..."
            className="px-2 py-1.5 text-sm border rounded bg-background w-56"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1.5 text-sm border rounded bg-background"
          >
            <option value="">全部类型</option>
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="px-2 py-1.5 text-sm border rounded bg-background"
          >
            <option value="">全部分组</option>
            {groupNames.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 transition-opacity shrink-0"
          >
            + 新增
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md text-sm flex-wrap">
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
          <button
            onClick={() => batchAction("update", { enabled: true })}
            disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-background transition-colors"
          >
            批量启用
          </button>
          <button
            onClick={() => batchAction("update", { enabled: false })}
            disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-background transition-colors"
          >
            批量禁用
          </button>
          <button
            onClick={() => batchAction("update", { is_maintenance: true })}
            disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-background transition-colors"
          >
            批量维护
          </button>
          <button
            onClick={() => setShowBatchThreshold((v) => !v)}
            disabled={batchLoading}
            className={`px-2 py-1 text-xs border rounded transition-colors ${showBatchThreshold ? "bg-foreground text-background" : "hover:bg-background"}`}
          >
            批量阈值
          </button>
          <button
            onClick={() => setShowBatchConfig((v) => !v)}
            disabled={batchLoading}
            className={`px-2 py-1 text-xs border rounded transition-colors ${showBatchConfig ? "bg-foreground text-background" : "hover:bg-background"}`}
          >
            批量填写
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded text-destructive hover:bg-destructive/10 transition-colors"
          >
            批量删除
          </button>
          <button
            onClick={() => { setSelected(new Set()); setShowBatchThreshold(false); setShowBatchConfig(false); }}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 批量阈值设置面板 */}
      {showBatchThreshold && selected.size > 0 && (
        <div className="border rounded-lg p-3 bg-card space-y-3">
          <h3 className="text-sm font-medium">批量设置阈值/超时（已选 {selected.size} 项）</h3>
          <p className="text-xs text-muted-foreground">仅填写需要修改的字段，留空的字段不会被覆盖</p>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">降级阈值 (ms, 100~120000)</span>
              <input
                type="number" value={batchThresholdMs}
                onChange={(e) => setBatchThresholdMs(e.target.value)}
                className="w-40 px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="6000" min={100} max={120000} step={100}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">超时时间 (ms, 1000~300000)</span>
              <input
                type="number" value={batchTimeoutMs}
                onChange={(e) => setBatchTimeoutMs(e.target.value)}
                className="w-40 px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="45000" min={1000} max={300000} step={1000}
              />
            </label>
            <button
              onClick={handleBatchThreshold}
              disabled={batchLoading}
              className="px-3 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {batchLoading ? "应用中..." : "应用"}
            </button>
            <button
              onClick={() => { setShowBatchThreshold(false); setBatchThresholdMs(""); setBatchTimeoutMs(""); }}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 批量填写配置面板 */}
      {showBatchConfig && selected.size > 0 && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="text-sm font-medium">批量填写配置（已选 {selected.size} 项）</h3>
          <p className="text-xs text-muted-foreground">仅填写需要修改的字段，留空的字段不会被覆盖</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Endpoint</span>
              <input value={batchConfig.endpoint}
                onChange={(e) => setBatchConfig((p) => ({ ...p, endpoint: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="https://api.openai.com/v1/chat/completions" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">类型</span>
              <select value={batchConfig.type}
                onChange={(e) => setBatchConfig((p) => ({ ...p, type: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background">
                <option value="">不修改</option>
                {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">分组</span>
              <input value={batchConfig.group_name}
                onChange={(e) => setBatchConfig((p) => ({ ...p, group_name: e.target.value }))}
                list="batch-group-name-options"
                className="w-full px-2 py-1.5 text-sm border rounded bg-background"
                placeholder="选择或输入分组名" />
              <datalist id="batch-group-name-options">
                {groupNames.map((g) => <option key={g} value={g} />)}
              </datalist>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">API Key</span>
              <input type="password" value={batchConfig.api_key}
                onChange={(e) => setBatchConfig((p) => ({ ...p, api_key: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="留空不修改" autoComplete="off" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">降级阈值 (ms, 100~120000)</span>
              <input type="number" value={batchConfig.degraded_threshold_ms}
                onChange={(e) => setBatchConfig((p) => ({ ...p, degraded_threshold_ms: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="6000" min={100} max={120000} step={100} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">超时时间 (ms, 1000~300000)</span>
              <input type="number" value={batchConfig.timeout_ms}
                onChange={(e) => setBatchConfig((p) => ({ ...p, timeout_ms: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="45000" min={1000} max={300000} step={1000} />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-muted-foreground">轮询间隔 (秒, 15~3600，留空使用全局默认值)</span>
              <input type="number" value={batchConfig.poll_interval_seconds}
                onChange={(e) => setBatchConfig((p) => ({ ...p, poll_interval_seconds: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="60" min={15} max={3600} step={5} />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-muted-foreground">自定义请求头 (JSON，可选)</span>
              <textarea value={batchConfig.request_header}
                onChange={(e) => setBatchConfig((p) => ({ ...p, request_header: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono h-16 resize-y"
                placeholder='{"User-Agent": "check-cx"}' />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-muted-foreground">自定义 Metadata (JSON，可选)</span>
              <textarea value={batchConfig.metadata}
                onChange={(e) => setBatchConfig((p) => ({ ...p, metadata: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono h-16 resize-y"
                placeholder='{"temperature": 0.7}' />
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleBatchConfig} disabled={batchLoading}
              className="px-4 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
              {batchLoading ? "应用中..." : "应用"}
            </button>
            <button onClick={() => {
              setShowBatchConfig(false);
              setBatchConfig({ endpoint: "", type: "", group_name: "", api_key: "", degraded_threshold_ms: "", timeout_ms: "", poll_interval_seconds: "", request_header: "", metadata: "" });
            }} className="px-4 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors">
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">关闭</button>
        </div>
      )}

      {showForm && (
        <ConfigForm
          form={form} isEditing={!!editingId} saving={saving} groupNames={groupNames}
          onUpdate={updateField} onSave={handleSave} onCancel={() => setShowForm(false)}
        />
      )}

      {/* 表格 */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="rounded" />
              </th>
              <th className="text-left px-3 py-2 font-medium">名称</th>
              <th className="text-left px-3 py-2 font-medium">类型</th>
              <th className="text-left px-3 py-2 font-medium">模型</th>
              <th className="text-left px-3 py-2 font-medium">分组</th>
              <th className="text-left px-3 py-2 font-medium">API Key</th>
              <th className="text-center px-3 py-2 font-medium">阈值/超时</th>
              <th className="text-center px-3 py-2 font-medium">轮询间隔</th>
              <th className="text-center px-3 py-2 font-medium">启用</th>
              <th className="text-center px-3 py-2 font-medium">维护</th>
              <th className="text-right px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((config) => (
              <tr key={config.id} className={`hover:bg-muted/30 transition-colors ${selected.has(config.id) ? "bg-muted/20" : ""}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(config.id)} onChange={() => toggleOne(config.id)} className="rounded" />
                </td>
                <td className="px-3 py-2 font-medium">{config.name}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 text-xs rounded bg-muted">{config.type}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{config.model}</td>
                <td className="px-3 py-2 text-muted-foreground">{config.group_name || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{config.api_key}</td>
                <td className="px-3 py-2 text-center">
                  <ThresholdBadge metadata={config.metadata} />
                </td>
                <td className="px-3 py-2 text-center">
                  <PollIntervalBadge metadata={config.metadata} />
                </td>
                <td className="px-3 py-2 text-center">
                  <ToggleSwitch on={config.enabled} color="bg-green-500" onClick={() => handleToggle(config, "enabled")} />
                </td>
                <td className="px-3 py-2 text-center">
                  <ToggleSwitch on={config.is_maintenance} color="bg-yellow-500" onClick={() => handleToggle(config, "is_maintenance")} />
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => openEdit(config)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">编辑</button>
                  <button onClick={() => handleDelete(config.id, config.name)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">删除</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  {configs.length === 0 ? "暂无配置，点击「新增」添加" : "没有匹配的配置"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThresholdBadge({ metadata }: { metadata: Record<string, unknown> | null }) {
  const threshold = metadata?.degraded_threshold_ms;
  const timeout = metadata?.timeout_ms;
  if (threshold == null && timeout == null) {
    return <span className="text-xs text-muted-foreground">默认</span>;
  }
  return (
    <span className="text-xs font-mono text-muted-foreground">
      {threshold != null && <span title="降级阈值">{Number(threshold) / 1000}s</span>}
      {threshold != null && timeout != null && " / "}
      {timeout != null && <span title="超时时间">{Number(timeout) / 1000}s</span>}
    </span>
  );
}

function PollIntervalBadge({ metadata }: { metadata: Record<string, unknown> | null }) {
  const interval = metadata?.poll_interval_seconds;
  if (interval == null) {
    return <span className="text-xs text-muted-foreground">全局</span>;
  }
  const seconds = Number(interval);
  const label = seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
  return (
    <span className="text-xs font-mono text-muted-foreground" title={`自定义轮询间隔: ${seconds} 秒`}>
      {label}
    </span>
  );
}

function ToggleSwitch({ on, color, onClick }: { on: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-5 rounded-full transition-colors relative ${on ? color : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "left-3.5" : "left-0.5"}`} />
    </button>
  );
}

function ConfigForm({
  form, isEditing, saving, groupNames, onUpdate, onSave, onCancel,
}: {
  form: ConfigFormData;
  isEditing: boolean;
  saving: boolean;
  groupNames: string[];
  onUpdate: (field: keyof ConfigFormData, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card space-y-3">
      <h3 className="font-medium text-sm">{isEditing ? "编辑配置" : "新增配置"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">名称 *</span>
          <input value={form.name} onChange={(e) => onUpdate("name", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background" placeholder="如: OpenAI GPT-4o-mini" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">类型 *</span>
          <select value={form.type} onChange={(e) => onUpdate("type", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background">
            {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">模型 *</span>
          <input value={form.model} onChange={(e) => onUpdate("model", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background" placeholder="如: gpt-4o-mini" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">分组</span>
          <input value={form.group_name} onChange={(e) => onUpdate("group_name", e.target.value)}
            list="group-name-options"
            className="w-full px-2 py-1.5 text-sm border rounded bg-background" placeholder="选择或输入分组名" />
          <datalist id="group-name-options">
            {groupNames.map((g) => <option key={g} value={g} />)}
          </datalist>
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-xs text-muted-foreground">Endpoint *</span>
          <input value={form.endpoint} onChange={(e) => onUpdate("endpoint", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
            placeholder="https://api.openai.com/v1/chat/completions" />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-xs text-muted-foreground">API Key {isEditing ? "(留空则不修改)" : "*"}</span>
          <input type="password" value={form.api_key} onChange={(e) => onUpdate("api_key", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
            placeholder={isEditing ? "留空保持不变" : "sk-..."} autoComplete="off" />
        </label>
        <div className="col-span-2 border-t pt-3 mt-1">
          <span className="text-xs font-medium text-muted-foreground">性能阈值设置</span>
          <p className="text-xs text-muted-foreground mb-2">留空使用全局默认值（降级: 6000ms，超时: 45000ms，轮询间隔: 全局值）</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">降级阈值 (ms, 100~120000)</span>
              <input type="number" value={form.degraded_threshold_ms}
                onChange={(e) => onUpdate("degraded_threshold_ms", e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="6000" min={100} max={120000} step={100} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">超时时间 (ms, 1000~300000)</span>
              <input type="number" value={form.timeout_ms}
                onChange={(e) => onUpdate("timeout_ms", e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="45000" min={1000} max={300000} step={1000} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">轮询间隔 (秒, 15~3600)</span>
              <input type="number" value={form.poll_interval_seconds}
                onChange={(e) => onUpdate("poll_interval_seconds", e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono"
                placeholder="60" min={15} max={3600} step={5} />
            </label>
          </div>
        </div>
        <label className="space-y-1 col-span-2">
          <span className="text-xs text-muted-foreground">自定义请求头 (JSON，可选)</span>
          <textarea value={form.request_header} onChange={(e) => onUpdate("request_header", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono h-16 resize-y"
            placeholder='{"User-Agent": "check-cx"}' />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-xs text-muted-foreground">自定义 Metadata (JSON，可选)</span>
          <textarea value={form.metadata} onChange={(e) => onUpdate("metadata", e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background font-mono h-16 resize-y"
            placeholder='{"temperature": 0.7}' />
        </label>
        <div className="col-span-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => onUpdate("enabled", e.target.checked)} className="rounded" />
            启用检测
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_maintenance} onChange={(e) => onUpdate("is_maintenance", e.target.checked)} className="rounded" />
            维护模式
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onSave} disabled={saving}
          className="px-4 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors">取消</button>
      </div>
    </div>
  );
}
