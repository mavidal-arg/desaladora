"use client";

import Link from "next/link";
import { Atom, ArrowUpRight } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as ChartTooltip, ResponsiveContainer, Legend } from "recharts";
import { StatCard, Section, Empty } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/ui/info-tip";
import { statusColor, CHART } from "@/lib/status-colors";
import { esTrend } from "@/lib/labels";
import { signalLabel, signalDesc } from "@/lib/signal-labels";
import type { PredictiveProfile } from "@/lib/adapters/types";

// Banda de salud → clave semántica (colores desde la fuente única).
const band = (h: number) => (h >= 85 ? "healthy" : h >= 70 ? "warning" : "critical");
const bandLabel: Record<string, string> = { healthy: "Saludable", warning: "Advertencia", critical: "Crítico" };
const bandHex = (key: string) => statusColor(key).hex;

// ── B4: tipo de mantenimiento por dominio ────────────────────────────────────
// CIP aplica SÓLO a trenes de ósmosis inversa (RO). UF se limpia con CEB/retrolavado.
const isRO = (p: PredictiveProfile) => p.areaCode === "RO" || /^A25/i.test(p.assetCode);
const isUF = (p: PredictiveProfile) => p.areaCode === "UF" || /^A12/i.test(p.assetCode);
function maintKind(p: PredictiveProfile): string {
  if (isRO(p)) return "CIP / reemplazo membranas";
  if (isUF(p)) return "CEB / retrolavado";
  return "acción predictiva por condición";
}


// B1: conteo de parámetros en anomalía como badge (0 gris · 1 ámbar · ≥2 rojo).
function CountBadge({ n }: { n: number }) {
  const key = n === 0 ? "idle" : n >= 2 ? "critical" : "warning";
  const c = statusColor(key);
  return (
    <span className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {n}
    </span>
  );
}

function LegendDot({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
      {label}
    </span>
  );
}

