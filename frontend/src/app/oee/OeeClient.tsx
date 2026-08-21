"use client";

import { useState } from "react";
import { toast } from "sonner";
import { OeeDashboard, type ProductionTrendPoint } from "@/components/oee/OeeDashboard";
import { apiUrl, cn } from "@/lib/utils";
import { SortableTable } from "@/components/SortableTable";
import { can } from "@/lib/permissions";
import {
  RO_TRAINS, QUALITY_LIMITS, DOWNTIME_TYPE_LABELS, DOWNTIME_CAUSE_LABELS,
  ALERT_METRIC_LABELS, type OeeSummary,
} from "@/lib/oee-types";
import type {
  DowntimeRow, QualityRow, ShiftRow, AlertRow, AlertRuleRow,
} from "@/lib/oee";

const TABS = ["Dashboard", "Paradas", "Calidad", "Turnos y Metas", "Alertas"] as const;
type Tab = (typeof TABS)[number];

const dt = (iso: string) => new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// ── átomos ───────────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = { critico: "bg-red-500/15 text-red-600", advertencia: "bg-amber-500/15 text-amber-600", info: "bg-sky-500/15 text-sky-600" };
  const lbl: Record<string, string> = { critico: "Crítico", advertencia: "Advertencia", info: "Info" };
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", map[level] ?? "bg-muted")}>{lbl[level] ?? level}</span>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{label}{children}</label>;
}
const inputCls = "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

// ── componente principal ─────────────────────────────────────────────────────
export function OeeClient({ role, summary, downtime, quality, shifts, alerts, rules, productionTrend }: {
  role: string;
  summary: OeeSummary;
  downtime: DowntimeRow[];
  quality: QualityRow[];
  shifts: ShiftRow[];
  alerts: AlertRow[];
  rules: AlertRuleRow[];
  productionTrend?: ProductionTrendPoint[];
}) {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [dtRows, setDtRows] = useState(downtime);
  const [qRows, setQRows] = useState(quality);
  const [shiftRows, setShiftRows] = useState(shifts);
  const [alertRows, setAlertRows] = useState(alerts);
  const [ruleRows, setRuleRows] = useState(rules);

  const refetch = async <T,>(path: string, set: (v: T) => void) => {
    const res = await fetch(apiUrl(path));
    if (res.ok) set(await res.json());
  };
  const send = async (path: string, method: string, body?: unknown): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl(path), { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo completar la acción"); return false; }
      return true;
    } catch { toast.error("Error de red"); return false; }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t ? "border-[var(--accent)] font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && <OeeDashboard summary={summary} productionTrend={productionTrend} />}
      {tab === "Paradas" && (
        <ParadasTab role={role} rows={dtRows} shifts={shiftRows}
          onChange={() => refetch("/api/oee/downtime", setDtRows)} send={send} />
      )}
      {tab === "Calidad" && (
        <CalidadTab role={role} rows={qRows}
          onChange={() => refetch("/api/oee/quality", setQRows)} send={send} />
      )}
      {tab === "Turnos y Metas" && (
        <TurnosTab role={role} rows={shiftRows}
          onChange={() => refetch("/api/oee/shifts", setShiftRows)} send={send} />
      )}
      {tab === "Alertas" && (
        <AlertasTab role={role} alerts={alertRows} rules={ruleRows}
          onAlerts={() => refetch("/api/oee/alerts", setAlertRows)}
          onRules={() => refetch("/api/oee/alert-rules", setRuleRows)} send={send} />
      )}
    </div>
  );
}

