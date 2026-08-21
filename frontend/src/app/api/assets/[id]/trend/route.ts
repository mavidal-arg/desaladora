import { NextResponse } from "next/server";
import { pi } from "@/lib/adapters";

// GET /api/assets/[id]/trend?signal=bearingVibration&days=14 → time series for one signal.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const signal = url.searchParams.get("signal");
  if (!signal) return NextResponse.json({ error: "signal query param required" }, { status: 400 });

  const days = Number(url.searchParams.get("days") ?? 14);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);

  const points = await pi.getTrend(id, signal, from.toISOString(), to.toISOString());
  return NextResponse.json({ signal, points });
}
