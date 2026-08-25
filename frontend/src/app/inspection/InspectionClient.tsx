"use client";

import { useState } from "react";
import { StatCard, Empty, fmtDate, fmtDateTime } from "@/components/uikit";
import { StateBadge } from "@/components/mes";
import { TabBar } from "@/components/TabBar";
import { SortableTable } from "@/components/SortableTable";
import type { Equipment, InspectionRoute, NonConformity } from "@/lib/adapters/types";

const TABS = ["Rondas", "Equipos especiales", "Instrumentos", "Observaciones de terreno"];
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
// El resto de la app está en castellano; el estado crudo de la NC no.
const ESTADO_NC: Record<string, string> = { open: "Abierta", in_review: "En revisión", closed: "Cerrada" };
const catOf: Record<string, InspectionRoute["category"]> = {
  "Rondas": "patrol", "Equipos especiales": "special", "Instrumentos": "measuring",
};

export function InspectionClient({ routes, ncs, equipment }: {
  routes: InspectionRoute[]; ncs: NonConformity[]; equipment: Equipment[];
}) {
  const [tab, setTab] = useState(TABS[0]);
  const now = Date.now();
  const allTasks = routes.flatMap((r) => r.tasks);
  const counts = {
    pending: allTasks.filter((t) => t.status === "in_progress").length,
    completed: allTasks.filter((t) => t.status === "completed").length,
    expiring: routes.filter((r) => { const t = new Date(r.nextInspectionAt).getTime(); return t >= now && t <= now + 7 * 86400000; }).length,
    expired: routes.filter((r) => new Date(r.nextInspectionAt).getTime() < now).length,
  };
  const shown = routes.filter((r) => r.category === catOf[tab]);
  const nombrePorId = new Map(equipment.map((e) => [e.id, `${e.code} · ${e.name}`]));
  const observaciones = [...ncs].sort((a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime());
  const deTerreno = observaciones.filter((n) => n.raisedBy);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pendientes" value={counts.pending} />
        <StatCard label="Completadas" value={counts.completed} accent />
        <StatCard label="Por vencer" value={counts.expiring} />
        <StatCard label="Vencidas" value={counts.expired} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Observaciones de terreno" ? (
        <>
          <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
            Lo que se levanta escaneando el QR del equipo, con quién lo reportó y a qué hora.
            {deTerreno.length > 0 && <> {deTerreno.length} de {observaciones.length} vienen de terreno; el resto las generó el sistema.</>}
          </p>
          <SortableTable
            rows={observaciones}
            getRowKey={(n) => n.id}
            emptyText="Sin observaciones registradas."
            columns={[
              { key: "code", header: "Código", sortAccessor: (n) => n.code, render: (n) => n.code },
              { key: "activo", header: "Activo", sortAccessor: (n) => nombrePorId.get(n.assetId) ?? n.assetId, render: (n) => nombrePorId.get(n.assetId) ?? n.assetId },
              { key: "sev", header: "Severidad", sortAccessor: (n) => SEV_RANK[n.severity] ?? 9, render: (n) => <StateBadge state={n.severity} size="sm" /> },
              { key: "desc", header: "Observación", sortAccessor: (n) => n.description, render: (n) => n.description },
              {
                key: "autor", header: "Autor", sortAccessor: (n) => n.raisedBy ?? "",
                render: (n) => n.raisedBy
                  ? <span>{n.raisedBy}{n.raisedByRole ? <span className="text-[var(--muted-foreground)]"> · {n.raisedByRole}</span> : null}</span>
                  : <span className="text-[var(--muted-foreground)]">sistema</span>,
              },
              { key: "raised", header: "Reportada", sortAccessor: (n) => new Date(n.raisedAt).getTime(), render: (n) => fmtDateTime(n.raisedAt) },
              { key: "estado", header: "Estado", sortAccessor: (n) => n.status, render: (n) => <StateBadge state={n.status.replace("_", "")} label={ESTADO_NC[n.status] ?? n.status} size="sm" /> },
            ]}
          />
        </>
      ) : shown.length === 0 ? <Empty text="Sin rutas en esta categoría." /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {shown.map((r) => {
            const expired = new Date(r.nextInspectionAt).getTime() < now;
            return (
              <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{r.name}</h3>
                  <StateBadge state={expired ? "stopped" : "active"} label={expired ? "Vencidas" : "Vigente"} size="sm" />
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {r.code} · <span className="capitalize">{r.frequency}</span> · {r.inspector} · {r.assetIds.length} activos · Próx. {fmtDate(r.nextInspectionAt)}
                </p>
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Tareas</p>
                  {r.tasks.map((t, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-[var(--border)] px-2.5 py-1.5">
                      <span className="text-xs text-[var(--foreground)]">{fmtDate(t.date)} · {t.inspector}{t.startedAt ? ` · ${t.startedAt}` : ""}</span>
                      <StateBadge state={t.status.replace("_", "")} label={t.status.replace("_", " ")} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
