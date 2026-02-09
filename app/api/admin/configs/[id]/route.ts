import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/configs/[id] - 更新配置
 */
export async function PUT(request: Request, { params }: RouteParams) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    const allowedFields = [
      "name", "type", "model", "endpoint", "api_key",
      "enabled", "is_maintenance", "request_header", "metadata", "group_name",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
    }

    const db = await getDb();
    const { data, error } = await db
      .from("check_configs")
      .update(updateData)
      .eq("id", id)
      .select("id, name, type, model, endpoint, enabled, is_maintenance, group_name, updated_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }

    return NextResponse.json(data[0]);
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/configs/[id] - 删除配置
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();
  const { data, error } = await db
    .from("check_configs")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
