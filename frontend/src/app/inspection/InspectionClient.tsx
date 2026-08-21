"use client";

import { useState } from "react";
import { StatCard, Empty, fmtDate } from "@/components/uikit";
import { StateBadge } from "@/components/mes";
import { TabBar } from "@/components/TabBar";
import type { InspectionRoute } from "@/lib/adapters/types";

const TABS = ["Rondas", "Equipos especiales", "Instrumentos"];
const catOf: Record<string, InspectionRoute["category"]> = {
  "Rondas": "patrol", "Equipos especiales": "special", "Instrumentos": "measuring",
};

export function InspectionClient({ routes }: { routes: InspectionRoute[] }) {
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

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pendientes" value={counts.pending} />
        <StatCard label="Completadas" value={counts.completed} accent />
        <StatCard label="Por vencer" value={counts.expiring} />
        <StatCard label="Vencidas" value={counts.expired} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {shown.length === 0 ? <Empty text="Sin rutas en esta categoría." /> : (
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
