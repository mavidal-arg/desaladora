import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAlerts } from "@/lib/oee";

// GET /api/oee/alerts → instancias de alerta
export async function GET() {
  return NextResponse.json(await listAlerts());
}

// PATCH → workflow reconocer/resolver {id, action:'ack'|'resolve', actionTaken?}
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "ack_alert")) return NextResponse.json({ error: "Sin permiso sobre alertas" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.id || !["ack", "resolve"].includes(b.action)) return NextResponse.json({ error: "Falta id/action(ack|resolve)" }, { status: 400 });
  const existing = await prisma.alertEvent.findUnique({ where: { id: b.id } });
  if (!existing) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (b.action === "ack") {
    if (existing.status !== "activa") return NextResponse.json({ error: "Solo se reconoce una alerta activa" }, { status: 409 });
    data.status = "reconocida"; data.ackBy = user.displayName; data.ackAt = new Date();
    if (b.actionTaken) data.actionTaken = b.actionTaken;
  } else {
    if (existing.status === "resuelta") return NextResponse.json({ error: "La alerta ya está resuelta" }, { status: 409 });
    data.status = "resuelta"; data.resolvedAt = new Date();
    data.actionTaken = b.actionTaken ?? existing.actionTaken ?? "Resuelta";
    if (!existing.ackBy) { data.ackBy = user.displayName; data.ackAt = new Date(); }
  }
  const row = await prisma.alertEvent.update({ where: { id: b.id }, data });
  return NextResponse.json(row);
}

// DELETE ?id=
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Sin permiso para eliminar" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.alertEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
