/**
 * 数据库连接工厂
 *
 * 根据环境变量选择使用 postgres.js 或 Supabase 适配器
 */

import "server-only";
import type { DatabaseAdapter } from "./types";

type AdapterFactory = () => DatabaseAdapter;

let _adapter: DatabaseAdapter | null = null;
let _adapterFactory: AdapterFactory | null = null;

/**
 * 获取数据库提供者类型
 */
export function getDatabaseProvider(): "postgres" | "supabase" {
  const provider = process.env.DATABASE_PROVIDER?.toLowerCase();
  if (provider === "postgres" || provider === "pg") {
    return "postgres";
  }
  return "supabase";
}

/**
 * 延迟加载适配器工厂
 */
async function loadAdapterFactory(): Promise<AdapterFactory> {
  const provider = getDatabaseProvider();

  if (provider === "postgres") {
    const { createPostgresAdapter } = await import("./adapters/postgres");
    return createPostgresAdapter;
  } else {
    const { createSupabaseAdapter } = await import("./adapters/supabase");
    return createSupabaseAdapter;
  }
}

/**
 * 获取数据库适配器实例（单例）
 *
 * 用法:
 * ```ts
 * const db = await getDb();
 * const { data, error } = await db.from("check_configs").select("*");
 * ```
 */
export async function getDb(): Promise<DatabaseAdapter> {
  if (!_adapter) {
    if (!_adapterFactory) {
      _adapterFactory = await loadAdapterFactory();
    }
    _adapter = _adapterFactory();
  }
  return _adapter;
}

/**
 * 同步获取数据库适配器（需要先调用 initDb）
 *
 * @throws 如果未初始化则抛出错误
 */
export function getDbSync(): DatabaseAdapter {
  if (!_adapter) {
    throw new Error("数据库适配器未初始化，请先调用 initDb()");
  }
  return _adapter;
}

/**
 * 初始化数据库适配器
 *
 * 在应用启动时调用，用于提前加载适配器
 */
export async function initDb(): Promise<void> {
  await getDb();
}

/**
 * 重置数据库适配器（仅用于测试）
 */
export function resetDb(): void {
  _adapter = null;
  _adapterFactory = null;
}
