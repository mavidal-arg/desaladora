import { NextResponse } from "next/server";
import { getTwinSummary } from "@/lib/desal";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twin/cip-alert — northbound del Gemelo Digital.
// El flow de Node-RED lo consulta periódicamente y publica el resultado como
// alerta prescriptiva en el UNS (.../CIP/Action/cipAlert). Devuelve el tren más
// próximo al umbral de ensuciamiento, los días restantes (RUL) y si la alerta
// está activa (días ≤ 14 → CIP inminente). [cita] SOP §Verificación e2e.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getTwinSummary();
  const { cip, thresholds } = summary;
  const days = cip.days;
  const alert = days != null && days <= 14; // ventana de acción prescriptiva

  return NextResponse.json({
    ts: Date.now(),
    alert,
    severity: days == null ? "none" : days <= 7 ? "critical" : days <= 14 ? "warning" : "ok",
    nextTrainCode: cip.nextTrainCode,
    days,
    trigger: cip.trigger,
    lastEvent: cip.lastEvent,
    thresholds,
    racks: summary.racks.map((r) => ({ code: r.code, cipDays: r.cipDays, trend: r.trend, health: r.health })),
  });
}
