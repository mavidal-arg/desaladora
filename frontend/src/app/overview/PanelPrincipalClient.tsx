"use client";

import Link from "next/link";
import { Atom, ArrowUpRight } from "lucide-react";
import { StateBadge } from "@/components/mes";
import { SortableTable } from "@/components/SortableTable";
import { OeeClient } from "@/app/oee/OeeClient";
import { statusColor } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import type { DesalSummary } from "@/lib/desal";
import type { MembraneRow } from "@/lib/asset-health";
import type { OeeSummary } from "@/lib/oee-types";
import type { DowntimeRow, QualityRow, ShiftRow, AlertRow, AlertRuleRow } from "@/lib/oee";
import type { ProductionTrendPoint } from "@/components/oee/OeeDashboard";

// Burbuja de proceso — mismo patrón que la pantalla Producción de Agua (reubicada aquí).
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

export function PanelPrincipalClient({
  role, oee, downtime, quality, shifts, alerts, rules, productionTrend, desal, membranes,
}: {
  role: string;
  oee: OeeSummary;
  downtime: DowntimeRow[];
  quality: QualityRow[];
  shifts: ShiftRow[];
  alerts: AlertRow[];
  rules: AlertRuleRow[];
  productionTrend?: ProductionTrendPoint[];
  desal: DesalSummary;
  membranes: MembraneRow[];
}) {
  const k = desal.kpis;
  return (
    <div>
      {/* Burbujas de proceso (reubicadas desde Producción de Agua) */}
      <div className="px-4 pt-4 sm:px-6">
        {/* Burbujas específicas de proceso (Producción y Disponibilidad ya están en el OEE de abajo). */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Recovery" value={k.recoveryPct} unit="%" hint="conversión" accent />
          <Kpi label="Energía específica" value={k.energyKwhM3} unit="kWh/m³" hint="con ERI" />
          <Kpi label="Rechazo de sales" value={k.saltRejection} unit="%" />
          <Kpi label="SDT producto" value={k.productTds} unit="mg/l" />
          <Kpi label="Fase" value={desal.phase} hint="operación" />
        </div>
      </div>

      {/* OEE completo (dashboard + Paradas / Calidad / Turnos y Metas / Alertas) */}
      <OeeClient
        role={role}
        summary={oee}
        downtime={downtime}
        quality={quality}
        shifts={shifts}
        alerts={alerts}
        rules={rules}
        productionTrend={productionTrend}
      />

      {/* Salud de membranas (UF / RO) — tabla reubicada al pie desde Producción de Agua */}
      <div className="px-4 pb-6 sm:px-6">
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
    </div>
  );
}
