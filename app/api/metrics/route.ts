import { NextResponse } from "next/server";

import { collectAllMetrics } from "@/lib/metrics/collect";
import { serializeMetrics } from "@/lib/metrics/prometheus";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await collectAllMetrics();
    const body = serializeMetrics(metrics);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[check-cx] Prometheus metrics 采集失败", error);
    return NextResponse.json(
      { error: "metrics collection failed" },
      { status: 500 }
    );
  }
}
