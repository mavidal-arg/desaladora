import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { evaluateAndDispatch, type MetricPoint } from "@/lib/alert-evaluator";

// La alerta de demo dispara sobre este punto: es la métrica que tiene una
// regla real esperándola (rule_cip_critical, seed.ts) y la que el presentador
// puede narrar sin inventar nada ("al tren A25-2 le quedan 3 días de CIP").
const DEMO_OVERRIDE: MetricPoint = { metric: "cip_days", trainCode: "A25-2", value: 3 };

// POST /api/twin/evaluate-alerts { mode: "poll" | "demo" }
//
// "poll": evaluación silenciosa contra el estado real — la llama el hook de
// /alertas cada ~8s. Cualquier usuario autenticado puede dispararla, no muta
// nada que el usuario no pueda ya ver.
//
// "demo": fuerza un cruce de umbral determinístico para la demo de venta —
// gateado por manage_alert_rules porque dispara un envío real (costo por
// WhatsApp/llamada).
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }

  const b = await req.json().catch(() => null);
  const mode = b?.mode === "demo" ? "demo" : "poll";

  if (mode === "demo" && !can(user.role, "manage_alert_rules")) {
    return NextResponse.json({ error: "Solo Supervisor/Planificador dispara la alerta de demo" }, { status: 403 });
  }

  const { created } = await evaluateAndDispatch(mode === "demo" ? { override: DEMO_OVERRIDE } : undefined);
  return NextResponse.json({ created });
}