export function PredictiveClient({ predictive }: { predictive: PredictiveProfile[] }) {
  const configured = predictive.filter((p) => p.configured);
  const avg = configured.length ? Math.round(configured.reduce((s, p) => s + p.healthScore, 0) / configured.length) : 0;
  const healthy = configured.filter((p) => band(p.healthScore) === "healthy").length;
  const warning = configured.filter((p) => band(p.healthScore) === "warning").length;
  const critical = configured.filter((p) => band(p.healthScore) === "critical").length;
  const dist = [
    { name: "Saludable", key: "healthy", value: healthy }, { name: "Advertencia", key: "warning", value: warning }, { name: "Crítico", key: "critical", value: critical },
  ].filter((d) => d.value > 0);
  const lowest = [...configured].sort((a, b) => a.healthScore - b.healthScore).slice(0, 5);
  const predicted = configured.filter((p) => p.predFailureDays != null);
  const anomalies = configured.flatMap((p) => p.anomalies.map((a) => ({ ...a, code: p.assetCode, name: p.assetName })));

  return (
    <TooltipProvider delay={120}>
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Salud promedio" value={`${avg}%`} accent />
        <StatCard label="Configurados" value={configured.length} />
        <StatCard label="Saludables" value={healthy} />
        <StatCard label="Advertencia" value={warning} />
        <StatCard label="Críticos" value={critical} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Section title="Distribución de salud">
          <div className="h-[180px] w-full sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dist} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {dist.map((d, i) => <Cell key={i} fill={bandHex(d.key)} />)}
                </Pie>
                <ChartTooltip contentStyle={{ fontSize: 11, background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section
          title="Equipos con menor salud"
          right={
            <InfoTip srLabel="Qué es el índice de salud" contentClassName="normal-case">
              Condición del equipo (0-100) derivada de sus señales. Para racks RO se calcula del ensuciamiento (Rf normalizado), rechazo de sales y ΔP transmembrana. Bandas: ≥85 saludable · 70-84 advertencia · &lt;70 crítico.
            </InfoTip>
          }
        >
          <ol className="space-y-2">
            {lowest.map((p, i) => (
              <li key={p.assetId} className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--foreground)]">{p.assetCode}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">{p.assetName}</p>
                </div>
                <span className="text-sm font-semibold" style={{ color: bandHex(band(p.healthScore)) }}>{p.healthScore}%</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Mantenimiento previsto">
          {predicted.length === 0 ? <Empty text="Sin predicciones activas." /> : (
            <ul className="space-y-2">
              {predicted.map((p) => (
                <li key={p.assetId} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--foreground)]">{p.assetCode}</p>
                    <p className="truncate text-[10px] text-[var(--muted-foreground)]">{p.assetName}</p>
                    {/* B4: tipo de mantenimiento real por equipo (RO=CIP, UF=CEB, otros=condición). */}
                    <p className="mt-0.5 text-[10px] font-medium text-[var(--accent)]">{maintKind(p)}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold text-amber-400">{p.predFailureDays} días</p><p className="text-[10px] text-[var(--muted-foreground)]">{esTrend(p.trend)}</p></div>
                </li>
              ))}
            </ul>
          )}
          {/* B4: callout de CIP explícitamente scopeado a trenes RO. */}
          <Link
            href="/twin"
            className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 transition-colors hover:border-[var(--accent)]/40"
          >
            <span className="flex items-center gap-2">
              <Atom className="h-4 w-4 text-[var(--accent)]" />
              <span className="text-[11px] leading-tight text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">Predicción de CIP — solo trenes de ósmosis inversa (RO)</span><br />
                Días hasta limpieza de membranas por modelo físico (Rf / SEC). La UF se limpia con CEB / retrolavado, no CIP.
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          </Link>
        </Section>
      </div>

      <Section title="Anomalías de parámetros">
        <SortableTable
          rows={anomalies}
          getRowKey={(a, i) => `${a.code}-${a.param}-${i}`}
          emptyText="Sin anomalías de parámetros."
          columns={[
            { key: "code", header: "Código", sortAccessor: (a) => a.code, render: (a) => a.code },
            { key: "name", header: "Equipo", sortAccessor: (a) => a.name, render: (a) => a.name },
            { key: "param", header: <InfoTip label="Parámetro" contentClassName="normal-case">Parámetro (señal) del equipo cuyo valor se encuentra fuera de rango.</InfoTip>, sortAccessor: (a) => signalLabel(a.param), render: (a) => {
              const desc = signalDesc(a.param);
              return desc ? (
                <Tooltip>
                  <TooltipTrigger type="button" className="cursor-help text-left underline decoration-dotted decoration-[var(--muted-foreground)] underline-offset-2">{signalLabel(a.param)}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs normal-case">{desc}</TooltipContent>
                </Tooltip>
              ) : signalLabel(a.param);
            } },
            { key: "value", header: "Valor", align: "right", sortAccessor: (a) => a.value, render: (a) => a.value },
            { key: "delta", header: "Δ", align: "right", sortAccessor: (a) => a.delta, render: (a) => <span className="text-red-400">↗ +{a.delta}</span> },
          ]}
        />
      </Section>

      <Section title="Salud de equipos">
        <SortableTable
          rows={configured}
          getRowKey={(p) => p.assetId}
          initialSort={{ key: "health", dir: "asc" }}
          columns={[
            { key: "code", header: "Código", sortAccessor: (p) => p.assetCode, render: (p) => p.assetCode },
            { key: "name", header: "Nombre", sortAccessor: (p) => p.assetName, render: (p) => p.assetName },
            { key: "health", header: <InfoTip label="Índice de salud" contentClassName="normal-case">Condición del equipo (0-100) derivada de sus señales. Para racks RO se calcula del ensuciamiento (Rf normalizado), rechazo de sales y ΔP transmembrana. Bandas: ≥85 saludable · 70-84 advertencia · &lt;70 crítico.</InfoTip>, align: "right", sortAccessor: (p) => p.healthScore, render: (p) => <span style={{ color: bandHex(band(p.healthScore)) }}>{p.healthScore}%</span> },
            { key: "trend", header: "Tendencia", sortAccessor: (p) => esTrend(p.trend), render: (p) => esTrend(p.trend) },
            { key: "fail", header: "Falla prevista", align: "right", sortAccessor: (p) => p.predFailureDays ?? null, render: (p) => p.predFailureDays ? `${p.predFailureDays} días` : "—" },
            { key: "anom", header: <InfoTip label="Parámetros en anomalía" contentClassName="normal-case">Cantidad de parámetros del equipo fuera de rango.</InfoTip>, align: "right", sortAccessor: (p) => p.anomalies.length, render: (p) => <CountBadge n={p.anomalies.length} /> },
          ]}
        />
        {/* B3: leyenda de bandas de salud (consistente con el donut de distribución). */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--muted-foreground)]">
          <span>Índice de salud = condición derivada de las señales del equipo (racks RO: ensuciamiento Rf normalizado).</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LegendDot hex={bandHex("healthy")} label={`${bandLabel.healthy} (≥85)`} />
            <LegendDot hex={bandHex("warning")} label={`${bandLabel.warning} (70-84)`} />
            <LegendDot hex={bandHex("critical")} label={`${bandLabel.critical} (<70)`} />
          </span>
        </div>
      </Section>
    </div>
    </TooltipProvider>
  );
}
