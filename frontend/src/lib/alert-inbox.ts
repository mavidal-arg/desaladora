import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Lado de LECTURA del canal in-app.
//
// `alert-notify.ts` escribe una fila `AlertNotification` con channel="inapp"
// por cada alerta despachada; acá se leen para la burbuja del Shell. La fila
// es un broadcast (`recipient: "*"`), así que no se filtra por usuario: quien
// tenga la app abierta la ve. El "visto" es por navegador (localStorage), no
// server-side — la app tiene identidades demo rotativas, un leído por usuario
// sería poco confiable.
//
// Para las alertas de origen "observation" se trae también la NonConformity y
// su equipo, porque desde la burbuja se la edita y se la trata sin salir de la
// pantalla en la que uno está.
// ─────────────────────────────────────────────────────────────────────────────

export type InboxFinding = {
  id: string;
  code: string;
  severity: string;
  status: string;
  description: string;
  findingType: string;
  raisedBy: string | null;
  raisedByRole: string | null;
  raisedAt: string;
  equipmentCode: string;
  equipmentName: string;
};

export type InboxItem = {
  id: string;
  alertEventId: string;
  createdAt: string;
  level: string;
  status: string;
  message: string;
  sourceType: string;
  sourceId: string | null;
  finding: InboxFinding | null;
};

/** Últimas alertas in-app, más nuevas primero. */
export async function listInAppAlerts(take = 40): Promise<InboxItem[]> {
  const notifs = await prisma.alertNotification.findMany({
    where: { channel: "inapp" },
    orderBy: { createdAt: "desc" },
    take,
    include: { alertEvent: true },
  });

  // Una sola query para todos los hallazgos referenciados, en vez de una por fila.
  const findingIds = [
    ...new Set(
      notifs
        .filter((n) => n.alertEvent.sourceType === "observation" && n.alertEvent.sourceId)
        .map((n) => n.alertEvent.sourceId as string),
    ),
  ];

  const findings = findingIds.length
    ? await prisma.nonConformity.findMany({
        where: { id: { in: findingIds } },
        include: { equipment: { select: { code: true, name: true } } },
      })
    : [];
  const byId = new Map(findings.map((f) => [f.id, f]));

  return notifs.map((n) => {
    const ev = n.alertEvent;
    const f = ev.sourceType === "observation" && ev.sourceId ? byId.get(ev.sourceId) : undefined;
    return {
      id: n.id,
      alertEventId: ev.id,
      createdAt: n.createdAt.toISOString(),
      level: ev.level,
      status: ev.status,
      message: ev.message,
      sourceType: ev.sourceType,
      sourceId: ev.sourceId,
      finding: f
        ? {
            id: f.id,
            code: f.code,
            severity: f.severity,
            status: f.status,
            description: f.description,
            findingType: f.findingType,
            raisedBy: f.raisedBy,
            raisedByRole: f.raisedByRole,
            raisedAt: f.raisedAt.toISOString(),
            equipmentCode: f.equipment.code,
            equipmentName: f.equipment.name,
          }
        : null,
    };
  });
}
