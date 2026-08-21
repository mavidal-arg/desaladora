"use client";

import { useState } from "react";
import { StatCard, Section, Empty, fmtDate, FilterChip } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { StateBadge } from "@/components/mes";

// Rango de severidad para ordenar prioridad (crítica primero en asc).
const PRIO_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const prioRank = (p: string) => PRIO_RANK[p] ?? 9;
import { TabBar } from "@/components/TabBar";
import type { WorkOrder, MaintenancePlan } from "@/lib/adapters/types";
import { esWoType, esStrategy } from "@/lib/labels";

type Plan = MaintenancePlan & { assetCode: string };
const TABS = ["Órdenes de trabajo", "Mantenimiento preventivo", "Planes de mantenimiento"];

export function MaintenanceClient({
  workOrders, plans, initialStatus, initialType,
}: { workOrders: WorkOrder[]; plans: Plan[]; initialStatus?: string; initialType?: string }) {
  const [tab, setTab] = useState(TABS[0]);
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [typeFilter, setTypeFilter] = useState(initialType ?? "");
  const now = Date.now();
  const counts = {
    pending: workOrders.filter((w) => w.status === "pending").length,
    inProgress: workOrders.filter((w) => w.status === "in_progress").length,
    completed: workOrders.filter((w) => w.status === "completed").length,
    critical: workOrders.filter((w) => w.priority === "critical" && w.status !== "completed").length,
    overdue: workOrders.filter((w) => w.dueAt && new Date(w.dueAt).getTime() < now && w.status !== "completed").length,
  };
  const preventive = workOrders.filter((w) => w.orderType === "preventive" || w.orderType === "predictive");

  // Drill-down filters from the dashboard (status / orderType) applied to the WO list.
  const applyFilters = (list: WorkOrder[]) =>
    list.filter((w) => {
      if (statusFilter && w.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (typeFilter && w.orderType.toLowerCase() !== typeFilter.toLowerCase()) return false;
      return true;
    });
  const hasFilter = Boolean(statusFilter || typeFilter);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Órdenes pendientes" value={counts.pending} />
        <StatCard label="En progreso" value={counts.inProgress} accent />
        <StatCard label="Completadas" value={counts.completed} />
        <StatCard label="Crítico" value={counts.critical} />
        <StatCard label="Órdenes vencidas" value={counts.overdue} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {hasFilter && tab !== "Planes de mantenimiento" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {statusFilter && <FilterChip label={statusFilter.replace("_", " ")} onClear={() => setStatusFilter("")} />}
          {typeFilter && <FilterChip label={typeFilter} onClear={() => setTypeFilter("")} />}
        </div>
      )}

      {tab !== "Planes de mantenimiento" ? (
        <WoTable wos={applyFilters(tab === "Órdenes de trabajo" ? workOrders : preventive)} />
      ) : (
        plans.length === 0 ? <Empty text="Sin planes de mantenimiento." /> : (
          <Section title="Planes de mantenimiento">
            <SortableTable
              rows={plans}
              getRowKey={(p) => p.id}
              emptyText="Sin planes de mantenimiento."
              columns={[
                { key: "asset", header: "Activo", sortAccessor: (p) => p.assetCode, render: (p) => p.assetCode },
                { key: "strategy", header: "Estrategia", sortAccessor: (p) => esStrategy(p.strategy), render: (p) => esStrategy(p.strategy) },
                { key: "interval", header: "Intervalo", sortAccessor: (p) => p.intervalLabel, render: (p) => p.intervalLabel },
                { key: "next", header: "Próximo", sortAccessor: (p) => new Date(p.nextDueAt).getTime(), render: (p) => fmtDate(p.nextDueAt) },
                { key: "tasks", header: "Tareas", render: (p) => p.taskList.join(" · ") },
              ]}
            />
          </Section>
        )
      )}
    </div>
  );
}

function WoTable({ wos }: { wos: WorkOrder[] }) {
  if (wos.length === 0) return <Empty text="Sin órdenes de trabajo." />;
  return (
    <SortableTable
      rows={wos}
      getRowKey={(w) => w.id}
      emptyText="Sin órdenes de trabajo."
      columns={[
        { key: "code", header: "Código", sortAccessor: (w) => w.code, render: (w) => w.code },
        { key: "priority", header: "Prioridad", sortAccessor: (w) => prioRank(w.priority), render: (w) => <StateBadge state={w.priority} size="sm" /> },
        { key: "type", header: "Tipo", sortAccessor: (w) => esWoType(w.orderType), render: (w) => <span className="text-[var(--muted-foreground)]">{esWoType(w.orderType)}</span> },
        { key: "desc", header: "Descripción", sortAccessor: (w) => w.description, render: (w) => w.description },
        { key: "asset", header: "Equipo", sortAccessor: (w) => w.assetName, render: (w) => w.assetName },
        { key: "assignee", header: "Asignado a", sortAccessor: (w) => w.assignee ?? "", render: (w) => w.assignee ?? "—" },
        { key: "status", header: "Estado", sortAccessor: (w) => w.status, render: (w) => <StateBadge state={w.status} size="sm" /> },
      ]}
    />
  );
}
