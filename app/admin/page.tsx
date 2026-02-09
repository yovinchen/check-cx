"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminLogin } from "@/components/admin/admin-login";
import { ConfigManager } from "@/components/admin/config-manager";
import { NotificationManager } from "@/components/admin/notification-manager";

type Tab = "configs" | "notifications";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("configs");
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token");
    if (saved) {
      setToken(saved); // eslint-disable-line react-hooks/set-state-in-effect -- restore session
    }
    setIsChecking(false);
  }, []);

  const handleLogin = useCallback((key: string) => {
    sessionStorage.setItem("admin_token", key);
    setToken(key);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("admin_token");
    setToken(null);
  }, []);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "configs", label: "服务配置" },
    { key: "notifications", label: "系统通知" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-[90rem] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← 返回面板
            </Link>
            <h1 className="text-lg font-semibold">Check CX 管理后台</h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            退出登录
          </button>
        </div>
      </header>

      <div className="max-w-[90rem] mx-auto px-6 py-4">
        <nav className="flex gap-1 border-b mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "configs" && <ConfigManager token={token} />}
        {activeTab === "notifications" && <NotificationManager token={token} />}
      </div>
    </div>
  );
}
