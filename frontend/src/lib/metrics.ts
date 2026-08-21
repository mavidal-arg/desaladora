// Agregaciones puras — KPIs de mantención desde los adapters. Determinístico
// (sembrado) para que el panel sea reproducible.
//
// Acá VIVÍA un segundo motor de OEE (`oeeBreakdown` + `oeeTrend`) que no medía
// OEE: multiplicaba disponibilidad de equipos × salud media de la flota × una
// constante que bajaba con las no-conformidades, y la tendencia de 14 días se
// dibujaba con un `Math.sin()` alrededor del resultado. Producía 71,8 % contra
// el 79 % del OEE real de trenes RO (`lib/oee.ts`) y ambos se mostraban como
// "OEE" en pantallas distintas. Se borró entero: el OEE se publica en un solo
// lugar, el Panel principal, calculado de paradas, señales y calidad.
import type { Equipment, WorkOrder, SparePart, PredictiveProfile, InspectionRoute, NonConformity } from "./adapters/types";

const round = (n: number) => Math.round(n * 10) / 10;

export interface DashboardModel {
  // `openOrders` = órdenes no completadas. Se llamaba `pendingOrders` y la
  // tarjeta decía "Órdenes pendientes 19", mientras el bloque de abajo mostraba
  // `pending = 3`: los dos números eran correctos y se contradecían en pantalla.
  kpis: { totalEquipment: number; running: number; openOrders: number; healthScore: number; sparePartsQty: number };
  alerts: { emergency: number; lowStock: number; calibrationDue: number; corrosion: number; sealIssues: number };
  statusDist: { name: string; value: number }[];
  woStatusDist: { name: string; value: number }[];
  partsConsumption: { name: string; value: number }[];
  equipmentTypes: { name: string; value: number }[];
}

export function computeDashboard(d: {
  equipment: Equipment[]; workOrders: WorkOrder[]; parts: SparePart[];
  predictive: PredictiveProfile[]; routes: InspectionRoute[]; ncs: NonConformity[];
}): DashboardModel {
  const { equipment, workOrders, parts, predictive, routes, ncs } = d;
  // `predictive.healthScore` ya viene resuelto por la fuente única
  // (`lib/asset-health.ts`), así que este promedio es el mismo número que se ve
  // activo por activo en Predictivo.
  const healthScore = predictive.length ? round(predictive.reduce((s, p) => s + p.healthScore, 0) / predictive.length) : 0;

  const byKey = (items: string[]) => {
    const m = new Map<string, number>();
    for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  };
  const now = Date.now();

  return {
    kpis: {
      totalEquipment: equipment.length,
      running: equipment.filter((e) => e.status === "running").length,
      openOrders: workOrders.filter((w) => w.status !== "completed").length,
      healthScore,
      sparePartsQty: parts.reduce((s, p) => s + p.quantity, 0),
    },
    alerts: {
      emergency: workOrders.filter((w) => w.orderType === "emergency" && w.status !== "completed").length,
      lowStock: parts.filter((p) => p.quantity <= p.safetyStock).length,
      calibrationDue: routes.filter((r) => r.category === "measuring" && new Date(r.nextInspectionAt).getTime() <= now + 7 * 86400000).length,
      corrosion: ncs.filter((n) => /corro/i.test(n.description) && n.status !== "closed").length,
      sealIssues: ncs.filter((n) => /sell|seal/i.test(n.description) && n.status !== "closed").length,
    },
    statusDist: byKey(equipment.map((e) => e.status)),
    woStatusDist: byKey(workOrders.map((w) => w.status)),
    partsConsumption: byKey(parts.flatMap((p) => Array(p.consumedLast30d).fill(p.category))),
    equipmentTypes: byKey(equipment.map((e) => e.category)),
  };
}
