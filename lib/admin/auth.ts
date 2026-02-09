/**
 * 管理后台鉴权工具
 */

import "server-only";

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

/**
 * 验证管理员密钥
 */
export function validateAdminKey(key: string | null | undefined): boolean {
  if (!ADMIN_SECRET_KEY) {
    console.warn("[check-cx] ADMIN_SECRET_KEY 未配置，管理后台不可用");
    return false;
  }
  return key === ADMIN_SECRET_KEY;
}

/**
 * 从请求头中提取并验证管理员密钥
 */
export function authenticateRequest(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  return validateAdminKey(authHeader.slice(7));
}
