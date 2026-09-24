"use client";

import Link from "next/link";
import {
  BarChart, Bar, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell,
} from "recharts";
import { OEEGauge, StateBadge } from "@/components/mes";
import { InfoTip } from "@/components/ui/info-tip";
import { CHART } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { oeeBand, type OeeSummary } from "@/lib/oee-types";
import { ParetoCard } from "@/components/oee/ParetoCard";

const ACCENT = "var(--accent)";
const BAND_HEX = { ok: "#16a34a", warn: "#d97706", crit: "#dc2626" } as const;
const fmt = (n: number) => n.toLocaleString("es-CL");

export type ProductionTrendPoint = { day: string; produccion: number; energia: number };

function Kpi({ label, value, unit, hint, accent }: { label: string; value: string | number; unit?: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", accent && "text-[var(--accent)]")}>
        {value}{unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Bar3({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-[10px] text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="w-9 text-right font-mono text-[11px] tabular-nums">{value}%</span>
    </div>
  );
}

/**
 * OeeDashboard — dashboard de eficiencia de planta reutilizable (OEE global,
 * trenes online, producción, downtime, OEE por tren, tendencia de producción,
 * estado de trenes RO y alertas). Se usa en la Vista de Planta (/overview) y en
 * la pestaña Dashboard de /oee. Las tarjetas por tren enlazan a su detalle.
 */
export function OeeDashboard({ summary, productionTrend }: { summary: OeeSummary; productionTrend?: ProductionTrendPoint[] }) {
  const p = summary.plant;
  const th = summary.thresholds;
  const trainBars = summary.trains.map((t) => ({ code: t.code, oee: t.oee, band: oeeBand(t.oee, th) }));
  const loss = [
    { label: "Disponibilidad", value: summary.pillarLoss.availability },
    { label: "Rendimiento", value: summary.pillarLoss.performance },
    { label: "Calidad", value: summary.pillarLoss.quality },
  ];
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="OEE Planta · 14 días" value={p.oee} unit="%" accent hint={`meta ${th.target}%`} />
        <Kpi label="Disponibilidad" value={p.availability} unit="%" />
        <Kpi label="Rendimiento" value={p.performance} unit="%" />
        <Kpi label="Calidad" value={p.quality} unit="%" />
        <Kpi label="Trenes en línea" value={`${p.trainsOnline}/${p.trainsTotal}`} />
        <Kpi label="Producción" value={fmt(p.totalProductionM3d)} unit="m³/d" />
        <Kpi label="Downtime 14d" value={fmt(p.totalDowntimeMin)} unit="min" />
        <Kpi label="Alertas activas" value={summary.activeAlerts} hint="ver pestaña Alertas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gauge planta */}
        <div className="rounded-xl border border-border bg-card p-4">
          <InfoTip label="OEE de planta" className="mb-2 text-sm font-semibold" srLabel="Cómo se calcula el OEE de planta">
            OEE = Disponibilidad × Rendimiento × Calidad, agregado de los {p.trainsTotal} trenes sobre la ventana móvil de {summary.window.days} días.
          </InfoTip>
          <OEEGauge availability={p.availability} performance={p.performance} quality={p.quality} oee={p.oee} size={190} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Ventana móvil {summary.window.days} días · D × R × C</p>
        </div>

        {/* OEE por tren */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-2 text-sm font-semibold">OEE por tren RO</div>
          <div className="h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trainBars} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={34} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="oee" name="OEE %" radius={[4, 4, 0, 0]}>
                  {trainBars.map((b, i) => <Cell key={i} fill={BAND_HEX[b.band]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex justify-end gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX.ok }} />≥{th.target}%</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX.warn }} />≥{th.critical}%</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX.crit }} />&lt;{th.critical}%</span>
          </div>
        </div>
      </div>

      {/* Tendencia de producción */}
      {productionTrend && productionTrend.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold">Tendencia de producción (m³/día) y consumo energético</div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={productionTrend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={52} />
                <YAxis yAxisId="r" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={40} unit=" kWh" />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Area yAxisId="l" type="monotone" dataKey="produccion" name="Producción (m³/d)" stroke={ACCENT} strokeWidth={2} fill="url(#gProd)" />
                <Line yAxisId="r" type="monotone" dataKey="energia" name="SEC (kWh/m³)" stroke="#71717a" strokeWidth={1.75} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detalle por tren (tarjetas enlazadas al detalle) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">Estado de trenes RO</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.trains.map((t) => (
            <Link
              key={t.code}
              href={`/oee/tren/${t.code}`}
              className="rounded-lg border border-border p-3 transition-colors hover:border-[var(--accent)] hover:bg-muted/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{t.code}</span>
                <StateBadge state={t.status} size="sm" />
              </div>
              <div className="my-2 flex items-baseline gap-1">
                <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: BAND_HEX[oeeBand(t.oee, th)] }}>{t.oee}</span>
                <span className="text-xs text-muted-foreground">% OEE</span>
              </div>
              <div className="space-y-1">
                <Bar3 label="D" value={t.availability} color={ACCENT} />
                <Bar3 label="R" value={t.performance} color="#71717a" />
                <Bar3 label="C" value={t.quality} color="#27272a" />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>{t.actualM3h}/{t.nominalM3h} m³/h</span>
                <span>{t.qualityConforme}/{t.qualityTotal} conf.</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Pareto + pérdidas por pilar */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ParetoCard causes={summary.paretoCauses} windowDays={summary.window.days} />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">Pérdida de OEE por pilar</div>
          <div className="space-y-3">
            {loss.map((l) => (
              <div key={l.label}>
                <div className="mb-1 flex justify-between text-xs"><span>{l.label}</span><span className="font-mono">-{l.value} pts</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-red-500/70" style={{ width: `${Math.min(l.value * 2, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Puntos de OEE perdidos frente al ideal (100%) en cada pilar. El pilar con mayor pérdida marca dónde atacar primero.</p>
        </div>
      </div>
    </div>
  );
}
