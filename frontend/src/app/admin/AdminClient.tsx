"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, RotateCcw, X, Check } from "lucide-react";
import { apiUrl, cn } from "@/lib/utils";
import type { PlantConfig, EquipmentDef, EquipmentKind } from "@/lib/plant-config";

const KINDS: EquipmentKind[] = ["debarker","chipper","conveyor","pile","silo","impregnation","digester","tank","washer","screen","o2reactor","dryer","evaporator","recovery_boiler","power_boiler","lime_kiln","causticizer","turbogen","pump","fan"];
const STATUSES = ["running","idle","maintenance","stopped"] as const;
const CRITS = ["low","medium","high","critical"] as const;

const clone = (c: PlantConfig): PlantConfig => JSON.parse(JSON.stringify(c));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]";

type Draft = EquipmentDef & { _sigKey: string; _sigLabel: string; _sigUnit: string; _sigBase: number; _sigAmp: number };

function toDraft(e: EquipmentDef): Draft {
  const s = e.signals.find((x) => x.signal === e.primarySignal) ?? e.signals[0];
  return { ...e, _sigKey: s?.signal ?? "value", _sigLabel: s?.label ?? "Valor", _sigUnit: s?.unit ?? "", _sigBase: s?.base ?? 0, _sigAmp: s?.amp ?? 1 };
}
function emptyDraft(areaCode: string): Draft {
  return { code: "", name: "", kind: "pump", areaCode, category: "Pumps", criticality: "medium", status: "running", health: 90, runtime: 0, manufacturer: "", model: "", specs: {}, mimic: { x: 0, y: 0 }, primarySignal: "value", signals: [], help: "", _sigKey: "value", _sigLabel: "Valor", _sigUnit: "", _sigBase: 0, _sigAmp: 1 };
}
function fromDraft(d: Draft): EquipmentDef {
  const sig = { signal: d._sigKey, label: d._sigLabel, unit: d._sigUnit, base: Number(d._sigBase), amp: Number(d._sigAmp) };
  // preserva señales extra, reemplaza/inserta la primaria
  const others = (d.signals ?? []).filter((s) => s.signal !== d._sigKey && s.signal !== d.primarySignal);
  return {
    code: d.code.trim(), name: d.name.trim(), kind: d.kind, areaCode: d.areaCode, category: d.category, criticality: d.criticality,
    status: d.status, health: Number(d.health), runtime: Number(d.runtime) || 0, manufacturer: d.manufacturer, model: d.model,
    specs: d.specs ?? {}, mimic: { x: Number(d.mimic.x), y: Number(d.mimic.y) }, primarySignal: d._sigKey,
    signals: [sig, ...others], help: d.help ?? "",
  };
}

