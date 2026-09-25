import { NextResponse } from "next/server";
import { getTwinLive } from "@/lib/desal";

export const dynamic = "force-dynamic";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// GET /api/twin/live → física viva por rack RO, con el shape TwinLive que consume
// useTwinLive (rf/tmp/sec como LiveValue + foulFrac). rf/rfNorm en ×10¹³/m.
export async function GET() {
  const live = await getTwinLive();
  const out: Record<string, unknown> = {};
  for (const [code, m] of Object.entries(live)) {
    const rf13 = m.rf / 1e13;
    out[code] = {
      rf: {
        value: Math.round(rf13 * 100) / 100,
        unit: "×10¹³/m",
        label: "Rf fouling",
        pct: clamp((m.foulFrac / 0.15) * 100, 0, 100),
      },
      tmp: {
        value: Math.round(m.tmp * 10) / 10,
        unit: "bar",
        label: "TMP",
        pct: clamp(((m.tmp - 45) / (68 - 45)) * 100, 0, 100),
      },
      sec: {
        value: Math.round(m.sec * 100) / 100,
        unit: "kWh/m³",
        label: "SEC",
        pct: clamp(((m.sec - 2.5) / (3.6 - 2.5)) * 100, 0, 100),
      },
      foulFrac: Math.round(m.foulFrac * 1000) / 1000,
    };
  }
  return NextResponse.json(out);
}
