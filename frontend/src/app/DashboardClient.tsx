"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useRouter } from "next/navigation";
import { Boxes, Activity, ClipboardList, HeartPulse, Package } from "lucide-react";
import { StatCard, AlertCard, Section } from "@/components/uikit";
import { esEquipStatus, esWoStatus, esEquipCategory, esPartCategory } from "@/lib/labels";
import type { DashboardModel } from "@/lib/metrics";

const PALETTE = ["#4CAF50", "#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185", "#94a3b8", "#22d3ee"];

function Donut({ data, onSliceClick }: { data: { name: string; value: number }[]; onSliceClick?: (name: string) => void }) {
  // Custom legend rendered *below* the chart (flow layout, wraps freely) instead of
  // recharts' built-in <Legend>, which overlapped the pie when a series had many
  // categories (e.g. Equipment Types) inside the fixed-height container.
  return (
    <div>
      <div className="h-[160px] w-full sm:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}
              onClick={onSliceClick ? (d: { name?: string }) => d?.name && onSliceClick(d.name) : undefined}
              style={onSliceClick ? { cursor: "pointer" } : undefined}
            >
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, background: "#111", border: "1px solid #333", borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardClient({ model }: { model: DashboardModel }) {
  const k = model.kpis;
  const a = model.alerts;
  const router = useRouter();

  // Los donuts muestran el estado traducido pero navegan con el valor crudo:
  // el filtro del módulo destino espera `in_progress`, no "En ejecución".
  const traducir = (
    rows: { name: string; value: number }[], es: (v: string) => string,
  ) => rows.map((d) => ({ name: es(d.name), value: d.value, raw: d.name }));
  const woRows = traducir(model.woStatusDist, esWoStatus);
  const eqRows = traducir(model.statusDist, esEquipStatus);
  const partsRows = traducir(model.partsConsumption, esPartCategory);
  const typeRows = traducir(model.equipmentTypes, esEquipCategory);
  const crudoDe = (rows: { name: string; raw: string }[], label: string) =>
    rows.find((r) => r.name === label)?.raw ?? label;
  const woTotal = model.woStatusDist.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      {/* KPI cards */}
      <div className="eam-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Equipos totales" value={k.totalEquipment} icon={Boxes} href="/equipment" />
        <StatCard label="En marcha" value={k.running} accent icon={Activity} href="/equipment?status=running" />
        {/* "Abiertas", no "pendientes": cuenta todo lo no completado, y abajo el
            donut muestra `Pendiente` por separado. Decían cosas distintas con el
            mismo nombre. El enlace tampoco puede filtrar por `pending`: anunciaba
            19 y llevaba a una lista de 3. */}
        <StatCard label="Órdenes abiertas" value={k.openOrders} icon={ClipboardList} href="/maintenance" />
        <StatCard label="Índice de salud planta" value={`${k.healthScore}%`} icon={HeartPulse} href="/predictive" />
        <StatCard label="Spare Parts" value={k.sparePartsQty} icon={Package} href="/spare-parts" />
      </div>

      {/* Alert cards */}
      <div className="eam-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AlertCard count={a.emergency} title="Emergencia" subtitle="Crítico" tone="red" href="/maintenance?type=emergency" />
        <AlertCard count={a.lowStock} title="Stock bajo" subtitle="Inventario" tone="amber" href="/spare-parts?filter=low" />
        <AlertCard count={a.calibrationDue} title="Calibración vencida" subtitle="Instrumentos" tone="blue" href="/inspection" />
        <AlertCard count={a.corrosion} title="Corrosión" subtitle="Gestión de corrosión" tone="amber" href="/operations?tab=corrosion" />
        <AlertCard count={a.sealIssues} title="Problemas de sello" subtitle="Gestión de sellado" tone="purple" href="/operations?tab=sealing" />
      </div>

      {/* Distribution donuts — click a slice to drill into the filtered module */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Section title="Estado de los equipos">
          <Donut data={eqRows} onSliceClick={(n) => router.push(`/equipment?status=${encodeURIComponent(crudoDe(eqRows, n))}`)} />
        </Section>
        <Section title={`Estado de órdenes (${woTotal})`}>
          <Donut data={woRows} onSliceClick={(n) => router.push(`/maintenance?status=${encodeURIComponent(crudoDe(woRows, n))}`)} />
        </Section>
        <Section title="Consumo de repuestos">
          <Donut data={partsRows} onSliceClick={() => router.push("/spare-parts")} />
        </Section>
        <Section title="Tipos de equipo">
          <Donut data={typeRows} onSliceClick={(n) => router.push(`/equipment?category=${encodeURIComponent(crudoDe(typeRows, n))}`)} />
        </Section>
      </div>
    </div>
  );
}
