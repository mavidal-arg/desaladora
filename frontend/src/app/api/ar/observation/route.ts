import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { eqId } from "@/lib/plant-config";
import { getLiveSignals } from "@/lib/live-signals";
import { normalizeFindingType, createdActionData } from "@/lib/finding-treatment";
import { raiseObservationAlert } from "@/lib/observation-alert";

// "critical" faltaba acá: sin ella ningún hallazgo levantado desde el QR podía
// nacer crítico, aunque el tipo (`Criticality`) y los colores de estado sí lo
// contemplan — le sacaba el piso a cualquier alerta por "gravedad alta".
const SEVERITIES = ["low", "medium", "high", "critical"];

type FieldReading = { signal: string; value: number };

// POST /api/ar/observation → observación de terreno levantada desde la vista AR.
// Se materializa como NonConformity (NO WorkOrder: el operador de terreno no
// tiene create_wo; la conversión NC→OT la hace un Planificador/Supervisor).
export async function POST(req: Request) {
  // requirePassword y no requireAuth: la observación queda firmada con el nombre
  // de quien la levanta, así que una identidad tomada del selector de la barra
  // izquierda —que no pide clave— no alcanza. Lo corta el servidor, no la
  // pantalla: el panel del QR reproduce este mismo criterio, pero no es el que
  // manda.
  let user;
  try {
    user = await requirePassword();
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "No autenticado", requiereClave: err.status === 401 },
      { status: err.status ?? 401 },
    );
  }
  if (!can(user.role, "raise_observation"))
    return NextResponse.json({ error: "Sin permiso para levantar observaciones" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const code: string | undefined = b?.code;
  const description: string = (b?.description ?? "").trim();
  const severityIn: string = SEVERITIES.includes(b?.severity) ? b.severity : "medium";
  const intervention = b?.intervention === true;
  // Lecturas que el operador tipeó de lo que marca el instrumento en terreno.
  const fieldReadings: FieldReading[] = Array.isArray(b?.readings)
    ? (b.readings as unknown[])
        .map((r) => r as Record<string, unknown>)
        .filter((r) => typeof r?.signal === "string" && Number.isFinite(Number(r?.value)))
        .map((r) => ({ signal: String(r.signal), value: Number(r.value) }))
    : [];
  if (!code || !description)
    return NextResponse.json({ error: "Faltan code y/o descripción" }, { status: 400 });

  const id = eqId(code);
  const eq = await prisma.equipment.findUnique({ where: { id } });
  if (!eq) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });

  const now = new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const seq = (await prisma.nonConformity.count({ where: { code: { startsWith: `NC-AR-${yymmdd}` } } })) + 1;
  const ncCode = `NC-AR-${yymmdd}-${String(seq).padStart(3, "0")}`;

  const severity = intervention ? "high" : severityIn;
  // El autor ya NO se antepone al texto: va en `raisedBy`/`raisedByRole`, que se
  // pueden filtrar y ordenar. El marcador de intervención sí se queda — eso es
  // estado del hallazgo, no autoría.
  const desc = (intervention ? "[INTERVENCIÓN SOLICITADA] " : "") + description;

  const findingType = normalizeFindingType(b?.findingType);
  const ncId = `nc_ar_${now.getTime()}`;

  const [nc] = await prisma.$transaction([
    prisma.nonConformity.create({
      data: {
        id: ncId,
        code: ncCode,
        equipmentId: id,
        severity,
        description: desc,
        status: "open",
        findingType,
        raisedBy: user.displayName,
        raisedByRole: user.role,
        // Explícito y no por default de la DB: es la estampa de tiempo del
        // hallazgo, el dato que después se muestra en la app.
        raisedAt: now,
      },
    }),
    // Primera fila del log de tratamiento: arranca la recurrencia desde el
    // hallazgo original, no sólo desde el primer tratamiento posterior.
    prisma.nonConformityAction.create({
      data: createdActionData({ id: ncId, equipmentId: id, findingType }, user.displayName, user.role),
    }),
  ]);

  // ── Snapshot: qué datos se veían al levantar la observación ──
  // "app" = foto de la telemetría del momento (fuente única). "field" = lo que
  // el operador leyó en el instrumento. Juntos son el histórico por activo.
  const appSnapshot = await getLiveSignals(code, { at: now.getTime() }).catch(() => []);
  const labelBySignal = new Map(appSnapshot.map((s) => [s.signal, { label: s.label, unit: s.unit }]));

  const rows = [
    ...appSnapshot.map((s, i) => ({
      id: `or_${nc.id}_app_${i}`,
      nonConformityId: nc.id,
      signal: s.signal,
      label: s.label,
      value: s.value,
      unit: s.unit,
      source: "app",
      capturedAt: now,
    })),
    ...fieldReadings.map((fr, i) => ({
      id: `or_${nc.id}_field_${i}`,
      nonConformityId: nc.id,
      signal: fr.signal,
      label: labelBySignal.get(fr.signal)?.label ?? fr.signal,
      value: fr.value,
      unit: labelBySignal.get(fr.signal)?.unit ?? "",
      source: "field",
      capturedAt: now,
    })),
  ];
  if (rows.length) await prisma.observationReading.createMany({ data: rows });

  // ── Aviso: que la observación salga de esta función ──
  // Hasta acá el handler terminaba en el 201 y nadie más se enteraba nunca.
  // Best-effort a propósito: la observación YA está guardada y es lo que no se
  // puede perder; si el despacho falla, se registra y se sigue.
  try {
    await raiseObservationAlert({
      nonConformityId: nc.id,
      code: nc.code,
      severity: nc.severity,
      description: nc.description,
      equipmentCode: eq.code,
      equipmentName: eq.name,
    });
  } catch (e) {
    console.error(`[observation] no se pudo despachar la alerta de ${nc.code}:`, e);
  }

  return NextResponse.json(
    { ok: true, code: nc.code, id: nc.id, snapshot: appSnapshot.length, field: fieldReadings.length },
    { status: 201 },
  );
}
