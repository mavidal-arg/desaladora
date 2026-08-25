"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  Bar, ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Cell, Tooltip as RTooltip,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CHART } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import {
  DOWNTIME_SUBCAUSES, DOWNTIME_TYPE_LABELS, SUBCAUSE_BY_CODE, UNCLASSIFIED_SUBCAUSE,
  type ParetoCause,
} from "@/lib/oee-types";

// ─────────────────────────────────────────────────────────────────────────────
// Pareto de paradas por causa raíz — documentado y explorable.
//
// El gráfico ya existía, pero no se explicaba solo: cinco barras y una curva sin
// decir qué miden ni por qué están en ese orden. Nadie podía responder "¿por qué
// Proceso es la mayor causa raíz?" mirando la pantalla. Lo que se agrega:
//
//   · una ayuda que dice CÓMO se define la mayor causa (orden por minutos
//     acumulados en la ventana) y qué es la curva roja;
//   · la línea del 80 %, que es lo que convierte un gráfico de barras en un
//     Pareto: separa las "pocas vitales" del resto;
//   · dos conmutadores — minutos vs. nº de eventos, y todas las paradas vs. sólo
//     las no planificadas — porque "la mayor" DEPENDE de esas dos elecciones, y
//     dejarlas fijas y ocultas es lo que hacía al gráfico incontestable;
//   · al pasar el mouse por una barra, el desglose real de causas raíz que la
//     componen; al hacer click, el detalle completo con los eventos y el catálogo
//     de modos de falla típicos con sus indicadores tempranos.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "var(--accent)";
const fmt = (n: number) => n.toLocaleString("es-CL");

type Metric = "minutes" | "events";
type Scope = "all" | "unplanned";

/** Fila del gráfico, ya resuelta según métrica y alcance elegidos. */
type Row = {
  cause: ParetoCause;
  label: string;
  value: number;
  cumPct: number;
  pct: number;
};

const METRIC_LABEL: Record<Metric, string> = { minutes: "Minutos", events: "Nº de eventos" };
const SCOPE_LABEL: Record<Scope, string> = { all: "Todas las paradas", unplanned: "Sólo no planificadas" };

