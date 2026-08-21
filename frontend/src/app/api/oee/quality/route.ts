import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listQuality } from "@/lib/oee";
import { RO_TRAINS, QUALITY_LIMITS } from "@/lib/oee-types";

/** Evalúa una medición contra los límites de spec → conforme | no_conforme. */
export function evalQuality(m: { conductivity: number; tds: number; ph: number; boron: number }): string {
  const ok =
    m.conductivity <= QUALITY_LIMITS.conductivityMax &&
    m.tds <= QUALITY_LIMITS.tdsMax &&
    m.ph >= QUALITY_LIMITS.phMin && m.ph <= QUALITY_LIMITS.phMax &&
    m.boron <= QUALITY_LIMITS.boronMax;
  return ok ? "conforme" : "no_conforme";
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : NaN);

// GET /api/oee/quality → mediciones de calidad del permeado
export async function GET() {
  return NextResponse.json(await listQuality());
}

// POST → registrar medición de calidad (log_quality)
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "log_quality")) return NextResponse.json({ error: "Sin permiso para registrar calidad" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const m = { conductivity: num(b?.conductivity), tds: num(b?.tds), ph: num(b?.ph), boron: num(b?.boron) };
  if (!b || !RO_TRAINS.includes(b.trainCode) || Object.values(m).some((v) => Number.isNaN(v)))
    return NextResponse.json({ error: "Datos inválidos: trainCode + conductivity/tds/ph/boron numéricos" }, { status: 400 });

  const row = await prisma.qualityReading.create({
    data: {
      trainCode: b.trainCode, ts: b.ts ? new Date(b.ts) : new Date(),
      ...m, status: evalQuality(m), notes: b.notes ?? "",
      createdBy: user.displayName, shiftId: b.shiftId ?? null,
    },
  });
  return NextResponse.json(row, { status: 201 });
}

// PATCH → editar medición (recomputa status)
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "log_quality")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const existing = await prisma.qualityReading.findUnique({ where: { id: b.id } });
  if (!existing) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const m = {
    conductivity: typeof b.conductivity === "number" ? b.conductivity : existing.conductivity,
    tds: typeof b.tds === "number" ? b.tds : existing.tds,
    ph: typeof b.ph === "number" ? b.ph : existing.ph,
    boron: typeof b.boron === "number" ? b.boron : existing.boron,
  };
  const row = await prisma.qualityReading.update({
    where: { id: b.id },
    data: { ...m, status: evalQuality(m), notes: b.notes ?? existing.notes },
  });
  return NextResponse.json(row);
}

// DELETE ?id=
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "log_quality")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.qualityReading.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