// ── Paradas ────────────────────────────────────────────────────────────────────
function ParadasTab({ role, rows, shifts, onChange, send }: {
  role: string; rows: DowntimeRow[]; shifts: ShiftRow[];
  onChange: () => void; send: (p: string, m: string, b?: unknown) => Promise<boolean>;
}) {
  const canLog = can(role, "log_downtime");
  const canVal = can(role, "validate_downtime");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ trainCode: "A25-1", type: "no_planificada", cause: "mecanica", startTime: nowLocal(), endTime: "", description: "" });

  const submit = async () => {
    if (!f.description.trim()) { toast.error("Descripción requerida"); return; }
    const ok = await send("/api/oee/downtime", "POST", { ...f, endTime: f.endTime || null, shiftId: null });
    if (ok) { toast.success("Parada registrada"); setOpen(false); setF({ ...f, description: "", endTime: "" }); onChange(); }
  };
  const validate = async (id: string) => { if (await send("/api/oee/downtime", "PATCH", { id, validate: true })) { toast.success("Parada validada"); onChange(); } };
  const remove = async (id: string) => { if (await send(`/api/oee/downtime?id=${id}`, "DELETE")) { toast.success("Eliminada"); onChange(); } };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Registro de paradas <span className="text-muted-foreground">({rows.length})</span></h2>
        {canLog && <button onClick={() => setOpen((v) => !v)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">{open ? "Cerrar" : "+ Registrar parada"}</button>}
      </div>
      {open && canLog && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <Field label="Tren"><select className={inputCls} value={f.trainCode} onChange={(e) => setF({ ...f, trainCode: e.target.value })}>{RO_TRAINS.map((c) => <option key={c} value={c}>{c.replace("A25-", "RO-")}</option>)}</select></Field>
          <Field label="Tipo"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(DOWNTIME_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Causa raíz"><select className={inputCls} value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })}>{Object.entries(DOWNTIME_CAUSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Inicio"><input type="datetime-local" className={inputCls} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="Fin (opcional)"><input type="datetime-local" className={inputCls} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
          <Field label="Descripción"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Detalle de la parada" /></Field>
          <div className="sm:col-span-3"><button onClick={submit} className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white">Guardar</button></div>
        </div>
      )}
      <SortableTable
        rows={rows}
        getRowKey={(d) => d.id}
        initialSort={{ key: "start", dir: "desc" }}
        emptyText="Sin paradas registradas."
        columns={[
          { key: "train", header: "Tren", sortAccessor: (d) => d.trainCode, render: (d) => <span className="font-mono">{d.trainCode.replace("A25-", "RO-")}</span> },
          { key: "type", header: "Tipo", sortAccessor: (d) => DOWNTIME_TYPE_LABELS[d.type as keyof typeof DOWNTIME_TYPE_LABELS] ?? d.type, render: (d) => DOWNTIME_TYPE_LABELS[d.type as keyof typeof DOWNTIME_TYPE_LABELS] ?? d.type },
          { key: "cause", header: "Causa", sortAccessor: (d) => DOWNTIME_CAUSE_LABELS[d.cause as keyof typeof DOWNTIME_CAUSE_LABELS] ?? d.cause, render: (d) => DOWNTIME_CAUSE_LABELS[d.cause as keyof typeof DOWNTIME_CAUSE_LABELS] ?? d.cause },
          { key: "start", header: "Inicio", sortAccessor: (d) => new Date(d.startTime).getTime(), render: (d) => <span className="tabular-nums">{dt(d.startTime)}</span> },
          { key: "dur", header: "Duración", align: "right", sortAccessor: (d) => d.durationMin ?? null, render: (d) => <span className="tabular-nums">{d.durationMin != null ? `${d.durationMin} min` : "—"}</span> },
          { key: "desc", header: "Descripción", sortAccessor: (d) => d.description, render: (d) => <span className="block max-w-[220px] truncate" title={d.description}>{d.description}</span> },
          { key: "status", header: "Estado", sortAccessor: (d) => (d.validated ? 1 : 0), render: (d) => d.validated ? <span className="text-green-600">✓ Validada</span> : <span className="text-amber-600">Pendiente</span> },
          { key: "actions", header: "", align: "right", render: (d) => (
            <>
              {!d.validated && canVal && <button onClick={() => validate(d.id)} className="mr-2 text-xs text-[var(--accent)] hover:underline">Validar</button>}
              {canVal && <button onClick={() => remove(d.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>}
            </>
          ) },
        ]}
      />
    </div>
  );
}

// ── Calidad ────────────────────────────────────────────────────────────────────
function CalidadTab({ role, rows, onChange, send }: {
  role: string; rows: QualityRow[]; onChange: () => void; send: (p: string, m: string, b?: unknown) => Promise<boolean>;
}) {
  const canLog = can(role, "log_quality");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ trainCode: "A25-1", conductivity: "350", tds: "290", ph: "7.4", boron: "1.0", notes: "" });
  const submit = async () => {
    const body = { trainCode: f.trainCode, conductivity: Number(f.conductivity), tds: Number(f.tds), ph: Number(f.ph), boron: Number(f.boron), notes: f.notes };
    if ([body.conductivity, body.tds, body.ph, body.boron].some((n) => Number.isNaN(n))) { toast.error("Valores numéricos inválidos"); return; }
    const ok = await send("/api/oee/quality", "POST", body);
    if (ok) { toast.success("Medición registrada"); setOpen(false); onChange(); }
  };
  const remove = async (id: string) => { if (await send(`/api/oee/quality?id=${id}`, "DELETE")) { toast.success("Eliminada"); onChange(); } };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Calidad del permeado <span className="text-muted-foreground">({rows.length})</span></h2>
        {canLog && <button onClick={() => setOpen((v) => !v)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">{open ? "Cerrar" : "+ Registrar medición"}</button>}
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Límites de spec (NCh409 / desal): conductividad ≤ {QUALITY_LIMITS.conductivityMax} µS/cm · SDT ≤ {QUALITY_LIMITS.tdsMax} mg/l · pH {QUALITY_LIMITS.phMin}–{QUALITY_LIMITS.phMax} · boro ≤ {QUALITY_LIMITS.boronMax} mg/l
      </div>
      {open && canLog && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Tren"><select className={inputCls} value={f.trainCode} onChange={(e) => setF({ ...f, trainCode: e.target.value })}>{RO_TRAINS.map((c) => <option key={c} value={c}>{c.replace("A25-", "RO-")}</option>)}</select></Field>
          <Field label="Conductividad µS/cm"><input className={inputCls} value={f.conductivity} onChange={(e) => setF({ ...f, conductivity: e.target.value })} /></Field>
          <Field label="SDT mg/l"><input className={inputCls} value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })} /></Field>
          <Field label="pH"><input className={inputCls} value={f.ph} onChange={(e) => setF({ ...f, ph: e.target.value })} /></Field>
          <Field label="Boro mg/l"><input className={inputCls} value={f.boron} onChange={(e) => setF({ ...f, boron: e.target.value })} /></Field>
          <Field label="Notas"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="sm:col-span-3 lg:col-span-6"><button onClick={submit} className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white">Guardar</button></div>
        </div>
      )}
      <SortableTable
        rows={rows}
        getRowKey={(q) => q.id}
        initialSort={{ key: "date", dir: "desc" }}
        emptyText="Sin mediciones registradas."
        columns={[
          { key: "train", header: "Tren", sortAccessor: (q) => q.trainCode, render: (q) => <span className="font-mono">{q.trainCode.replace("A25-", "RO-")}</span> },
          { key: "date", header: "Fecha", sortAccessor: (q) => new Date(q.ts).getTime(), render: (q) => <span className="tabular-nums">{dt(q.ts)}</span> },
          { key: "cond", header: "Cond.", align: "right", sortAccessor: (q) => q.conductivity, render: (q) => <span className={cn("tabular-nums", q.conductivity > QUALITY_LIMITS.conductivityMax && "text-red-600")}>{q.conductivity}</span> },
          { key: "tds", header: "SDT", align: "right", sortAccessor: (q) => q.tds, render: (q) => <span className={cn("tabular-nums", q.tds > QUALITY_LIMITS.tdsMax && "text-red-600")}>{q.tds}</span> },
          { key: "ph", header: "pH", align: "right", sortAccessor: (q) => q.ph, render: (q) => <span className={cn("tabular-nums", (q.ph < QUALITY_LIMITS.phMin || q.ph > QUALITY_LIMITS.phMax) && "text-red-600")}>{q.ph}</span> },
          { key: "boron", header: "Boro", align: "right", sortAccessor: (q) => q.boron, render: (q) => <span className={cn("tabular-nums", q.boron > QUALITY_LIMITS.boronMax && "text-red-600")}>{q.boron}</span> },
          { key: "status", header: "Estado", sortAccessor: (q) => q.status, render: (q) => q.status === "conforme" ? <span className="text-green-600">✓ Conforme</span> : <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-600">No conforme</span> },
          { key: "actions", header: "", align: "right", render: (q) => canLog ? <button onClick={() => remove(q.id)} className="text-xs text-red-500 hover:underline">Eliminar</button> : null },
        ]}
      />
    </div>
  );
}