function Segmented<T extends string>({
  value, onChange, options, labels, name,
}: { value: T; onChange: (v: T) => void; options: T[]; labels: Record<T, string>; name: string }) {
  return (
    <div role="group" aria-label={name} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] transition-colors",
            value === o
              ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
              : "text-muted-foreground hover:text-[var(--foreground)]",
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

/** Tooltip de barra: qué causas raíz REALES suman esta columna. */
function ParetoTooltip({ active, payload, metric }: { active?: boolean; payload?: readonly { payload: Row }[]; metric: Metric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const c = row.cause;
  const unit = metric === "minutes" ? "min" : "eventos";
  return (
    <div
      className="max-w-xs rounded-lg border p-2.5 text-xs shadow-lg"
      style={{ background: CHART.tooltipBg, borderColor: CHART.tooltipBorder }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{c.label}</span>
        <span className="font-mono tabular-nums">{fmt(row.value)} {unit}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {row.pct}% del total · acumulado {row.cumPct}%
      </div>

      <div className="mt-2 border-t pt-1.5" style={{ borderColor: CHART.tooltipBorder }}>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Causas raíz que suman esta columna
        </div>
        <ul className="space-y-0.5">
          {c.subCauses.slice(0, 5).map((s) => (
            <li key={s.code} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{s.label}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {metric === "minutes" ? `${fmt(s.minutes)} min` : `${s.events} ev.`}
              </span>
            </li>
          ))}
          {c.subCauses.length > 5 && (
            <li className="text-[11px] text-muted-foreground">+{c.subCauses.length - 5} más…</li>
          )}
        </ul>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">Click en la barra para ver el detalle</div>
    </div>
  );
}

/** Detalle de una categoría: lo que pasó de verdad + el catálogo de modos de falla. */
function CauseDialog({ cause, onClose }: { cause: ParetoCause | null; onClose: () => void }) {
  const catalogue = cause ? DOWNTIME_SUBCAUSES[cause.cause] ?? [] : [];
  const occurred = new Map((cause?.subCauses ?? []).map((s) => [s.code, s]));

  return (
    <Dialog open={!!cause} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Causas raíz — {cause?.label}</DialogTitle>
          <DialogDescription>
            {cause && (
              <>
                {fmt(cause.minutes)} min de parada en la ventana ({cause.pct}% del total, {cause.events}{" "}
                {cause.events === 1 ? "evento" : "eventos"}) ·{" "}
                {fmt(cause.unplannedMin)} min no planificados · {fmt(cause.plannedMin)} min planificados.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Lo que efectivamente ocurrió */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ocurrido en esta ventana
          </h3>
          <ul className="space-y-1.5">
            {(cause?.eventList ?? []).map((e) => {
              const sub = e.subCause ? SUBCAUSE_BY_CODE[e.subCause] : null;
              return (
                <li key={e.id} className="rounded-lg border border-border p-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">
                      {sub?.label ?? UNCLASSIFIED_SUBCAUSE.label}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {fmt(e.minutes)} min
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {e.startTime.slice(0, 10)} · {e.trainCode.replace("A25-", "RO-")} ·{" "}
                    {DOWNTIME_TYPE_LABELS[e.type]}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug">{e.description}</p>
                </li>
              );
            })}
            {!cause?.eventList.length && (
              <li className="text-[11px] text-muted-foreground">Sin eventos registrados.</li>
            )}
          </ul>
        </section>

        {/* Catálogo: qué puede estar detrás de esta categoría */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Causas raíz típicas de esta categoría
          </h3>
          <ul className="space-y-2">
            {catalogue.map((s) => {
              const hit = occurred.get(s.code);
              return (
                <li
                  key={s.code}
                  className={cn(
                    "rounded-lg border p-2.5",
                    hit ? "border-[var(--accent)]/50 bg-[var(--accent)]/5" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold">{s.label}</span>
                    {hit ? (
                      <span className="font-mono text-[11px] tabular-nums text-[var(--accent)]">
                        {fmt(hit.minutes)} min · {hit.pct}% de la columna
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">sin registros en la ventana</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.description}</p>
                  <p className="mt-1 text-[11px] leading-snug">
                    <span className="font-medium">Indicadores tempranos: </span>
                    <span className="text-muted-foreground">{s.earlyIndicators}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            Los modos de falla de proceso son doctrina estándar de desalación por ósmosis inversa. Los de
            mecánica, eléctrica, instrumentación y externas son plausibles para esta planta pero aún no están
            validados contra el historial real de Aguas del Valle.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function ParetoCard({ causes, windowDays }: { causes: ParetoCause[]; windowDays: number }) {
  const [metric, setMetric] = useState<Metric>("minutes");
  const [scope, setScope] = useState<Scope>("all");
  const [detail, setDetail] = useState<ParetoCause | null>(null);

  // Al cambiar métrica o alcance el Pareto se REORDENA y se recalcula el
  // acumulado: es exactamente lo que hace visible que "la mayor causa raíz"
  // es una conclusión relativa a cómo se mide, no un hecho absoluto.
  const rows = useMemo<Row[]>(() => {
    const valueOf = (c: ParetoCause) =>
      metric === "events"
        ? scope === "all" ? c.events : c.eventList.filter((e) => e.type === "no_planificada").length
        : scope === "all" ? c.minutes : c.unplannedMin;

    const base = causes
      .map((c) => ({ cause: c, label: c.label, value: valueOf(c) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = base.reduce((s, r) => s + r.value, 0);

    // Acumulado en un bucle explícito: el `.map` con un contador capturado en la
    // clausura viola la regla de inmutabilidad del compilador de React.
    const out: Row[] = [];
    let acumulado = 0;
    for (const r of base) {
      const pct = total ? (r.value / total) * 100 : 0;
      acumulado += pct;
      out.push({ ...r, pct: Math.round(pct), cumPct: Math.round(acumulado) });
    }
    return out;
  }, [causes, metric, scope]);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const unit = metric === "minutes" ? "min" : "eventos";
  // Las "pocas vitales": las primeras barras que juntas llegan al 80 %.
  const vitalCount = rows.findIndex((r) => r.cumPct >= 80) + 1;

  return (
    <TooltipProvider delay={120}>
      <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Pareto de paradas por causa raíz</span>
            <Tooltip>
              <TooltipTrigger
                type="button"
                className="text-muted-foreground transition-colors hover:text-[var(--accent)]"
                aria-label="Cómo se lee el Pareto de paradas"
              >
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex-col items-start gap-0 max-w-sm">
                <p className="text-xs font-semibold">Cómo se lee este gráfico</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Cada barra es una <strong>categoría</strong> de causa y mide el tiempo de parada que
                  acumuló en los últimos {windowDays} días. Las barras se ordenan de mayor a menor:{" "}
                  <strong>la mayor causa raíz es simplemente la que más tiempo se llevó</strong>, no la que
                  más veces ocurrió — por eso el conmutador de métrica cambia el orden.
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  La curva roja es el <strong>porcentaje acumulado</strong>. Donde cruza la línea del 80 %
                  quedan las <strong>&quot;pocas vitales&quot;</strong>: atacar esas primeras causas rinde la
                  mayor parte de la disponibilidad recuperable. Hoy son{" "}
                  <strong>{vitalCount > 0 ? vitalCount : rows.length}</strong> de {rows.length}.
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  Pasá el mouse por una barra para ver qué causas raíz concretas la componen, o hacé click
                  para el detalle con los eventos y sus indicadores tempranos.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented name="Métrica" value={metric} onChange={setMetric} options={["minutes", "events"]} labels={METRIC_LABEL} />
            <Segmented name="Alcance" value={scope} onChange={setScope} options={["all", "unplanned"]} labels={SCOPE_LABEL} />
          </div>
        </div>

        {rows.length ? (
          <>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART.axis }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={34} unit="%" />
                  {/* El corte del 80% es lo que hace de esto un Pareto y no un gráfico de barras. */}
                  <ReferenceLine
                    yAxisId="r"
                    y={80}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: "80%", position: "right", fontSize: 10, fill: "#dc2626" }}
                  />
                  {/* `RTooltip` es el de recharts; el Tooltip de @base-ui es el de la ayuda del encabezado. */}
                  <RTooltip
                    cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                    content={(props) => (
                      <ParetoTooltip
                        {...(props as unknown as { active?: boolean; payload?: readonly { payload: Row }[] })}
                        metric={metric}
                      />
                    )}
                  />
                  <Bar
                    yAxisId="l"
                    dataKey="value"
                    name={METRIC_LABEL[metric]}
                    radius={[4, 4, 0, 0]}
                    onClick={(d: unknown) => setDetail((d as Row)?.cause ?? null)}
                    className="cursor-pointer"
                  >
                    {rows.map((r, i) => (
                      // Las "pocas vitales" van en acento; el resto atenuado.
                      <Cell key={r.cause.cause} fill={ACCENT} fillOpacity={i < vitalCount ? 1 : 0.4} />
                    ))}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="cumPct" name="Acumulado %" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Ventana de {windowDays} días · {fmt(total)} {unit} en total ·{" "}
              {scope === "all"
                ? "incluye paradas planificadas (CIP e inspecciones), que no penalizan la disponibilidad"
                : "sólo paradas no planificadas — la base del pilar de Disponibilidad"}
              . Click en una barra para el detalle de causas raíz.
            </p>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin paradas registradas en la ventana.</p>
        )}

        <CauseDialog cause={detail} onClose={() => setDetail(null)} />
      </div>
    </TooltipProvider>
  );
}
