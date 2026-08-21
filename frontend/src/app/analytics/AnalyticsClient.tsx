"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard, Section } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { TabBar } from "@/components/TabBar";

// Acá VIVÍA una pestaña "Análisis OEE" que publicaba el OEE sintético de
// `oeeBreakdown` (disponibilidad de equipos × salud media × constante por NCs) y
// su tendencia dibujada con un seno. Era el TERCER lugar donde aparecía un
// número llamado OEE, y ninguno de los tres coincidía. El OEE se publica en el
// Panel principal y sale del motor de trenes RO; acá queda el enlace.
const TABS = ["Reportes", "Panel"];
const RANGES = ["Esta semana", "Este mes", "Este trimestre", "Este año"];

interface Props {
  reports: { maintenanceOrders: number; sparePartsValue: number; runtimeTotal: number; inspections: number; openNc: number };
}

export function AnalyticsClient({ reports }: Props) {
  const [tab, setTab] = useState(TABS[0]);
  const [range, setRange] = useState(RANGES[1]);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              range === r ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Reportes" && (
        <Section title={`Reportes — ${range}`}>
          <SortableTable
            rows={[
              { report: "Reporte de mantenimiento", source: "SAP PM", value: `${reports.maintenanceOrders} órdenes` },
              { report: "Reporte de repuestos", source: "SAP MM", value: `USD ${reports.sparePartsValue.toLocaleString("es-AR")}` },
              { report: "Reporte de horas", source: "PI System", value: `${reports.runtimeTotal.toLocaleString("es-AR")} h` },
              { report: "Reporte de inspección", source: "SE Suite", value: `${reports.inspections} rondas` },
              { report: "Reporte de cumplimiento", source: "SE Suite", value: `${reports.openNc} no-conformidades abiertas` },
            ]}
            getRowKey={(r) => r.report}
            columns={[
              { key: "report", header: "Reporte", sortAccessor: (r) => r.report, render: (r) => r.report },
              { key: "source", header: "Fuente", sortAccessor: (r) => r.source, render: (r) => r.source },
              { key: "value", header: "Valor", sortAccessor: (r) => r.value, render: (r) => r.value },
            ]}
          />
        </Section>
      )}

      {tab === "Panel" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Órdenes de mantención" value={reports.maintenanceOrders} />
            <StatCard label="Horas totales" value={`${reports.runtimeTotal.toLocaleString("es-AR")} h`} />
            <StatCard label="No-conformidades abiertas" value={reports.openNc} />
            <StatCard label="Rondas de inspección" value={reports.inspections} />
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            El OEE de planta se publica en{" "}
            <Link href="/overview" className="text-[var(--accent)] underline">Panel principal</Link>,
            calculado por tren RO sobre paradas, señales de proceso y calidad de permeado.
          </p>
        </div>
      )}
    </div>
  );
}