// ── Turnos y Metas ──────────────────────────────────────────────────────────────
function TurnosTab({ role, rows, onChange, send }: {
  role: string; rows: ShiftRow[]; onChange: () => void; send: (p: string, m: string, b?: unknown) => Promise<boolean>;
}) {
  const canManage = can(role, "manage_shifts");
  const [edit, setEdit] = useState<ShiftRow | null>(null);
  const save = async (s: ShiftRow) => {
    const ok = await send("/api/oee/shifts", "POST", s);
    if (ok) { toast.success("Turno guardado"); setEdit(null); onChange(); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Turnos y metas de producción</h2>
        {canManage && <button onClick={() => setEdit({ id: "", name: "", startHour: 7, endHour: 19, targetM3h: 320, oeeTarget: 85, oeeAcceptable: 75, oeeCritical: 60 })} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">+ Nuevo turno</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{s.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{String(s.startHour).padStart(2, "0")}:00–{String(s.endHour).padStart(2, "0")}:00</div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div><div className="font-mono text-base">{s.targetM3h}</div><div className="text-muted-foreground">m³/h meta</div></div>
              <div><div className="font-mono text-base text-green-600">{s.oeeTarget}</div><div className="text-muted-foreground">objetivo</div></div>
              <div><div className="font-mono text-base text-amber-600">{s.oeeAcceptable}</div><div className="text-muted-foreground">aceptable</div></div>
              <div><div className="font-mono text-base text-red-600">{s.oeeCritical}</div><div className="text-muted-foreground">crítico</div></div>
            </div>
            {canManage && <button onClick={() => setEdit(s)} className="mt-3 text-xs text-[var(--accent)] hover:underline">Editar</button>}
          </div>
        ))}
      </div>
      {edit && canManage && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
          <div className="sm:col-span-4 text-sm font-semibold">{edit.id ? `Editar ${edit.name}` : "Nuevo turno"}</div>
          <Field label="Nombre"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Hora inicio"><input className={inputCls} type="number" value={edit.startHour} onChange={(e) => setEdit({ ...edit, startHour: Number(e.target.value) })} /></Field>
          <Field label="Hora fin"><input className={inputCls} type="number" value={edit.endHour} onChange={(e) => setEdit({ ...edit, endHour: Number(e.target.value) })} /></Field>
          <Field label="Meta m³/h"><input className={inputCls} type="number" value={edit.targetM3h} onChange={(e) => setEdit({ ...edit, targetM3h: Number(e.target.value) })} /></Field>
          <Field label="OEE objetivo"><input className={inputCls} type="number" value={edit.oeeTarget} onChange={(e) => setEdit({ ...edit, oeeTarget: Number(e.target.value) })} /></Field>
          <Field label="OEE aceptable"><input className={inputCls} type="number" value={edit.oeeAcceptable} onChange={(e) => setEdit({ ...edit, oeeAcceptable: Number(e.target.value) })} /></Field>
          <Field label="OEE crítico"><input className={inputCls} type="number" value={edit.oeeCritical} onChange={(e) => setEdit({ ...edit, oeeCritical: Number(e.target.value) })} /></Field>
          <div className="flex items-end gap-2"><button onClick={() => save(edit)} className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white">Guardar</button><button onClick={() => setEdit(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancelar</button></div>
        </div>
      )}
    </div>
  );
}