export function AdminClient({ initial }: { initial: PlantConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<PlantConfig>(() => clone(initial));
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(initial), [cfg, initial]);

  function patchPlant(k: keyof PlantConfig["plant"], v: string) { setCfg((c) => ({ ...c, plant: { ...c.plant, [k]: v } })); }
  function patchFlag<K extends keyof PlantConfig["flags"]>(k: K, v: PlantConfig["flags"][K]) { setCfg((c) => ({ ...c, flags: { ...c.flags, [k]: v } })); }
  function patchBrand(k: keyof PlantConfig["branding"], v: string) { setCfg((c) => ({ ...c, branding: { ...c.branding, [k]: v } })); }

  function saveEquipment(d: Draft) {
    if (!d.code.trim() || !d.name.trim()) { toast.error("Código y nombre son obligatorios"); return; }
    const eq = fromDraft(d);
    setCfg((c) => {
      const exists = c.equipment.some((e) => e.code === eq.code);
      const list = isNew
        ? (exists ? c.equipment : [...c.equipment, eq])
        : c.equipment.map((e) => (e.code === eq.code ? eq : e));
      if (isNew && exists) toast.error(`Ya existe un equipo con código ${eq.code}`);
      return { ...c, equipment: list };
    });
    setEditing(null); setIsNew(false);
  }
  function removeEquipment(code: string) { setCfg((c) => ({ ...c, equipment: c.equipment.filter((e) => e.code !== code) })); }

  async function persist() {
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/plant-config"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "No se pudo guardar"); return; }
      toast.success(`Config guardada · ${data.equipment} equipos`);
      router.refresh();
    } catch { toast.error("Error de red"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          Editá la planta y guardá para que el <b className="text-foreground">mímico</b> y las <b className="text-foreground">vistas</b> reflejen los cambios. Este es el motor de replicación: clonar y editar esta config = nueva planta.
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={!dirty || saving} onClick={() => setCfg(clone(initial))}
            className={cn("inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40")}>
            <RotateCcw className="size-3.5" /> Descartar
          </button>
          <button type="button" disabled={!dirty || saving} onClick={persist}
            className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40")} style={{ background: "var(--accent)" }}>
            <Save className="size-3.5" /> {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Identidad + proceso */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Identidad de planta</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre"><input className={inputCls} value={cfg.plant.name} onChange={(e) => patchPlant("name", e.target.value)} /></Field>
            <Field label="Empresa"><input className={inputCls} value={cfg.plant.company} onChange={(e) => patchPlant("company", e.target.value)} /></Field>
            <Field label="Producto"><input className={inputCls} value={cfg.plant.product} onChange={(e) => patchPlant("product", e.target.value)} /></Field>
            <Field label="Capacidad"><input className={inputCls} value={cfg.plant.capacity} onChange={(e) => patchPlant("capacity", e.target.value)} /></Field>
            <Field label="Ubicación"><input className={inputCls} value={cfg.plant.location} onChange={(e) => patchPlant("location", e.target.value)} /></Field>
            <Field label="Puesta en marcha"><input className={inputCls} value={cfg.plant.commissioned} onChange={(e) => patchPlant("commissioned", e.target.value)} /></Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Proceso</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fase operativa">
              <select className={inputCls} value={cfg.flags.phase} onChange={(e) => patchFlag("phase", Number(e.target.value))}>
                <option value={1}>Fase 1</option><option value={2}>Fase 2</option><option value={3}>Fase 3</option>
              </select>
            </Field>
            <Field label="Caudal captación (l/s)"><input type="number" className={inputCls} value={cfg.flags.phaseLs} onChange={(e) => patchFlag("phaseLs", Number(e.target.value))} /></Field>
            <Field label="Recuperación de energía (ERI)">
              <select className={inputCls} value={String(cfg.flags.eri)} onChange={(e) => patchFlag("eri", e.target.value === "true")}>
                <option value="true">Instalada</option><option value="false">Sin ERI</option>
              </select>
            </Field>
            <Field label="Recovery objetivo (%)"><input type="number" className={inputCls} value={cfg.flags.recoveryPct} onChange={(e) => patchFlag("recoveryPct", Number(e.target.value))} /></Field>
            <Field label="Color primario (marca)"><input className={inputCls} value={cfg.branding.primary} onChange={(e) => patchBrand("primary", e.target.value)} /></Field>
            <Field label="Color acento"><input className={inputCls} value={cfg.branding.accent} onChange={(e) => patchBrand("accent", e.target.value)} /></Field>
          </div>
        </section>
      </div>

      {/* Equipos */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Equipos <span className="font-mono text-muted-foreground">({cfg.equipment.length})</span></h3>
          <button type="button" onClick={() => { setEditing(emptyDraft(cfg.areas[0]?.code ?? "")); setIsNew(true); }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-[var(--primary)] hover:text-[var(--primary)]">
            <Plus className="size-3.5" /> Agregar equipo
          </button>
        </div>

        {editing && (
          <EquipmentForm draft={editing} areas={cfg.areas.map((a) => a.code)} isNew={isNew}
            onCancel={() => { setEditing(null); setIsNew(false); }} onSave={saveEquipment} onChange={setEditing} />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Tipo</th>
                <th className="px-2 py-1.5">Área</th><th className="px-2 py-1.5">Estado</th><th className="px-2 py-1.5 text-right">Salud</th><th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {cfg.equipment.map((e) => (
                <tr key={e.code} className="border-t border-border">
                  <td className="px-2 py-2 font-mono text-xs font-semibold">{e.code}</td>
                  <td className="px-2 py-2 text-xs">{e.name}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{e.kind}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.areaCode}</td>
                  <td className="px-2 py-2 text-xs">{e.status}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-xs">{e.health}%</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label="Editar" onClick={() => { setEditing(toDraft(e)); setIsNew(false); }} className="rounded-md border border-border p-1 hover:border-[var(--primary)] hover:text-[var(--primary)]"><Pencil className="size-3.5" /></button>
                      <button type="button" aria-label="Eliminar" onClick={() => removeEquipment(e.code)} className="rounded-md border border-border p-1 hover:border-red-500 hover:text-red-500"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EquipmentForm({ draft, areas, isNew, onCancel, onSave, onChange }: {
  draft: Draft; areas: string[]; isNew: boolean; onCancel: () => void; onSave: (d: Draft) => void; onChange: (d: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="mb-4 rounded-lg border border-[var(--primary)]/40 bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{isNew ? "Nuevo equipo" : `Editar ${draft.code}`}</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Código"><input className={inputCls} value={draft.code} disabled={!isNew} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Nombre"><input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tipo"><select className={inputCls} value={draft.kind} onChange={(e) => set({ kind: e.target.value as EquipmentKind })}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <Field label="Área"><select className={inputCls} value={draft.areaCode} onChange={(e) => set({ areaCode: e.target.value })}>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        <Field label="Categoría"><input className={inputCls} value={draft.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Criticidad"><select className={inputCls} value={draft.criticality} onChange={(e) => set({ criticality: e.target.value as Draft["criticality"] })}>{CRITS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Estado"><select className={inputCls} value={draft.status} onChange={(e) => set({ status: e.target.value as Draft["status"] })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Salud %"><input type="number" className={inputCls} value={draft.health} onChange={(e) => set({ health: Number(e.target.value) })} /></Field>
        <Field label="Mímico X"><input type="number" className={inputCls} value={draft.mimic.x} onChange={(e) => set({ mimic: { ...draft.mimic, x: Number(e.target.value) } })} /></Field>
        <Field label="Mímico Y"><input type="number" className={inputCls} value={draft.mimic.y} onChange={(e) => set({ mimic: { ...draft.mimic, y: Number(e.target.value) } })} /></Field>
        <Field label="Señal (clave)"><input className={inputCls} value={draft._sigKey} onChange={(e) => set({ _sigKey: e.target.value })} /></Field>
        <Field label="Señal (etiqueta)"><input className={inputCls} value={draft._sigLabel} onChange={(e) => set({ _sigLabel: e.target.value })} /></Field>
        <Field label="Unidad"><input className={inputCls} value={draft._sigUnit} onChange={(e) => set({ _sigUnit: e.target.value })} /></Field>
        <Field label="Valor nominal"><input type="number" className={inputCls} value={draft._sigBase} onChange={(e) => set({ _sigBase: Number(e.target.value) })} /></Field>
        <Field label="Amplitud"><input type="number" className={inputCls} value={draft._sigAmp} onChange={(e) => set({ _sigAmp: Number(e.target.value) })} /></Field>
        <Field label="Ayuda (tooltip)"><input className={inputCls} value={draft.help} onChange={(e) => set({ help: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancelar</button>
        <button type="button" onClick={() => onSave(draft)} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-black" style={{ background: "var(--accent)" }}><Check className="size-3.5" /> Aplicar</button>
      </div>
    </div>
  );
}
