"use client";

import { useState } from "react";
import { StatCard, Empty, fmtDate, fmtDateTime } from "@/components/uikit";
import { StateBadge } from "@/components/mes";
import { TabBar } from "@/components/TabBar";
import { cn } from "@/lib/utils";
import type { Equipment, InspectionRoute, NonConformity, ObservationReading } from "@/lib/adapters/types";

const TABS = ["Rondas", "Equipos especiales", "Instrumentos", "Observaciones de terreno"];
// El resto de la app está en castellano; el estado crudo de la NC no.
const ESTADO_NC: Record<string, string> = { open: "Abierta", in_review: "En revisión", closed: "Cerrada" };
const catOf: Record<string, InspectionRoute["category"]> = {
  "Rondas": "patrol", "Equipos especiales": "special", "Instrumentos": "measuring",
};

export function InspectionClient({ routes, ncs, equipment }: {
  routes: InspectionRoute[]; ncs: NonConformity[]; equipment: Equipment[];
}) {
  const [tab, setTab] = useState(TABS[0]);
  const [openNc, setOpenNc] = useState<string | null>(null);
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
            Lo que se levanta escaneando el QR del equipo, con quién lo reportó y a qué hora. Tocá una fila para ver los datos que se veían en ese momento.
            {deTerreno.length > 0 && <> {deTerreno.length} de {observaciones.length} vienen de terreno; el resto las generó el sistema.</>}
          </p>
          {observaciones.length === 0 ? <Empty text="Sin observaciones registradas." /> : (
            <div className="space-y-2">
              {observaciones.map((n) => {
                const open = openNc === n.id;
                const hasSnap = (n.readings?.length ?? 0) > 0;
                return (
                  <div key={n.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    <button
                      onClick={() => hasSnap && setOpenNc(open ? null : n.id)}
                      className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-xs", hasSnap && "hover:bg-[var(--muted)]/50")}
                    >
                      <span className="font-mono font-semibold">{n.code}</span>
                      <StateBadge state={n.severity} size="sm" />
                      <span className="text-[var(--muted-foreground)]">{nombrePorId.get(n.assetId) ?? n.assetId}</span>
                      <span className="min-w-0 flex-1 truncate">{n.description}</span>
                      <span className="text-[var(--muted-foreground)]">
                        {n.raisedBy ?? "sistema"}{n.raisedByRole ? ` · ${n.raisedByRole}` : ""} · {fmtDateTime(n.raisedAt)}
                      </span>
                      <StateBadge state={n.status.replace("_", "")} label={ESTADO_NC[n.status] ?? n.status} size="sm" />
                      {hasSnap && <span className="text-[10px] text-[var(--accent)]">{open ? "▲" : "▼"} datos</span>}
                    </button>
                    {open && hasSnap && <ObservationSnapshot readings={n.readings!} />}
                  </div>
                );
              })}
            </div>
          )}
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

/** Tabla app-vs-terreno del snapshot de una observación. */
function ObservationSnapshot({ readings }: { readings: ObservationReading[] }) {
  const bySignal = new Map<string, { label: string; unit: string; app?: number; field?: number }>();
  for (const r of readings) {
    const e = bySignal.get(r.signal) ?? { label: r.label, unit: r.unit };
    if (r.source === "app") e.app = r.value;
    else e.field = r.value;
    e.label = r.label; e.unit = r.unit || e.unit;
    bySignal.set(r.signal, e);
  }
  const rows = [...bySignal.values()];
  const nf = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("es-CL") : n);
  return (
    <div className="border-t border-[var(--border)] px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Datos al levantar la observación</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-[var(--muted-foreground)]">
            <th className="py-1 text-left font-medium">Señal</th>
            <th className="py-1 text-right font-medium">App</th>
            <th className="py-1 text-right font-medium">Terreno</th>
            <th className="py-1 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = r.app != null && r.field != null ? r.field - r.app : null;
            return (
              <tr key={r.label} className="border-t border-[var(--border)]/50">
                <td className="py-1 pr-2">{r.label}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.app != null ? `${nf(Math.round(r.app * 100) / 100)} ${r.unit}` : "—"}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.field != null ? `${nf(Math.round(r.field * 100) / 100)} ${r.unit}` : "—"}</td>
                <td className={cn("py-1 text-right font-mono tabular-nums", delta != null && Math.abs(delta) > 0 ? "text-amber-500" : "text-[var(--muted-foreground)]")}>
                  {delta != null ? `${delta > 0 ? "+" : ""}${Math.round(delta * 100) / 100}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
