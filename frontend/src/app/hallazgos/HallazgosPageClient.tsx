"use client";

import { useMemo, useState } from "react";
import { Eye, Wrench } from "lucide-react";
import { StatCard, Empty, fmtDateTime, FilterChip } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { StateBadge } from "@/components/mes";
import { FindingTreatDialog } from "@/components/FindingTreatDialog";
import { Asset360Modal } from "@/app/equipment/Asset360Modal";
import { can } from "@/lib/permissions";
import type { Equipment, NonConformity } from "@/lib/adapters/types";
import type { FindingSummary } from "@/lib/finding-treatment";

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const FINDING_TYPE_LABELS: Record<string, string> = {
  corrosion: "Corrosión", fuga_sello: "Fuga / sello", vibracion: "Vibración anormal", otro: "Otro",
};

const inputCls = "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

export function HallazgosPageClient({
  role, equipment, ncs, summary, initialSeverity, initialStatus, initialEquipo,
}: {
  role: string;
  equipment: Equipment[];
  ncs: NonConformity[];
  summary: FindingSummary;
  initialSeverity?: string;
  initialStatus?: string;
  initialEquipo?: string;
}) {
  const [rows, setRows] = useState(ncs);
  const [severityFilter, setSeverityFilter] = useState(initialSeverity ?? "");
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [equipoFilter, setEquipoFilter] = useState(initialEquipo ?? "");
  const [treating, setTreating] = useState<NonConformity | null>(null);
  const [viewingAsset, setViewingAsset] = useState<string | null>(null);

  const canTreat = can(role, "close_nc");
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  // Recurrencia por equipo+categoría, calculada del propio listado ya cargado
  // — no hace falta otro round trip para "cuántas veces se levantó esto".
  const countByEquipmentType = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of rows) {
      const k = `${n.assetId}::${n.findingType}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const severities = severityFilter ? severityFilter.split(",") : [];
  const statuses = statusFilter ? statusFilter.split(",") : [];

  const filtered = useMemo(() => rows.filter((n) => {
    if (severities.length && !severities.includes(n.severity)) return false;
    if (statuses.length && !statuses.includes(n.status)) return false;
    if (equipoFilter && n.assetId !== equipoFilter) return false;
    return true;
  }), [rows, severityFilter, statusFilter, equipoFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTreated = (updated: NonConformity) => {
    setRows((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Abiertos" value={summary.byStatus.open ?? 0} accent />
        <StatCard label="En revisión" value={summary.byStatus.in_review ?? 0} />
        <StatCard label="Cerrados" value={summary.byStatus.closed ?? 0} />
        <StatCard label="Alta gravedad" value={summary.bySeverity.high ?? 0} />
        <StatCard label="Crítica" value={summary.bySeverity.critical ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} aria-label="Filtrar por severidad">
          <option value="">Todas las severidades</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="high,critical">Alta + Crítica</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
        <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="open">Abierta</option>
          <option value="in_review">En revisión</option>
          <option value="open,in_review">Abierta + En revisión</option>
          <option value="closed">Cerrada</option>
        </select>
        <select className={inputCls} value={equipoFilter} onChange={(e) => setEquipoFilter(e.target.value)} aria-label="Filtrar por equipo">
          <option value="">Todos los equipos</option>
          {equipment.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
        </select>
        {severityFilter && <FilterChip label={`Severidad: ${severityFilter}`} onClear={() => setSeverityFilter("")} />}
        {statusFilter && <FilterChip label={`Estado: ${statusFilter}`} onClear={() => setStatusFilter("")} />}
        {equipoFilter && <FilterChip label={equipmentById.get(equipoFilter)?.code ?? equipoFilter} onClear={() => setEquipoFilter("")} />}
        <span className="text-xs text-[var(--muted-foreground)]">{filtered.length} de {rows.length}</span>
      </div>

      {filtered.length === 0 ? (
        <Empty text="Sin hallazgos para los filtros aplicados." />
      ) : (
        <SortableTable
          rows={filtered}
          getRowKey={(n) => n.id}
          initialSort={{ key: "sev", dir: "asc" }}
          columns={[
            { key: "code", header: "Código", sortAccessor: (n) => n.code, render: (n) => <span className="font-mono text-xs">{n.code}</span> },
            {
              key: "equipo", header: "Equipo",
              sortAccessor: (n) => equipmentById.get(n.assetId)?.code ?? n.assetId,
              render: (n) => {
                const e = equipmentById.get(n.assetId);
                return e ? <span>{e.code} <span className="text-[var(--muted-foreground)]">· {e.name}</span></span> : n.assetId;
              },
            },
            { key: "sev", header: "Severidad", sortAccessor: (n) => SEV_RANK[n.severity] ?? 9, render: (n) => <StateBadge state={n.severity} size="sm" /> },
            {
              key: "tipo", header: "Categoría", sortAccessor: (n) => n.findingType,
              render: (n) => {
                const count = countByEquipmentType.get(`${n.assetId}::${n.findingType}`) ?? 1;
                return (
                  <span>
                    {FINDING_TYPE_LABELS[n.findingType] ?? n.findingType}
                    {count > 1 && <span className="ml-1.5 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">{count}×</span>}
                  </span>
                );
              },
            },
            { key: "desc", header: "Descripción", render: (n) => <span className="line-clamp-1">{n.description}</span> },
            {
              key: "status", header: "Estado", sortAccessor: (n) => n.status,
              render: (n) => (
                <div className="flex items-center gap-1">
                  <StateBadge state={n.status.replace("_", "")} label={n.status.replace("_", " ")} size="sm" />
                  {n.treatmentOutcome && <StateBadge state={n.treatmentOutcome} size="sm" />}
                </div>
              ),
            },
            { key: "raised", header: "Reportada", sortAccessor: (n) => new Date(n.raisedAt).getTime(), render: (n) => fmtDateTime(n.raisedAt) },
            {
              key: "actions", header: "", align: "right",
              render: (n) => (
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setViewingAsset(n.assetId)} title="Ver en vivo" aria-label="Ver en vivo"
                    className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--accent)]">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setTreating(n)} title={canTreat ? "Tratar" : "Ver log"}
                    className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--accent)]">
                    <Wrench className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {treating && (
        <FindingTreatDialog nc={treating} canTreat={canTreat} onClose={() => setTreating(null)}
          onTreated={(u) => { applyTreated(u); setTreating(null); }} />
      )}
      {viewingAsset && (
        <Asset360Modal assetId={viewingAsset} onClose={() => setViewingAsset(null)} role={role} initialTab="Tiempo real" />
      )}
    </div>
  );
}
