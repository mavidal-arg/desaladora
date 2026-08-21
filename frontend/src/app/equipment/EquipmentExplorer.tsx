"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Eye, Plus } from "lucide-react";
import { StateBadge } from "@/components/mes";
import { FilterChip } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import type { Equipment } from "@/lib/adapters/types";
import { Asset360Modal } from "./Asset360Modal";
import { esEquipCategory } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { apiUrl } from "@/lib/utils";

type Area = { code: string; name: string };

const inputCls = "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const STATUS_OPTS = [["running", "En marcha"], ["idle", "En espera"], ["maintenance", "En mantenimiento"], ["stopped", "Detenido"]] as const;
const CRIT_OPTS = [["low", "Baja"], ["medium", "Media"], ["high", "Alta"], ["critical", "Crítica"]] as const;

export function EquipmentExplorer({
  equipment, areas, areaByCode, role, initialStatus, initialCategory,
}: {
  equipment: Equipment[];
  areas: Area[];
  areaByCode: Record<string, string>;
  role: string;
  initialStatus?: string;
  initialCategory?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [categoryFilter, setCategoryFilter] = useState(initialCategory ?? "");
  const [areaFilter, setAreaFilter] = useState("");

  const canCreate = can(role, "edit_equipment");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = { code: "", name: "", category: "", areaCode: areas[0]?.code ?? "", model: "", manufacturer: "", criticality: "medium", status: "running" };
  const [form, setForm] = useState(emptyForm);

  const areaName = (code: string) => areas.find((a) => a.code === code)?.name ?? code;
  const categories = useMemo(() => Array.from(new Set(equipment.map((e) => e.category))).sort(), [equipment]);

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

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.category.trim()) {
      toast.error("Código, nombre y categoría son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/assets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo crear el equipo"); return; }
      toast.success(`Equipo ${form.code} creado`);
      setShowForm(false);
      setForm(emptyForm);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

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
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" /> {showForm ? "Cerrar" : "Agregar equipo"}
          </button>
        )}
      </div>

      {/* Formulario de alta */}
      {showForm && canCreate && (
        <div className="mb-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Código *"><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="A99" /></Field>
          <Field label="Nombre *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bomba de alta presión 3" /></Field>
          <Field label="Categoría *">
            <input className={inputCls} list="eq-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Bombas" />
            <datalist id="eq-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Área"><select className={inputCls} value={form.areaCode} onChange={(e) => setForm({ ...form, areaCode: e.target.value })}>{areas.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>
          <Field label="Fabricante"><input className={inputCls} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
          <Field label="Modelo"><input className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Criticidad"><select className={inputCls} value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>{CRIT_OPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Estado"><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS_OPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button onClick={submit} disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar equipo"}</button>
            <button onClick={() => { setShowForm(false); setForm(emptyForm); }} className="rounded-md border border-[var(--border)] px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}

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
          { key: "actions", header: "", align: "right", render: (e) => (
            <button
              onClick={() => setSelected(e.id)}
              aria-label={`Ver ficha de ${e.code}`}
              className="eam-focus rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--accent)]"
            >
              <Eye className="h-4 w-4" />
            </button>
          ) },
        ]}
      />

      {selected && <Asset360Modal assetId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">{label}{children}</label>;
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="eam-card rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--accent)]/30">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className={`eam-nums mt-1 text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{value}</p>
    </div>
  );
}
