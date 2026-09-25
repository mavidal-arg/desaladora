import { prisma } from "@/lib/prisma";
import type { NonConformity } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tratamiento de hallazgos (NonConformity) — sumario, edición, transición de
// estado y recurrencia por equipo. Vive aparte de `adapters/seSuite.ts` porque
// no espeja ningún sistema externo (SE Suite no tiene este ciclo de tratamiento
// hoy): es lógica propia de la app, mismo criterio que `oee.ts`/`alert-evaluator.ts`.
//
// `NonConformityAction` es un log append-only: sirve tanto de auditoría por
// hallazgo (qué se hizo y quién) como de fuente de recurrencia por equipo
// ("cuántas veces se levantó esta observación" = COUNT de action="created"
// agrupado por equipmentId+findingType) — no hay una tabla de conteo aparte.
// ─────────────────────────────────────────────────────────────────────────────

export const FINDING_TYPES = ["corrosion", "fuga_sello", "vibracion", "otro"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  corrosion: "Corrosión",
  fuga_sello: "Fuga / sello",
  vibracion: "Vibración anormal",
  otro: "Otro",
};

export function normalizeFindingType(v: unknown): FindingType {
  return (FINDING_TYPES as readonly string[]).includes(v as string) ? (v as FindingType) : "otro";
}

export type FindingActionRow = {
  id: string;
  nonConformityId: string;
  equipmentId: string;
  findingType: string;
  action: "created" | "edited" | "status_changed" | "note";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  changedFields: Record<string, [unknown, unknown]> | null;
  actor: string;
  actorRole: string | null;
  createdAt: string;
};

function toActionRow(a: {
  id: string; nonConformityId: string; equipmentId: string; findingType: string; action: string;
  fromStatus: string | null; toStatus: string | null; note: string | null; changedFields: unknown;
  actor: string; actorRole: string | null; createdAt: Date;
}): FindingActionRow {
  return {
    id: a.id, nonConformityId: a.nonConformityId, equipmentId: a.equipmentId, findingType: a.findingType,
    action: a.action as FindingActionRow["action"], fromStatus: a.fromStatus, toStatus: a.toStatus,
    note: a.note, changedFields: (a.changedFields as FindingActionRow["changedFields"]) ?? null,
    actor: a.actor, actorRole: a.actorRole, createdAt: a.createdAt.toISOString(),
  };
}

