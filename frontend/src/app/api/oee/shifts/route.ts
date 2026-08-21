import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listShifts } from "@/lib/oee";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

// GET /api/oee/shifts → turnos y metas
export async function GET() {
  return NextResponse.json(await listShifts());
}

// POST → crear/actualizar turno (manage_shifts)
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_shifts")) return NextResponse.json({ error: "Solo Supervisor/Planificador gestiona turnos" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.name) return NextResponse.json({ error: "Falta name" }, { status: 400 });
  const id: string = b.id || `shift_${Date.now()}`;
  const data = {
    name: b.name,
    startHour: Math.round(num(b.startHour, 7)) % 24,
    endHour: Math.round(num(b.endHour, 19)) % 24,
    targetM3h: num(b.targetM3h, 300),
    oeeTarget: num(b.oeeTarget, 85),
    oeeAcceptable: num(b.oeeAcceptable, 75),
    oeeCritical: num(b.oeeCritical, 60),
  };
  const row = await prisma.shiftDef.upsert({ where: { id }, update: data, create: { id, ...data } });
  return NextResponse.json(row, { status: b.id ? 200 : 201 });
}

// DELETE ?id=
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_shifts")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.shiftDef.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
