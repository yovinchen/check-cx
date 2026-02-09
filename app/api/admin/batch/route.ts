import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/batch - 批量操作
 *
 * Body: { action, table, ids, data? }
 * - action: "delete" | "update" | "merge_metadata"
 * - table: "check_configs" | "system_notifications"
 * - ids: string[]
 * - data: Record<string, unknown> (update / merge_metadata 时需要)
 *
 * merge_metadata: 将 data 中的键值合并到 metadata JSONB 字段，不覆盖其他键
 */
export async function POST(request: Request) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { action, table, ids, data } = await request.json();

    const allowedTables = ["check_configs", "system_notifications"];
    if (!allowedTables.includes(table)) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids 不能为空" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: "单次最多操作 100 条" }, { status: 400 });
    }

    const db = await getDb();

    if (action === "delete") {
      const { error } = await db.from(table).delete().in("id", ids);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, affected: ids.length });
    }

    if (action === "update") {
      if (!data || typeof data !== "object") {
        return NextResponse.json({ error: "update 操作需要 data 字段" }, { status: 400 });
      }
      const { error } = await db.from(table).update(data).in("id", ids);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, affected: ids.length });
    }

    // 合并 metadata：使用 COALESCE(metadata, '{}') || patch 保留已有键
    if (action === "merge_metadata") {
      if (!data || typeof data !== "object") {
        return NextResponse.json({ error: "merge_metadata 操作需要 data 字段" }, { status: 400 });
      }
      if (!db.query) {
        return NextResponse.json({ error: "当前数据库适配器不支持 merge_metadata" }, { status: 500 });
      }
      const patch = JSON.stringify(data).replace(/'/g, "''");
      const idList = ids.map((id: string) => `'${id.replace(/'/g, "''")}'`).join(",");
      const schema = process.env.DATABASE_SCHEMA || "public";
      const qualifiedTable = `"${schema}"."${table}"`;
      const sql = `UPDATE ${qualifiedTable} SET metadata = COALESCE(metadata, '{}'::jsonb) || '${patch}'::jsonb WHERE id IN (${idList})`;
      const { error } = await db.query(sql);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, affected: ids.length });
    }

    return NextResponse.json({ error: "无效的 action，支持: delete, update, merge_metadata" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
