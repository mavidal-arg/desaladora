"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { X } from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { LIVE_UNIFIED } from "@/lib/flags";
import { StateBadge, SPCChart } from "@/components/mes";
import { FindingTreatDialog } from "@/components/FindingTreatDialog";
import { can } from "@/lib/permissions";
import { esWoType, esEquipCategory, esEquipStatus, esPartCategory, esStrategy, esTrend } from "@/lib/labels";
import type {
  Equipment, SignalValue, WorkOrder, MaintenancePlan, SparePart,
  SeDocument, NonConformity, CostBreakdown, PredictiveProfile, TrendPoint,
} from "@/lib/adapters/types";
import type { EquipmentFindingRecurrence } from "@/lib/finding-treatment";

interface Asset360 {
  equipment: Equipment;
  currentValues: SignalValue[];
  workOrders: WorkOrder[];
  plans: MaintenancePlan[];
  parts: SparePart[];
  documents: SeDocument[];
  nonConformities: NonConformity[];
  costs: CostBreakdown;
  predictive: PredictiveProfile | null;
  findingHistory: EquipmentFindingRecurrence[];
}

const TABS = ["Resumen", "Maintenance", "Planes", "Monitoreo", "Tiempo real", "Repuestos", "SOP"] as const;
type Tab = (typeof TABS)[number];

const fmtDate = (s: string) => new Date(s).toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });
/** Con hora: una observación de terreno se ubica por turno, no sólo por día. */
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("es-AR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

export function Asset360Modal({ assetId, onClose, role = "Lector", initialTab = "Resumen" }: {
  assetId: string; onClose: () => void; role?: string; initialTab?: Tab;
}) {
  const [data, setData] = useState<Asset360 | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendSignal, setTrendSignal] = useState<string>("");

  const reload = useCallback(() => {
    fetch(apiUrl(`/api/assets/${assetId}`))
      .then((r) => r.json())
      .then((d: Asset360) => {
        setData(d);
        setTrendSignal((prev) => prev || d.currentValues[0]?.signal || "");
      });
  }, [assetId]);

  useEffect(() => {
    let live = true;
    fetch(apiUrl(`/api/assets/${assetId}`))
      .then((r) => r.json())
      .then((d: Asset360) => {
        if (!live) return;
        setData(d);
        if (d.currentValues[0]) setTrendSignal(d.currentValues[0].signal);
      });
    return () => { live = false; };
  }, [assetId]);

  const loadTrend = useCallback((signal: string) => {
    setTrendSignal(signal);
    fetch(apiUrl(`/api/assets/${assetId}/trend?signal=${encodeURIComponent(signal)}&days=14`))
      .then((r) => r.json())
      .then((d: { points: TrendPoint[] }) => setTrend(d.points));
  }, [assetId]);

  useEffect(() => { if (trendSignal) loadTrend(trendSignal); }, [trendSignal, loadTrend]);

  return (
    <div className="eam-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        className="eam-modal-in eam-card mt-2 w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:mt-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!data ? (
          <div className="p-10 text-center text-sm text-[var(--muted-foreground)]">Cargando ficha del activo…</div>
        ) : (
          <Asset360Body
            data={data} tab={tab} setTab={setTab} trend={trend}
            trendSignal={trendSignal} onPickSignal={loadTrend} onClose={onClose}
            role={role} onChanged={reload}
          />
        )}
      </div>
    </div>
  );
}

