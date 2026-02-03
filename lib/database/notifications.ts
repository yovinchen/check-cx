import "server-only";
import { getDb } from "@/lib/db";
import { SystemNotificationRow } from "@/lib/types/database";

/**
 * 服务端获取所有活跃的系统通知
 */
export async function getActiveSystemNotifications(): Promise<SystemNotificationRow[]> {
  const db = await getDb();

  const { data, error } = await db
    .from<SystemNotificationRow>("system_notifications")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch system notifications:", error);
    return [];
  }

  return data as SystemNotificationRow[];
}
