"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { adminFetch } from "./admin-api";

interface NotificationRow {
  id: string;
  message: string;
  level: string;
  is_active: boolean;
  created_at: string;
}

const LEVELS = [
  { value: "info", label: "信息", color: "bg-blue-500/10 text-blue-600" },
  { value: "warning", label: "警告", color: "bg-yellow-500/10 text-yellow-600" },
  { value: "error", label: "错误", color: "bg-red-500/10 text-red-600" },
];

export function NotificationManager({ token }: { token: string }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ message: "", level: "info", is_active: true });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchNotifications = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const { data, error: err } = await adminFetch<NotificationRow[]>("/api/admin/notifications", token);
    if (err) setError(err);
    else { setNotifications(data ?? []); setError(""); }
    if (showLoader) setLoading(false);
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return notifications.filter((n) => {
      if (filterLevel && n.level !== filterLevel) return false;
      if (filterActive === "active" && !n.is_active) return false;
      if (filterActive === "inactive" && n.is_active) return false;
      if (q && !n.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, search, filterLevel, filterActive]);

  const allSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((n) => n.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const batchAction = async (action: string, data?: Record<string, unknown>) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchLoading(true);
    const { error: err } = await adminFetch("/api/admin/batch", token, {
      method: "POST",
      body: JSON.stringify({ action, table: "system_notifications", ids, data }),
    });
    if (err) setError(err);
    else { setSelected(new Set()); await fetchNotifications(false); }
    setBatchLoading(false);
  };

  const handleBatchDelete = () => {
    if (!confirm(`确定删除选中的 ${selected.size} 条通知？`)) return;
    batchAction("delete");
  };

  const openCreate = () => {
    setForm({ message: "", level: "info", is_active: true });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (n: NotificationRow) => {
    setForm({ message: n.message, level: n.level, is_active: n.is_active });
    setEditingId(n.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    if (editingId) {
      const { error: err } = await adminFetch(`/api/admin/notifications/${editingId}`, token, {
        method: "PUT", body: JSON.stringify(form),
      });
      if (err) { setError(err); setSaving(false); return; }
    } else {
      const { error: err } = await adminFetch("/api/admin/notifications", token, {
        method: "POST", body: JSON.stringify(form),
      });
      if (err) { setError(err); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    fetchNotifications(false);
  };

  // 乐观更新
  const handleToggle = async (n: NotificationRow) => {
    const newVal = !n.is_active;
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_active: newVal } : x));
    const { error: err } = await adminFetch(`/api/admin/notifications/${n.id}`, token, {
      method: "PUT", body: JSON.stringify({ is_active: newVal }),
    });
    if (err) { setError(err); await fetchNotifications(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此通知？")) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error: err } = await adminFetch(`/api/admin/notifications/${id}`, token, { method: "DELETE" });
    if (err) { setError(err); await fetchNotifications(false); }
  };

  if (loading) return <div className="text-muted-foreground animate-pulse">加载通知中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-medium shrink-0">系统通知 ({filtered.length}/{notifications.length})</h2>
        <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索通知内容..."
            className="px-2 py-1.5 text-sm border rounded bg-background w-48"
          />
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
            className="px-2 py-1.5 text-sm border rounded bg-background">
            <option value="">全部级别</option>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)}
            className="px-2 py-1.5 text-sm border rounded bg-background">
            <option value="">全部状态</option>
            <option value="active">已激活</option>
            <option value="inactive">未激活</option>
          </select>
          <button onClick={openCreate}
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 transition-opacity shrink-0">
            + 新增通知
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md text-sm">
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
          <button onClick={() => batchAction("update", { is_active: true })} disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-background transition-colors">批量激活</button>
          <button onClick={() => batchAction("update", { is_active: false })} disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-background transition-colors">批量停用</button>
          <button onClick={handleBatchDelete} disabled={batchLoading}
            className="px-2 py-1 text-xs border rounded text-destructive hover:bg-destructive/10 transition-colors">批量删除</button>
          <button onClick={() => setSelected(new Set())}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">取消选择</button>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">关闭</button>
        </div>
      )}

      {showForm && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="font-medium text-sm">{editingId ? "编辑通知" : "新增通知"}</h3>
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground">通知内容 * (支持 Markdown)</span>
              <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background h-20 resize-y" placeholder="输入通知内容..." />
            </label>
            <div className="flex gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">级别</span>
                <select value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-background">
                  {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </label>
              <label className="flex items-end gap-2 text-sm pb-1">
                <input type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} className="rounded" />
                激活显示
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 text-sm bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? "保存中..." : "保存"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
            <span className="text-xs text-muted-foreground">全选</span>
          </div>
        )}
        {filtered.map((n) => {
          const levelInfo = LEVELS.find((l) => l.value === n.level) ?? LEVELS[0];
          return (
            <div key={n.id} className={`border rounded-lg p-3 transition-colors ${n.is_active ? "" : "opacity-50"} ${selected.has(n.id) ? "bg-muted/20 border-foreground/20" : ""}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleOne(n.id)}
                  className="rounded mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 text-xs rounded ${levelInfo.color}`}>{levelInfo.label}</span>
                    <span className={`text-xs ${n.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                      {n.is_active ? "已激活" : "未激活"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleToggle(n)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {n.is_active ? "停用" : "激活"}
                  </button>
                  <button onClick={() => openEdit(n)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">编辑</button>
                  <button onClick={() => handleDelete(n.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors">删除</button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            {notifications.length === 0 ? "暂无通知" : "没有匹配的通知"}
          </div>
        )}
      </div>
    </div>
  );
}