function Asset360Body({
  data, tab, setTab, trend, trendSignal, onPickSignal, onClose, role, onChanged,
}: {
  data: Asset360; tab: Tab; setTab: (t: Tab) => void; trend: TrendPoint[];
  trendSignal: string; onPickSignal: (s: string) => void; onClose: () => void;
  role: string; onChanged: () => void;
}) {
  const e = data.equipment;
  const pending = data.workOrders.filter((w) => w.status !== "completed").length;
  const completed = data.workOrders.filter((w) => w.status === "completed").length;
  const completion = data.workOrders.length ? Math.round((completed / data.workOrders.length) * 100) : 0;
  const openFindings = data.nonConformities.filter((n) => n.status !== "closed").length;

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-4 border-b border-[var(--border)] p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] text-lg font-bold">
          {e.code.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[var(--accent)]">{e.code}</span>
            <StateBadge state={e.status} size="sm" />
          </div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">{e.name}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{esEquipCategory(e.category)} • {e.location}</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="eam-focus rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Mini-stats */}
      <div className="grid grid-cols-2 gap-px border-b border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
        <MiniStat label="Horas totales" value={`${e.runtimeHours.toLocaleString("es-AR")}h`} />
        <MiniStat label="Órdenes de trabajo" value={String(data.workOrders.length)} />
        <MiniStat label="Pendientes" value={String(pending)} />
        <MiniStat label="Cumplimiento" value={`${completion}%`} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`eam-focus -mb-px flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              tab === t
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "SOP" ? "SOP · Hallazgos" : t}
            {t === "SOP" && openFindings > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {openFindings}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[65vh] overflow-y-auto p-4 sm:max-h-[60vh] sm:p-5">
        {tab === "Resumen" && <OverviewTab e={e} />}
        {tab === "Maintenance" && <MaintenanceTab wos={data.workOrders} costs={data.costs} />}
        {tab === "Planes" && <PlansTab plans={data.plans} />}
        {tab === "Monitoreo" && <MonitoringTab predictive={data.predictive} trend={trend} signal={trendSignal} />}
        {tab === "Tiempo real" && (
          <RealtimeTab code={data.equipment.code} values={data.currentValues} trend={trend} signal={trendSignal} onPickSignal={onPickSignal} />
        )}
        {tab === "Repuestos" && <PartsTab parts={data.parts} />}
        {tab === "SOP" && (
          <SopTab docs={data.documents} ncs={data.nonConformities} findingHistory={data.findingHistory}
            canTreat={can(role, "close_nc")} onChanged={onChanged} />
        )}
      </div>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--card)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className="eam-nums mt-0.5 text-lg font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function OverviewTab({ e }: { e: Equipment }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Información básica</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Modelo" value={e.model} />
          <Field label="Fabricante" value={e.manufacturer} />
          <Field label="N° de serie" value={e.serialNumber} />
          <Field label="Fecha instalación" value={fmtDate(e.installDate)} />
          <Field label="Puesta en marcha" value={fmtDate(e.commissionDate)} />
          <Field label="Venc. garantía" value={fmtDate(e.warrantyExpiry)} />
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Especificaciones</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(e.specs).map(([k, v]) => <Field key={k} label={k} value={String(v)} />)}
        </div>
      </section>
      {/* El índice de salud vive en la pestaña Monitoreo, donde viene con su
          tendencia y la falla prevista. Acá se mostraba `healthIndex` crudo del
          catálogo: para un rack RO daba otro número que el de Monitoreo, con la
          misma etiqueta y en el mismo diálogo. */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Criticidad" value={e.criticality} />
        <Field label="Estado" value={esEquipStatus(e.status)} />
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{children}</th>;
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} className="px-3 py-2 text-xs text-[var(--foreground)]">{children}</td>;
}

/** Combina el snapshot app/field de una NC por señal. */
function mergeReadings(readings: NonConformity["readings"]): { label: string; unit: string; app?: number; field?: number }[] {
  const by = new Map<string, { label: string; unit: string; app?: number; field?: number }>();
  for (const r of readings ?? []) {
    const e = by.get(r.signal) ?? { label: r.label, unit: r.unit };
    if (r.source === "app") e.app = r.value; else e.field = r.value;
    by.set(r.signal, e);
  }
  return [...by.values()];
}
function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse">
        <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">{text}</p>;
}

function MaintenanceTab({ wos, costs }: { wos: WorkOrder[]; costs: CostBreakdown }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Costo total" value={`${costs.currency} ${costs.total.toLocaleString("es-AR")}`} />
        <Field label="Mano de obra" value={`${costs.currency} ${costs.labor.toLocaleString("es-AR")}`} />
        <Field label="Materiales" value={`${costs.currency} ${costs.materials.toLocaleString("es-AR")}`} />
        <Field label="Externos" value={`${costs.currency} ${costs.external.toLocaleString("es-AR")}`} />
      </div>
      {wos.length === 0 ? <Empty text="Sin órdenes de trabajo." /> : (
        <Table head={<><Th>Código</Th><Th>Tipo</Th><Th>Prioridad</Th><Th>Estado</Th><Th>Assignee</Th><Th>Due</Th></>}>
          {wos.map((w) => (
            <tr key={w.id}>
              <Td>{w.code}</Td>
              <Td><span>{esWoType(w.orderType)}</span></Td>
              <Td><StateBadge state={w.priority} size="sm" /></Td>
              <Td><StateBadge state={w.status.replace("_", "")} label={w.status.replace("_", " ")} size="sm" /></Td>
              <Td>{w.assignee ?? "—"}</Td>
              <Td>{w.dueAt ? fmtDate(w.dueAt) : "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function PlansTab({ plans }: { plans: MaintenancePlan[] }) {
  if (plans.length === 0) return <Empty text="Sin planes de mantenimiento." />;
  return (
    <Table head={<><Th>Estrategia</Th><Th>Intervalo</Th><Th>Próximo</Th><Th>Tareas</Th></>}>
      {plans.map((p) => (
        <tr key={p.id}>
          <Td><span>{esStrategy(p.strategy)}</span></Td>
          <Td>{p.intervalLabel}</Td>
          <Td>{fmtDate(p.nextDueAt)}</Td>
          <Td>{p.taskList.join(" · ")}</Td>
        </tr>
      ))}
    </Table>
  );
}

function controlLimits(points: TrendPoint[]) {
  if (points.length === 0) return { cl: 0, ucl: 1, lcl: 0 };
  const vals = points.map((p) => p.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || Math.abs(mean) * 0.05 || 1;
  return { cl: round(mean), ucl: round(mean + 3 * sd), lcl: round(mean - 3 * sd) };
}
const round = (n: number) => Math.round(n * 100) / 100;
const spcData = (points: TrendPoint[]) =>
  points.map((p) => ({ x: new Date(p.ts).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }), value: p.value }));

function MonitoringTab({ predictive, trend, signal }: { predictive: PredictiveProfile | null; trend: TrendPoint[]; signal: string }) {
  const lim = controlLimits(trend);
  return (
    <div className="space-y-4">
      {predictive ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Índice de salud" value={`${predictive.healthScore}%`} />
          <Field label="Tendencia" value={esTrend(predictive.trend)} />
          <Field label="Falla prevista" value={predictive.predFailureDays ? `${predictive.predFailureDays} días` : "—"} />
        </div>
      ) : <Empty text="Equipo no configurado para predictivo." />}
      {predictive && predictive.anomalies.length > 0 && (
        <Table head={<><Th>Parameter</Th><Th>Value</Th><Th>Δ</Th></>}>
          {predictive.anomalies.map((a, i) => (
            <tr key={i}><Td>{a.param}</Td><Td>{a.value}</Td><Td><span className="text-red-500">↗ +{a.delta}</span></Td></tr>
          ))}
        </Table>
      )}
      {trend.length > 0 && <SPCChart data={spcData(trend)} ucl={lim.ucl} cl={lim.cl} lcl={lim.lcl} label={`${signal} — 14 días`} />}
    </div>
  );
}

function RealtimeTab({
  code, values, trend, signal, onPickSignal,
}: { code: string; values: SignalValue[]; trend: TrendPoint[]; signal: string; onPickSignal: (s: string) => void }) {
  const lim = controlLimits(trend);
  // Con la fuente única el valor "respira" server-side: pollear /api/live/[code]
  // para verlo moverse, igual que el gemelo y el QR. Sin ella, queda el snapshot.
  const [live, setLive] = useState<SignalValue[] | null>(null);
  useEffect(() => {
    if (!LIVE_UNIFIED) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(apiUrl(`/api/live/${encodeURIComponent(code)}`));
        if (!r.ok || !alive) return;
        const d = await r.json();
        setLive((d.signals ?? []).map((s: { signal: string; value: number; unit: string; ts: string }) => ({
          signal: s.signal, value: s.value, unit: s.unit, ts: s.ts, quality: "good" as const,
        })));
      } catch { /* mantener último */ }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [code]);
  const shown = live ?? values;
  if (shown.length === 0) return <Empty text="Sin señales en tiempo real." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {shown.map((v) => (
          <button
            key={v.signal}
            onClick={() => onPickSignal(v.signal)}
            className={`eam-focus rounded-lg border px-3 py-2 text-left transition-colors ${
              signal === v.signal ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:bg-[var(--muted)]"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{v.signal}</p>
            <p className="eam-nums mt-0.5 text-sm font-semibold text-[var(--foreground)]">{v.value} <span className="text-[10px] font-normal text-[var(--muted-foreground)]">{v.unit}</span></p>
          </button>
        ))}
      </div>
      {trend.length > 0 && <SPCChart data={spcData(trend)} ucl={lim.ucl} cl={lim.cl} lcl={lim.lcl} label={`${signal} — tendencia 14 días`} />}
    </div>
  );
}