// ── Alertas ─────────────────────────────────────────────────────────────────────
function AlertasTab({ role, alerts, rules, onAlerts, onRules, send }: {
  role: string; alerts: AlertRow[]; rules: AlertRuleRow[];
  onAlerts: () => void; onRules: () => void; send: (p: string, m: string, b?: unknown) => Promise<boolean>;
}) {
  const canAck = can(role, "ack_alert");
  const canRules = can(role, "manage_alert_rules");
  const ack = async (id: string) => { if (await send("/api/oee/alerts", "PATCH", { id, action: "ack" })) { toast.success("Alerta reconocida"); onAlerts(); } };
  const resolve = async (id: string) => { const a = prompt("Acción tomada (opcional):") ?? undefined; if (await send("/api/oee/alerts", "PATCH", { id, action: "resolve", actionTaken: a })) { toast.success("Alerta resuelta"); onAlerts(); } };
  const toggle = async (r: AlertRuleRow) => { if (await send("/api/oee/alert-rules", "PATCH", { id: r.id, enabled: !r.enabled })) { onRules(); } };
  const statusLbl: Record<string, string> = { activa: "Activa", reconocida: "Reconocida", resuelta: "Resuelta" };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-2">
        <h2 className="text-sm font-semibold">Alertas <span className="text-muted-foreground">({alerts.length})</span></h2>
        {alerts.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <LevelBadge level={a.level} />
                <span className="text-sm">{a.message}</span>
              </div>
              <span className={cn("shrink-0 text-[11px]", a.status === "activa" ? "text-red-600" : a.status === "reconocida" ? "text-amber-600" : "text-green-600")}>{statusLbl[a.status]}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{dt(a.ts)}</span>
              {a.trainCode && <span className="font-mono">{a.trainCode.replace("A25-", "RO-")}</span>}
              {a.ackBy && <span>Rec.: {a.ackBy}</span>}
              {a.actionTaken && <span className="italic">“{a.actionTaken}”</span>}
            </div>
            {canAck && a.status !== "resuelta" && (
              <div className="mt-2 flex gap-2">
                {a.status === "activa" && <button onClick={() => ack(a.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Reconocer</button>}
                <button onClick={() => resolve(a.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Resolver</button>
              </div>
            )}
          </div>
        ))}
        {alerts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin alertas.</p>}
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Reglas de alerta</h2>
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{r.name}</span>
              <LevelBadge level={r.level} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {ALERT_METRIC_LABELS[r.metric] ?? r.metric} {r.op === "lt" ? "<" : ">"} {r.threshold}
              {r.trainCode ? ` · ${r.trainCode.replace("A25-", "RO-")}` : " · todos"}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn("text-[11px]", r.enabled ? "text-green-600" : "text-muted-foreground")}>{r.enabled ? "Habilitada" : "Deshabilitada"}</span>
              {canRules && <button onClick={() => toggle(r)} className="text-[11px] text-[var(--accent)] hover:underline">{r.enabled ? "Deshabilitar" : "Habilitar"}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
