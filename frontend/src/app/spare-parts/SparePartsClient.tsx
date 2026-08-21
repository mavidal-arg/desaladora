"use client";

import { useState } from "react";
import { StatCard, Section, FilterChip } from "@/components/uikit";
import { SortableTable } from "@/components/SortableTable";
import { StateBadge } from "@/components/mes";
import { TabBar } from "@/components/TabBar";
import type { SparePart, Tool } from "@/lib/adapters/types";
import { esPartCategory } from "@/lib/labels";

const TABS = ["Inventario", "Herramientas", "Más reemplazados"];

export function SparePartsClient({ parts, tools, initialFilter }: { parts: SparePart[]; tools: Tool[]; initialFilter?: string }) {
  const [tab, setTab] = useState(TABS[0]);
  const [lowOnly, setLowOnly] = useState(initialFilter === "low");
  const totalValue = parts.reduce((s, p) => s + p.quantity * p.unitCost, 0);
  const lowStock = parts.filter((p) => p.quantity <= p.safetyStock).length;
  const inventory = lowOnly ? parts.filter((p) => p.quantity <= p.safetyStock) : parts;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Repuestos totales" value={parts.length} />
        <StatCard label="Stock bajo" value={lowStock} accent={lowStock > 0} />
        <StatCard label="Valor de inventario (USD)" value={totalValue.toLocaleString("es-AR")} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Inventario" && (
        <>
          {lowOnly && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <FilterChip label="bajo stock" onClear={() => setLowOnly(false)} />
              <span className="text-xs text-[var(--muted-foreground)]">{inventory.length} items</span>
            </div>
          )}
          <SortableTable
            rows={inventory}
            getRowKey={(p) => p.id}
            emptyText="Sin repuestos."
            columns={[
              { key: "code", header: "Código", sortAccessor: (p) => p.code, render: (p) => p.code },
              { key: "name", header: "Nombre", sortAccessor: (p) => p.name, render: (p) => p.name },
              { key: "spec", header: "Especificación", sortAccessor: (p) => p.specification, render: (p) => p.specification },
              { key: "cat", header: "Categoría", sortAccessor: (p) => esPartCategory(p.category), render: (p) => esPartCategory(p.category) },
              { key: "qty", header: "Cantidad", align: "right", sortAccessor: (p) => p.quantity, render: (p) => p.quantity <= p.safetyStock ? <StateBadge state="stopped" label={`${p.quantity} ${p.unit}`} size="sm" /> : `${p.quantity} ${p.unit}` },
              { key: "safety", header: "Stock de seguridad", align: "right", sortAccessor: (p) => p.safetyStock, render: (p) => p.safetyStock },
            ]}
          />
        </>
      )}

      {tab === "Herramientas" && (
        <SortableTable
          rows={tools}
          getRowKey={(t) => t.id}
          emptyText="Sin herramientas."
          columns={[
            { key: "code", header: "Código", sortAccessor: (t) => t.code, render: (t) => t.code },
            { key: "name", header: "Nombre", sortAccessor: (t) => t.name, render: (t) => t.name },
            { key: "room", header: "Pañol", sortAccessor: (t) => t.toolRoom, render: (t) => t.toolRoom },
            { key: "loc", header: "Ubicación", sortAccessor: (t) => t.storageLocation, render: (t) => t.storageLocation },
            { key: "avail", header: "Estado", sortAccessor: (t) => (t.available ? 0 : 1), render: (t) => <StateBadge state={t.available ? "running" : "maintenance"} label={t.available ? "Disponible" : "En uso"} size="sm" /> },
          ]}
        />
      )}

      {tab === "Más reemplazados" && (
        <Section title="Partes más reemplazadas">
          <SortableTable
            rows={parts}
            getRowKey={(p) => p.id}
            initialSort={{ key: "replaced", dir: "desc" }}
            columns={[
              { key: "code", header: "Código", sortAccessor: (p) => p.code, render: (p) => p.code },
              { key: "name", header: "Nombre", sortAccessor: (p) => p.name, render: (p) => p.name },
              { key: "asset", header: "Equipo", sortAccessor: (p) => p.assetName ?? "", render: (p) => p.assetName ? `${p.assetName}${p.assetCode ? ` (${p.assetCode})` : ""}` : "—" },
              { key: "cat", header: "Categoría", sortAccessor: (p) => esPartCategory(p.category), render: (p) => esPartCategory(p.category) },
              { key: "replaced", header: "Reemplazos", align: "right", sortAccessor: (p) => p.replacedCount, render: (p) => <span className="font-semibold">{p.replacedCount}</span> },
              { key: "consumed", header: "Consumo (30d)", align: "right", sortAccessor: (p) => p.consumedLast30d, render: (p) => p.consumedLast30d },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
