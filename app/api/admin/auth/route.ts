import { NextResponse } from "next/server";
import { validateAdminKey } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auth - 验证管理员密钥
 */
export async function POST(request: Request) {
  try {
    const { key } = await request.json();
    if (validateAdminKey(key)) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "密钥无效" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }
}
