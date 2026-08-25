import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { eqId } from "@/lib/plant-config";

const SEVERITIES = ["low", "medium", "high"];

// POST /api/ar/observation → observación de terreno levantada desde la vista AR.
// Se materializa como NonConformity (NO WorkOrder: el operador de terreno no
// tiene create_wo; la conversión NC→OT la hace un Planificador/Supervisor).
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "raise_observation"))
    return NextResponse.json({ error: "Sin permiso para levantar observaciones" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const code: string | undefined = b?.code;
  const description: string = (b?.description ?? "").trim();
  const severityIn: string = SEVERITIES.includes(b?.severity) ? b.severity : "medium";
  const intervention = b?.intervention === true;
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

  const nc = await prisma.nonConformity.create({
    data: {
      id: `nc_ar_${now.getTime()}`,
      code: ncCode,
      equipmentId: id,
      severity,
      description: desc,
      status: "open",
      raisedBy: user.displayName,
      raisedByRole: user.role,
      // Explícito y no por default de la DB: es la estampa de tiempo del
      // hallazgo, el dato que después se muestra en la app.
      raisedAt: now,
    },
  });
  return NextResponse.json({ ok: true, code: nc.code, id: nc.id }, { status: 201 });
}
