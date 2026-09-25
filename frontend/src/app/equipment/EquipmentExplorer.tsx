"use client";

import { useMemo, useState } from "react";
import { Search, Eye } from "lucide-react";
import { StateBadge } from "@/components/mes";
import { FilterChip } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import type { Equipment, NonConformity } from "@/lib/adapters/types";
import { Asset360Modal } from "./Asset360Modal";
import { esEquipCategory } from "@/lib/labels";

type Area = { code: string; name: string };

const inputCls = "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function EquipmentExplorer({
  equipment, areas, areaByCode, initialStatus, initialCategory, ncs = [], role = "Lector",
}: {
  equipment: Equipment[];
  areas: Area[];
  areaByCode: Record<string, string>;
  initialStatus?: string;
  initialCategory?: string;
  /** Hallazgos abiertos, para el badge de la columna "Hallazgos" — no filtra la tabla. */
  ncs?: NonConformity[];
  role?: string;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"Resumen" | "SOP">("Resumen");
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [categoryFilter, setCategoryFilter] = useState(initialCategory ?? "");
  const [areaFilter, setAreaFilter] = useState("");

  const areaName = (code: string) => areas.find((a) => a.code === code)?.name ?? code;
  const categories = useMemo(() => Array.from(new Set(equipment.map((e) => e.category))).sort(), [equipment]);

  // Abiertos/en revisión por equipo, con la severidad más alta — lo que hoy
  // sólo se veía entrando a la ficha (pestaña SOP) ya se resume en la tabla.
  const findingsByEquipment = useMemo(() => {
    const m = new Map<string, { count: number; maxSeverity: string }>();
    for (const n of ncs) {
      if (n.status === "closed") continue;
      const cur = m.get(n.assetId);
      if (!cur) { m.set(n.assetId, { count: 1, maxSeverity: n.severity }); continue; }
      cur.count += 1;
      if ((SEV_RANK[n.severity] ?? 9) < (SEV_RANK[cur.maxSeverity] ?? 9)) cur.maxSeverity = n.severity;
    }
    return m;
  }, [ncs]);

  const counts = useMemo(() => ({
    total: equipment.length,
    running: equipment.filter((e) => e.status === "running").length,
    maintenance: equipment.filter((e) => e.status === "maintenance").length,
    idle: equipment.filter((e) => e.status === "idle").length,
  }), [equipment]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return equipment.filter((e) => {
      if (statusFilter && e.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (categoryFilter && e.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (areaFilter && areaByCode[e.code] !== areaFilter) return false;
      if (t && ![e.code, e.name, e.category, e.model, e.location].some((f) => f.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [equipment, q, statusFilter, categoryFilter, areaFilter, areaByCode]);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      {/* Summary cards */}
      <div className="eam-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Equipos totales" value={counts.total} />
        <SummaryCard label="En marcha" value={counts.running} accent />
        <SummaryCard label="En mantenimiento" value={counts.maintenance} />
        <SummaryCard label="En espera" value={counts.idle} />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, nombre, categoría…"
            aria-label="Buscar equipos"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </div>
        {/* Selector de áreas */}
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          aria-label="Filtrar por área"
          className={inputCls}
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
        </select>
        {statusFilter && <FilterChip label={statusFilter} onClear={() => setStatusFilter("")} />}
        {categoryFilter && <FilterChip label={categoryFilter} onClear={() => setCategoryFilter("")} />}
        <span className="text-xs text-[var(--muted-foreground)]">{filtered.length} items</span>
      </div>

      {/* Table */}
      <SortableTable
        rows={filtered}
        getRowKey={(e) => e.id}
        emptyText="Sin equipos para los filtros aplicados."
        rowClassName={() => "hover:bg-[var(--muted)]/30"}
        columns={[
          { key: "code", header: "Código", sortAccessor: (e) => e.code, render: (e) => <span className="font-medium text-[var(--foreground)]">{e.code}</span> },
          { key: "name", header: "Nombre", sortAccessor: (e) => e.name, render: (e) => e.name },
          { key: "category", header: "Categoría", sortAccessor: (e) => esEquipCategory(e.category), render: (e) => <span className="text-[var(--muted-foreground)]">{esEquipCategory(e.category)}</span> },
          { key: "area", header: "Área", sortAccessor: (e) => (areaByCode[e.code] ? areaName(areaByCode[e.code]) : ""), render: (e) => <span className="text-[var(--muted-foreground)]">{areaByCode[e.code] ? areaName(areaByCode[e.code]) : "—"}</span> },
          { key: "model", header: "Modelo", sortAccessor: (e) => e.model, render: (e) => <span className="text-[var(--muted-foreground)]">{e.model}</span> },
          { key: "location", header: "Ubicación", sortAccessor: (e) => e.location, render: (e) => e.location },
          { key: "status", header: "Estado", sortAccessor: (e) => e.status, render: (e) => <StateBadge state={e.status} size="sm" /> },
          {
            key: "findings", header: "Hallazgos",
            sortAccessor: (e) => findingsByEquipment.get(e.id)?.count ?? 0,
            render: (e) => {
              const f = findingsByEquipment.get(e.id);
              if (!f) return <span className="text-[var(--muted-foreground)]">—</span>;
              return (
                <button
                  onClick={() => { setSelectedTab("SOP"); setSelected(e.id); }}
                  aria-label={`Tratar hallazgos de ${e.code}`}
                  className="eam-focus rounded"
                >
                  <StateBadge state={f.maxSeverity} label={`${f.count} abierto${f.count > 1 ? "s" : ""}`} size="sm" />
                </button>
              );
            },
          },
          { key: "actions", header: "", align: "right", render: (e) => (
            <button
              onClick={() => { setSelectedTab("Resumen"); setSelected(e.id); }}
              aria-label={`Ver ficha de ${e.code}`}
              className="eam-focus rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--accent)]"
            >
              <Eye className="h-4 w-4" />
            </button>
          ) },
        ]}
      />

      {selected && <Asset360Modal assetId={selected} onClose={() => setSelected(null)} role={role} initialTab={selectedTab} />}
    </div>
  );
}


function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="eam-card rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--accent)]/30">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className={`eam-nums mt-1 text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{value}</p>
    </div>
  );
}
