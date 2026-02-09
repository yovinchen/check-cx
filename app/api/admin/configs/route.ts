import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import type { CheckConfigRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/configs - 获取所有配置（含禁用的）
 */
export async function GET(request: Request) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const db = await getDb();
  const { data, error } = await db
    .from<CheckConfigRow>("check_configs")
    .select("id, name, type, model, endpoint, api_key, enabled, is_maintenance, request_header, metadata, group_name, created_at, updated_at")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 遮蔽 API Key，只显示前8位和后4位
  const masked = (data ?? []).map((row) => ({
    ...row,
    api_key: maskKey(row.api_key),
  }));

  return NextResponse.json(masked);
}

/**
 * POST /api/admin/configs - 新增配置
 */
export async function POST(request: Request) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type, model, endpoint, api_key, enabled, is_maintenance, request_header, metadata, group_name } = body;

    if (!name || !type || !model || !endpoint || !api_key) {
      return NextResponse.json({ error: "缺少必填字段: name, type, model, endpoint, api_key" }, { status: 400 });
    }

    const db = await getDb();
    const { data, error } = await db
      .from("check_configs")
      .insert({
        name,
        type,
        model,
        endpoint,
        api_key,
        enabled: enabled ?? true,
        is_maintenance: is_maintenance ?? false,
        request_header: request_header || null,
        metadata: metadata || null,
        group_name: group_name || null,
      })
      .select("id, name, type, model, endpoint, enabled, is_maintenance, group_name, created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data?.[0] ?? {}, { status: 201 });
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}

function maskKey(key: string): string {
  if (!key || key.length <= 12) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
