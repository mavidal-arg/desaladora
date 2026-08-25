import { NextResponse } from "next/server";
import { getUfSummary } from "@/lib/uf";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/twin/ceb-alert — northbound del gemelo de ULTRAFILTRACIÓN.
//
// Espejo de /api/twin/cip-alert, pero para el otro régimen de regeneración: el
// flow de Node-RED lo consulta periódicamente y publica el resultado en el UNS
// (.../UF/Action/cebAlert). Devuelve el skid más próximo al umbral de caída de
// permeabilidad y las HORAS restantes.
//
// La ventana de acción es de horas, no de días: el ciclo de CEB dura horas
// (ADV-129-00-DGM-PL-002 NOTA 5), mientras que el de CIP de los trenes RO dura
// semanas. Usar los mismos cortes que el CIP dejaría la alerta siempre activa.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getUfSummary();
  const { ceb, thresholds } = summary;
  const hours = ceb.hours;
  const alert = hours != null && hours <= 4; // ventana de acción prescriptiva

  return NextResponse.json({
    ts: Date.now(),
    alert,
    severity: hours == null ? "none" : hours <= 2 ? "critical" : hours <= 4 ? "warning" : "ok",
    nextSkidCode: ceb.nextSkidCode,
    hours,
    trigger: ceb.trigger,
    avgCycleH: ceb.avgCycleH,
    lastEvent: ceb.lastEvent,
    thresholds,
    skids: summary.skids.map((s) => ({
      code: s.code,
      regime: s.regime,
      cebHours: s.cebHours,
      k: s.k,
      tmp: s.tmp,
      trend: s.trend,
      health: s.health,
    })),
  });
}
