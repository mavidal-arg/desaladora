import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAlertRules } from "@/lib/oee";
import { ALERT_METRIC_LABELS, RO_TRAINS } from "@/lib/oee-types";
import { UF_CODES } from "@/lib/uf";

const LEVELS = ["critico", "advertencia", "info"];
const OPS = ["lt", "gt"];

// GET /api/oee/alert-rules
export async function GET() {
  return NextResponse.json(await listAlertRules());
}

// POST → crear/actualizar regla (manage_alert_rules)
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Solo Supervisor/Planificador gestiona reglas" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.name || !ALERT_METRIC_LABELS[b.metric] || !OPS.includes(b.op) || !LEVELS.includes(b.level) || typeof b.threshold !== "number")
    return NextResponse.json({ error: "Datos inválidos: name, metric, op(lt|gt), threshold, level" }, { status: 400 });
  // UF (skids A12-x) tiene su propio namespace de código, distinto de los
  // trenes RO (A25-x) — cip_days es RO, ceb_hours es UF.
  const validTrains: readonly string[] = b.metric === "ceb_hours" ? UF_CODES : RO_TRAINS;
  if (b.trainCode && !validTrains.includes(b.trainCode))
    return NextResponse.json({ error: "trainCode inválido" }, { status: 400 });

  const id: string = b.id || `rule_${Date.now()}`;
  const data = {
    name: b.name, metric: b.metric, op: b.op, threshold: b.threshold,
    level: b.level, enabled: b.enabled ?? true, trainCode: b.trainCode ?? null,
  };
  const row = await prisma.alertRule.upsert({ where: { id }, update: data, create: { id, ...data } });
  return NextResponse.json(row, { status: b.id ? 200 : 201 });
}

// PATCH → habilitar/deshabilitar rápido {id, enabled}
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.id || typeof b.enabled !== "boolean") return NextResponse.json({ error: "Falta id/enabled" }, { status: 400 });
  const row = await prisma.alertRule.update({ where: { id: b.id }, data: { enabled: b.enabled } });
  return NextResponse.json(row);
}

// DELETE ?id=
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.alertRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
