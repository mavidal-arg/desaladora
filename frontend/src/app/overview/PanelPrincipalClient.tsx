"use client";

import Link from "next/link";
import { Atom, ArrowUpRight } from "lucide-react";
import { StateBadge } from "@/components/mes";
import { SortableTable } from "@/components/SortableTable";
import { InfoTip } from "@/components/ui/info-tip";
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

/**
 * Tabla de salud de un grupo de membranas, con su régimen de regeneración.
 *
 * `saludInfo` va SOLO en el tooltip del header de la columna "Salud" — antes
 * era un footnote de texto permanente debajo de la tabla, fácil de no ver.
 * Va sin el link a Gemelo Digital que traía ese texto (la tarjeta ya tiene su
 * propio botón arriba): ningún otro tooltip del repo mete contenido
 * interactivo/enfocable dentro de un popover que se cierra al mover el mouse.
 */
function MembraneCard({ title, rows, saludInfo }: { title: string; rows: MembraneRow[]; saludInfo: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Link href="/twin" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]">
          <Atom className="h-3.5 w-3.5 text-[var(--accent)]" /> Gemelo Digital <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <SortableTable
        rows={rows}
        getRowKey={(m) => m.code}
        minWidth={420}
        initialSort={{ key: "health", dir: "asc" }}
        emptyText="Sin equipos en este régimen."
        columns={[
          { key: "code", header: "Código", sortAccessor: (m) => m.code, render: (m) => <span className="font-mono font-semibold">{m.code}</span> },
          { key: "name", header: "Equipo", sortAccessor: (m) => m.name, render: (m) => m.name },
          { key: "regime", header: "Régimen", sortAccessor: (m) => m.regime, render: (m) => (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{m.regime}</span>
          ) },
          { key: "health", header: <InfoTip label="Salud" srLabel="Cómo se calcula la salud">{saludInfo}</InfoTip>, sortAccessor: (m) => m.health, render: (m) => {
            const c = m.health >= 85 ? statusColor("en_rango") : m.health >= 72 ? statusColor("fuera_rango") : statusColor("falla");
            return (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", c.dot)} style={{ width: `${m.health}%` }} />
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.health}%</span>
              </div>
            );
          } },
          { key: "status", header: "Estado", sortAccessor: (m) => m.status, render: (m) => <StateBadge state={m.status} /> },
        ]}
      />
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

      {/* Salud de membranas — partida por RÉGIMEN de regeneración.
          Antes era una sola tabla "UF / Ósmosis Inversa" con una nota al pie que
          le prometía a TODAS las filas una proyección de "días hasta el próximo
          CIP". Los skids de ultrafiltración no van a CIP: van a CEB. Mezclarlos
          bajo la misma promesa no era un problema de redacción, era atribuirle a
          un equipo un proceso que no corre. */}
      <div className="grid gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-2">
        <MembraneCard
          title="Ósmosis Inversa — régimen CIP"
          rows={membranes.filter((m) => m.regime === "CIP")}
          saludInfo={<>La salud combina ensuciamiento (ΔP transmembrana), caída de rechazo y horas de operación; el Gemelo Digital la calcula con el modelo físico (Rf normalizado, SEC, β) y proyecta los <strong>días hasta el próximo CIP</strong> — limpieza química recirculada desde el estanque A28.</>}
        />
        <MembraneCard
          title="Ultrafiltración — régimen CEB"
          rows={membranes.filter((m) => m.regime === "CEB")}
          saludInfo={<>La UF no se regenera con CIP sino con <strong>CEB</strong> (retrolavado con reactivo inyectado en línea a cada skid, bomba A19 + estanque BW/CEB de 283 m³). Su indicador de ciclo es la permeabilidad (flux / TMP), y el Gemelo Digital proyecta las <strong>horas hasta el próximo CEB</strong> — un ciclo de horas, no de semanas.</>}
        />
      </div>
    </div>
  );
}