/** Historial completo de un hallazgo puntual, más reciente primero. */
export async function listFindingActions(nonConformityId: string): Promise<FindingActionRow[]> {
  const rows = await prisma.nonConformityAction.findMany({
    where: { nonConformityId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toActionRow);
}

/**
 * Registra la creación de un hallazgo — la llama `POST /api/ar/observation`
 * en la misma transacción que crea la `NonConformity`, así el conteo de
 * recurrencia arranca desde el primer hallazgo, no sólo desde el primer
 * tratamiento.
 */
export function createdActionData(nc: { id: string; equipmentId: string; findingType: string }, actor: string, actorRole: string | null) {
  return {
    nonConformityId: nc.id,
    equipmentId: nc.equipmentId,
    findingType: nc.findingType,
    action: "created" as const,
    toStatus: "open",
    actor,
    actorRole,
  };
}

export type TreatInput =
  | {
      id: string; action: "status_change";
      toStatus: "open" | "in_review" | "closed";
      treatmentOutcome?: "resolved" | "false_positive";
      note?: string;
    }
  | {
      id: string; action: "edit";
      description?: string; severity?: string; findingType?: string; note?: string;
    };

export class TreatmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Aplica un tratamiento (edición o transición de estado) a un hallazgo y dejar
 * registro en `NonConformityAction`, todo en una transacción. Mismo espíritu
 * que `PATCH /api/oee/alerts`, adaptado a los 3 estados de NonConformity.
 */
export async function treatNonConformity(
  input: TreatInput,
  actor: { displayName: string; role: string },
): Promise<NonConformity> {
  const existing = await prisma.nonConformity.findUnique({ where: { id: input.id } });
  if (!existing) throw new TreatmentError("Hallazgo no encontrado", 404);

  const ncUpdate: Record<string, unknown> = {};
  const actionData: Record<string, unknown> = {
    nonConformityId: existing.id,
    equipmentId: existing.equipmentId,
    findingType: existing.findingType,
    actor: actor.displayName,
    actorRole: actor.role,
  };

  if (input.action === "status_change") {
    if (input.toStatus === "closed" && !input.treatmentOutcome) {
      throw new TreatmentError("Al cerrar hay que indicar resultado (resuelto o falso positivo)");
    }
    ncUpdate.status = input.toStatus;
    if (input.toStatus === "closed") ncUpdate.treatmentOutcome = input.treatmentOutcome;
    if (input.note) ncUpdate.treatmentNote = input.note;
    Object.assign(actionData, {
      action: "status_changed",
      fromStatus: existing.status,
      toStatus: input.toStatus,
      note: input.note ?? null,
    });
  } else {
    const changed: Record<string, [unknown, unknown]> = {};
    if (input.description != null && input.description !== existing.description) {
      changed.description = [existing.description, input.description];
      ncUpdate.description = input.description;
    }
    if (input.severity != null && input.severity !== existing.severity) {
      changed.severity = [existing.severity, input.severity];
      ncUpdate.severity = input.severity;
    }
    if (input.findingType != null) {
      const ft = normalizeFindingType(input.findingType);
      if (ft !== existing.findingType) {
        changed.findingType = [existing.findingType, ft];
        ncUpdate.findingType = ft;
        actionData.findingType = ft; // el log de esta acción ya queda con la categoría corregida
      }
    }
    if (Object.keys(changed).length === 0 && !input.note) {
      throw new TreatmentError("No hay cambios para aplicar");
    }
    if (input.note) ncUpdate.treatmentNote = input.note;
    Object.assign(actionData, {
      action: "edited",
      note: input.note ?? null,
      changedFields: Object.keys(changed).length ? changed : undefined,
    });
  }

  const [row] = await prisma.$transaction([
    prisma.nonConformity.update({ where: { id: existing.id }, data: ncUpdate }),
    prisma.nonConformityAction.create({ data: actionData as never }),
  ]);

  return {
    id: row.id, code: row.code, assetId: row.equipmentId, severity: row.severity as NonConformity["severity"],
    description: row.description, status: row.status as NonConformity["status"], findingType: row.findingType,
    treatmentOutcome: row.treatmentOutcome as NonConformity["treatmentOutcome"], treatmentNote: row.treatmentNote,
    raisedAt: row.raisedAt.toISOString(), raisedBy: row.raisedBy, raisedByRole: row.raisedByRole,
  };
}

export type FindingSummary = {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  /** Abiertos o en revisión con severidad alta/crítica — dispara el banner global. */
  openHighOrCritical: number;
};

/** Agregados livianos para el banner global y las cards del sumario. */
export async function getFindingSummary(): Promise<FindingSummary> {
  const [bySeverityRows, byStatusRows, openHighOrCritical] = await Promise.all([
    prisma.nonConformity.groupBy({ by: ["severity"], _count: { _all: true } }),
    prisma.nonConformity.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.nonConformity.count({
      where: { status: { in: ["open", "in_review"] }, severity: { in: ["high", "critical"] } },
    }),
  ]);
  return {
    bySeverity: Object.fromEntries(bySeverityRows.map((r) => [r.severity, r._count._all])),
    byStatus: Object.fromEntries(byStatusRows.map((r) => [r.status, r._count._all])),
    openHighOrCritical,
  };
}

export type EquipmentFindingRecurrence = {
  findingType: string;
  count: number;
  openCount: number;
  lastRaisedAt: string;
};

/** Recurrencia por categoría de hallazgo para UN equipo — cuántas veces se levantó cada tipo. */
export async function getEquipmentFindingHistory(equipmentId: string): Promise<EquipmentFindingRecurrence[]> {
  const [created, open] = await Promise.all([
    prisma.nonConformityAction.groupBy({
      by: ["findingType"],
      where: { equipmentId, action: "created" },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.nonConformity.groupBy({
      by: ["findingType"],
      where: { equipmentId, status: { not: "closed" } },
      _count: { _all: true },
    }),
  ]);
  const openByType = new Map(open.map((o) => [o.findingType, o._count._all]));
  return created
    .map((c) => ({
      findingType: c.findingType,
      count: c._count._all,
      openCount: openByType.get(c.findingType) ?? 0,
      lastRaisedAt: (c._max.createdAt ?? new Date(0)).toISOString(),
    }))
    .sort((a, b) => b.count - a.count);
}
