/**
 * 管理后台 API 请求工具
 */

export async function adminFetch<T = unknown>(
  url: string,
  token: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { data: null, error: body.error || `请求失败 (${res.status})` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: "网络错误" };
  }
}
