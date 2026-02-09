import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/notifications - 获取所有通知
 */
export async function GET(request: Request) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const db = await getDb();
  const { data, error } = await db
    .from("system_notifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

/**
 * POST /api/admin/notifications - 新增通知
 */
export async function POST(request: Request) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { message, level, is_active } = await request.json();
    if (!message) {
      return NextResponse.json({ error: "缺少 message 字段" }, { status: 400 });
    }

    const db = await getDb();
    const { data, error } = await db
      .from("system_notifications")
      .insert({
        message,
        level: level || "info",
        is_active: is_active ?? true,
      })
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data?.[0] ?? {}, { status: 201 });
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