function PartsTab({ parts }: { parts: SparePart[] }) {
  if (parts.length === 0) return <Empty text="Sin repuestos asociados." />;
  return (
    <Table head={<><Th>Código</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Stock</Th><Th>Safety</Th><Th>Replaced</Th></>}>
      {parts.map((p) => (
        <tr key={p.id}>
          <Td>{p.code}</Td><Td>{p.name}</Td><Td>{esPartCategory(p.category)}</Td>
          <Td><span className={p.quantity <= p.safetyStock ? "text-red-500" : ""}>{p.quantity} {p.unit}</span></Td>
          <Td>{p.safetyStock}</Td><Td>{p.replacedCount}</Td>
        </tr>
      ))}
    </Table>
  );
}

const FINDING_TYPE_LABELS: Record<string, string> = {
  corrosion: "Corrosión", fuga_sello: "Fuga / sello", vibracion: "Vibración anormal", otro: "Otro",
};

function SopTab({ docs, ncs, findingHistory, canTreat, onChanged }: {
  docs: SeDocument[]; ncs: NonConformity[]; findingHistory: EquipmentFindingRecurrence[];
  canTreat: boolean; onChanged: () => void;
}) {
  const [treating, setTreating] = useState<NonConformity | null>(null);
  const countByType = new Map(findingHistory.map((f) => [f.findingType, f.count]));

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Documentos (SE Suite)</h3>
        {docs.length === 0 ? <Empty text="Sin documentos." /> : (
          <Table head={<><Th>Código</Th><Th>Title</Th><Th>Tipo</Th><Th>Rev</Th></>}>
            {docs.map((d) => (
              <tr key={d.id}><Td>{d.code}</Td><Td>{d.title}</Td><Td>{d.docType}</Td><Td>{d.revision}</Td></tr>
            ))}
          </Table>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">No-conformidades</h3>
        {ncs.length === 0 ? <Empty text="Sin no-conformidades." /> : (
          <Table head={<><Th>Código</Th><Th>Severidad</Th><Th>Categoría</Th><Th>Descripción</Th><Th>Estado</Th><Th>Autor</Th><Th>Reportada</Th><Th>{""}</Th></>}>
            {ncs.map((n) => (
              <Fragment key={n.id}>
                <tr>
                  <Td>{n.code}</Td><Td><StateBadge state={n.severity} size="sm" /></Td>
                  <Td>
                    <span className="text-[var(--muted-foreground)]">{FINDING_TYPE_LABELS[n.findingType] ?? n.findingType}</span>
                    {(countByType.get(n.findingType) ?? 0) > 1 && (
                      <span className="ml-1.5 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                        levantado {countByType.get(n.findingType)}×
                      </span>
                    )}
                  </Td>
                  <Td>{n.description}</Td><Td><StateBadge state={n.status.replace("_", "")} label={n.status.replace("_", " ")} size="sm" /></Td>
                  <Td>
                    {n.raisedBy
                      ? <>{n.raisedBy}<span className="text-[var(--muted-foreground)]">{n.raisedByRole ? ` · ${n.raisedByRole}` : ""}</span></>
                      : <span className="text-[var(--muted-foreground)]">sistema</span>}
                  </Td>
                  <Td>{fmtDateTime(n.raisedAt)}</Td>
                  <Td>
                    <button onClick={() => setTreating(n)} className="rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--muted)]">
                      {canTreat ? "Tratar" : "Ver log"}
                    </button>
                  </Td>
                </tr>
                {(n.readings?.length ?? 0) > 0 && (
                  <tr>
                    <Td colSpan={8}>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Datos al levantar · </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">
                        {mergeReadings(n.readings!).map((r) => (
                          <span key={r.label} className="mr-3 inline-block font-mono">
                            {r.label}: {r.app != null ? r.app : "—"}{r.field != null ? ` (terreno ${r.field})` : ""} {r.unit}
                          </span>
                        ))}
                      </span>
                    </Td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </section>
      {treating && (
        <FindingTreatDialog
          nc={treating}
          canTreat={canTreat}
          onClose={() => setTreating(null)}
          onTreated={() => { onChanged(); setTreating(null); }}
        />
      )}
    </div>
  );
}
