"use client";

import { useState } from "react";

interface AdminLoginProps {
  onLogin: (key: string) => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });

      if (res.ok) {
        onLogin(key.trim());
      } else {
        setError("密钥无效，请重试");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2">Check CX 管理后台</h1>
          <p className="text-sm text-muted-foreground">请输入管理密钥以继续</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入管理密钥 (ADMIN_SECRET_KEY)"
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full px-4 py-2 bg-foreground text-background rounded-md font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "验证中..." : "登录"}
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          密钥配置于环境变量 ADMIN_SECRET_KEY
        </p>
      </div>
    </div>
  );
}
