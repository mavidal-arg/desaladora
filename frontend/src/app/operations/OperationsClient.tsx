"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { StatCard, Section, Empty, fmtDateTime } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { StateBadge } from "@/components/mes";
import { TabBar } from "@/components/TabBar";
import { FindingTreatDialog } from "@/components/FindingTreatDialog";
import { can } from "@/lib/permissions";
import type { Equipment, NonConformity } from "@/lib/adapters/types";
import { esEquipCategory } from "@/lib/labels";

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const TABS = ["Horas de marcha", "Gestión de corrosión", "Gestión de sellado"];
const TAB_FROM_PARAM: Record<string, string> = { corrosion: "Gestión de corrosión", sealing: "Gestión de sellado" };

export function OperationsClient({ equipment, ncs, initialTab, role = "Lector" }: {
  equipment: Equipment[]; ncs: NonConformity[]; initialTab?: string; role?: string;
}) {
  const [tab, setTab] = useState((initialTab && TAB_FROM_PARAM[initialTab]) || TABS[0]);
  const [rows, setRows] = useState(ncs);
  const [treating, setTreating] = useState<NonConformity | null>(null);
  const canTreat = can(role, "close_nc");
  const total = equipment.length || 1;
  const utilization = Math.round((equipment.filter((e) => e.status === "running").length / total) * 1000) / 10;
  const critical = rows.filter((n) => n.severity === "critical" && n.status !== "closed").length;
  const warning = rows.filter((n) => n.severity === "high" && n.status !== "closed").length;
  const corrosion = rows.filter((n) => /corro/i.test(n.description));
  const sealing = rows.filter((n) => /sell|seal|fuga|leak/i.test(n.description));
  const minorLeak = sealing.filter((n) => n.severity === "low" || n.severity === "medium").length;

  const applyTreated = (updated: NonConformity) => {
    setRows((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
  };

  const chartData = [...equipment].filter((e) => e.runtimeHours > 0).sort((a, b) => b.runtimeHours - a.runtimeHours).slice(0, 8)
    .map((e) => ({ name: e.code, hours: e.runtimeHours }));

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Utilización" value={`${utilization}%`} accent />
        <StatCard label="Crítico" value={critical} />
        <StatCard label="Advertencia" value={warning} />
        <StatCard label="Fuga menor" value={minorLeak} />
      </div>

      <Link
        href="/hallazgos"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
      >
        Ver sumario de hallazgos <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Horas de marcha" && (
        <div className="space-y-4">
          <Section title="Running Hours — por equipo">
            <div className="h-[200px] w-full sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} interval="preserveStartEnd" tickMargin={6} />
                  <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={{ fontSize: 11, background: "#111", border: "1px solid #333", borderRadius: 6 }} />
                  <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill="#4CAF50" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
          <SortableTable
            rows={equipment}
            getRowKey={(e) => e.id}
            initialSort={{ key: "hours", dir: "desc" }}
            columns={[
              { key: "code", header: "Código", sortAccessor: (e) => e.code, render: (e) => e.code },
              { key: "name", header: "Nombre", sortAccessor: (e) => e.name, render: (e) => e.name },
              { key: "cat", header: "Categoría", sortAccessor: (e) => esEquipCategory(e.category), render: (e) => esEquipCategory(e.category) },
              { key: "hours", header: "Horas (h)", align: "right", sortAccessor: (e) => e.runtimeHours, render: (e) => e.runtimeHours.toLocaleString("es-AR") },
              { key: "status", header: "Estado", sortAccessor: (e) => e.status, render: (e) => <StateBadge state={e.status} size="sm" /> },
            ]}
          />
        </div>
      )}

      {tab === "Gestión de corrosión" && <NcTable items={corrosion} empty="Sin hallazgos de corrosión." onTreat={setTreating} canTreat={canTreat} />}
      {tab === "Gestión de sellado" && <NcTable items={sealing} empty="Sin hallazgos de sellado." onTreat={setTreating} canTreat={canTreat} />}

      {treating && (
        <FindingTreatDialog nc={treating} canTreat={canTreat} onClose={() => setTreating(null)}
          onTreated={(u) => { applyTreated(u); setTreating(null); }} />
      )}
    </div>
  );
}

function NcTable({ items, empty, onTreat, canTreat }: {
  items: NonConformity[]; empty: string; onTreat: (n: NonConformity) => void; canTreat: boolean;
}) {
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <SortableTable
      rows={items}
      getRowKey={(n) => n.id}
      emptyText={empty}
      columns={[
        { key: "code", header: "Código", sortAccessor: (n) => n.code, render: (n) => n.code },
        { key: "sev", header: "Severidad", sortAccessor: (n) => SEV_RANK[n.severity] ?? 9, render: (n) => <StateBadge state={n.severity} size="sm" /> },
        { key: "desc", header: "Descripción", sortAccessor: (n) => n.description, render: (n) => n.description },
        { key: "status", header: "Estado", sortAccessor: (n) => n.status, render: (n) => <StateBadge state={n.status} size="sm" /> },
        {
          key: "autor", header: "Autor", sortAccessor: (n) => n.raisedBy ?? "",
          render: (n) => n.raisedBy
            ? <span>{n.raisedBy}{n.raisedByRole ? <span className="text-[var(--muted-foreground)]"> · {n.raisedByRole}</span> : null}</span>
            : <span className="text-[var(--muted-foreground)]">sistema</span>,
        },
        { key: "raised", header: "Reportada", sortAccessor: (n) => new Date(n.raisedAt).getTime(), render: (n) => fmtDateTime(n.raisedAt) },
        { key: "actions", header: "", align: "right", render: (n) => (
          <button
            onClick={() => onTreat(n)}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--muted)]"
          >
            {canTreat ? "Tratar" : "Ver log"}
          </button>
        ) },
      ]}
    />
  );
}
