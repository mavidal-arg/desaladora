"use client";

import Link from "next/link";
import { Atom, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { StateBadge } from "@/components/mes";
import { SortableTable } from "@/components/SortableTable";
import { statusColor, CHART } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import type { DesalSummary } from "@/lib/desal";
import type { MembraneRow } from "@/lib/asset-health";

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

export function ProduccionClient({ summary, membranes }: { summary: DesalSummary; membranes: MembraneRow[] }) {
  const k = summary.kpis;
  const ACCENT = "var(--accent)";
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Producción" value={k.productionM3d.toLocaleString("es-CL")} unit="m³/d" hint={`${k.productionLs} l/s`} accent />
        <Kpi label="Recovery" value={k.recoveryPct} unit="%" />
        <Kpi label="Energía específica" value={k.energyKwhM3} unit="kWh/m³" hint="con ERI" />
        <Kpi label="Rechazo de sales" value={k.saltRejection} unit="%" />
        <Kpi label="SDT producto" value={k.productTds} unit="mg/l" />
        <Kpi label="Disponibilidad" value={k.availability} unit="%" />
        <Kpi label="Fase" value={summary.phase} hint="operación" />
      </div>

      {/* Tendencias */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-1 text-sm font-semibold">Producción de agua (m³/día) — 14 días</div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={54} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="produccion" name="Producción" stroke={ACCENT} strokeWidth={2} fill="url(#gProd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-1 text-sm font-semibold">Consumo específico (kWh/m³) — 14 días</div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
                <YAxis domain={[2.5, 4]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={36} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="energia" name="kWh/m³" stroke={ACCENT} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Salud de membranas (UF / RO) */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Salud de membranas (UF / Ósmosis Inversa)</span>
          <Link href="/twin" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]">
            <Atom className="h-3.5 w-3.5 text-[var(--accent)]" /> Gemelo Digital <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <SortableTable
          rows={membranes}
          getRowKey={(m) => m.code}
          minWidth={560}
          initialSort={{ key: "health", dir: "asc" }}
          columns={[
            { key: "code", header: "Código", sortAccessor: (m) => m.code, render: (m) => <span className="font-mono font-semibold">{m.code}</span> },
            { key: "name", header: "Tren", sortAccessor: (m) => m.name, render: (m) => m.name },
            { key: "kind", header: "Tipo", sortAccessor: (m) => m.kind, render: (m) => <span className="text-muted-foreground">{m.kind}</span> },
            { key: "health", header: "Salud", sortAccessor: (m) => m.health, render: (m) => {
              const c = m.health >= 85 ? statusColor("en_rango") : m.health >= 72 ? statusColor("fuera_rango") : statusColor("falla");
              return (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", c.dot)} style={{ width: `${m.health}%` }} />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.health}%</span>
                </div>
              );
            } },
            { key: "status", header: "Estado", sortAccessor: (m) => m.status, render: (m) => <StateBadge state={m.status} /> },
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">La salud combina ensuciamiento (ΔP transmembrana), caída de rechazo y horas de operación; el <Link href="/twin" className="text-[var(--accent)] hover:underline">Gemelo Digital</Link> la calcula con el modelo físico (Rf normalizado, SEC, β) y proyecta los días hasta el próximo CIP.</p>
      </div>
    </div>
  );
}
