import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listDowntime } from "@/lib/oee";
import { RO_TRAINS, subCausesOf, type DowntimeType, type DowntimeCause } from "@/lib/oee-types";

const TYPES: DowntimeType[] = ["planificada", "no_planificada"];
const CAUSES: DowntimeCause[] = ["mecanica", "electrica", "instrumentacion", "proceso", "externa"];

/**
 * La sub-causa tiene que pertenecer a SU categoría: un "scaling" con causa
 * "electrica" no es un dato incompleto, es un dato falso — y el Pareto lo
 * mostraría como si fuera real. Vacío se acepta (queda "sin clasificar").
 */
const validSubCause = (cause: DowntimeCause, sub: unknown): boolean =>
  sub == null || sub === "" || (typeof sub === "string" && subCausesOf(cause).some((x) => x.code === sub));

const durationOf = (start?: string | null, end?: string | null): number | null =>
  start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : null;

// GET /api/oee/downtime → registro de paradas
export async function GET() {
  return NextResponse.json(await listDowntime());
}

// POST → registrar parada (log_downtime)
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "log_downtime")) return NextResponse.json({ error: "Sin permiso para registrar paradas" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b || !RO_TRAINS.includes(b.trainCode) || !TYPES.includes(b.type) || !CAUSES.includes(b.cause) || !b.startTime || !b.description)
    return NextResponse.json({ error: "Datos inválidos: trainCode, type, cause, startTime y description son requeridos" }, { status: 400 });
  if (!validSubCause(b.cause, b.subCause))
    return NextResponse.json({ error: `La causa raíz "${b.subCause}" no pertenece a la categoría "${b.cause}"` }, { status: 400 });

  const row = await prisma.downtimeEvent.create({
    data: {
      trainCode: b.trainCode, type: b.type, cause: b.cause, subCause: b.subCause || null,
      startTime: new Date(b.startTime), endTime: b.endTime ? new Date(b.endTime) : null,
      durationMin: durationOf(b.startTime, b.endTime),
      description: b.description, createdBy: user.displayName, shiftId: b.shiftId ?? null,
    },
  });
  return NextResponse.json(row, { status: 201 });
}

// PATCH → editar o validar parada (validate_downtime para validar)
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const existing = await prisma.downtimeEvent.findUnique({ where: { id: b.id } });
  if (!existing) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (b.validate === true) {
    if (!can(user.role, "validate_downtime")) return NextResponse.json({ error: "Solo Supervisor/Planificador valida paradas" }, { status: 403 });
    data.validated = true; data.validatedBy = user.displayName;
  } else {
    if (!can(user.role, "log_downtime")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    if (b.type && TYPES.includes(b.type)) data.type = b.type;
    if (b.cause && CAUSES.includes(b.cause)) data.cause = b.cause;
    if (b.subCause !== undefined) {
      // La sub-causa se valida contra la causa RESULTANTE, no contra la vieja:
      // si el editor cambia las dos a la vez, lo que importa es que queden coherentes.
      const effective = (data.cause ?? existing.cause) as DowntimeCause;
      if (!validSubCause(effective, b.subCause))
        return NextResponse.json({ error: `La causa raíz "${b.subCause}" no pertenece a la categoría "${effective}"` }, { status: 400 });
      data.subCause = b.subCause || null;
    }
    if (b.description) data.description = b.description;
    const start = b.startTime ?? existing.startTime.toISOString();
    const end = b.endTime !== undefined ? b.endTime : existing.endTime?.toISOString() ?? null;
    if (b.startTime !== undefined) data.startTime = new Date(start);
    if (b.endTime !== undefined) data.endTime = end ? new Date(end) : null;
    if (b.startTime !== undefined || b.endTime !== undefined) data.durationMin = durationOf(start, end);
  }
  const row = await prisma.downtimeEvent.update({ where: { id: b.id }, data });
  return NextResponse.json(row);
}

// DELETE ?id= → eliminar (validate_downtime)
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "validate_downtime")) return NextResponse.json({ error: "Sin permiso para eliminar" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.downtimeEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
