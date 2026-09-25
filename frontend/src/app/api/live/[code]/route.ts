import { NextResponse } from "next/server";
import { getLiveSignals } from "@/lib/live-signals";

export const dynamic = "force-dynamic";

// GET /api/live/[code] → todas las señales "vivas" de un activo (instrumento +
// virtuales del gemelo), desde la fuente única. Lo pollean /ar y la ficha 360.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const signals = await getLiveSignals(decodeURIComponent(code));
  return NextResponse.json({ code: decodeURIComponent(code), signals, updatedAt: new Date().toISOString() });
}
