// sap.ts — SAP PM/MM adapter (equipment master, work orders, plans, costs, spares, tools).
// sim mode reads the cached Postgres mirror via Prisma. Mirrors SAP OData shapes.
import { prisma } from "@/lib/prisma";
import {
  adapterMode,
  notWired,
  type Criticality,
  type AssetStatus,
  type Equipment,
  type FunctionalLocation,
  type WorkOrder,
  type WorkOrderType,
  type WorkOrderStatus,
  type MaintenancePlan,
  type CostBreakdown,
  type SparePart,
  type Tool,
} from "./types";

type EquipmentRow = {
  id: string; code: string; name: string; functionalLocationId: string | null;
  category: string; location: string; manufacturer: string; model: string;
  serialNumber: string; installDate: Date; commissionDate: Date; warrantyExpiry: Date;
  specs: unknown; criticality: string; status: string; healthIndex: number; runtimeHours: number;
};

function mapEquipment(e: EquipmentRow): Equipment {
  return {
    id: e.id, code: e.code, name: e.name, functionalLocationId: e.functionalLocationId,
    category: e.category, location: e.location, manufacturer: e.manufacturer, model: e.model,
    serialNumber: e.serialNumber, installDate: e.installDate.toISOString(),
    commissionDate: e.commissionDate.toISOString(), warrantyExpiry: e.warrantyExpiry.toISOString(),
    specs: (e.specs ?? {}) as Record<string, string>,
    criticality: e.criticality as Criticality, status: e.status as AssetStatus,
    healthIndex: e.healthIndex, runtimeHours: e.runtimeHours,
  };
}

export async function getFunctionalLocation(id: string): Promise<FunctionalLocation | null> {
  if (adapterMode() === "real") return notWired("sap", "getFunctionalLocation");
  const f = await prisma.functionalLocation.findUnique({ where: { id } });
  if (!f) return null;
  return { id: f.id, code: f.code, name: f.name, parentId: f.parentId, area: f.area, criticality: f.criticality as Criticality };
}

export async function getEquipment(id: string): Promise<Equipment | null> {
  if (adapterMode() === "real") return notWired("sap", "getEquipment");
  const e = await prisma.equipment.findUnique({ where: { id } });
  return e ? mapEquipment(e as EquipmentRow) : null;
}

export async function listEquipment(): Promise<Equipment[]> {
  if (adapterMode() === "real") return notWired("sap", "listEquipment");
  const rows = await prisma.equipment.findMany({ orderBy: { code: "asc" } });
  return rows.map((e) => mapEquipment(e as EquipmentRow));
}

export async function listWorkOrders(assetId?: string): Promise<WorkOrder[]> {
  if (adapterMode() === "real") return notWired("sap", "listWorkOrders");
  const rows = await prisma.workOrder.findMany({
    where: assetId ? { equipmentId: assetId } : undefined,
    include: { equipment: { select: { name: true } } },
    orderBy: { openedAt: "desc" },
  });
  return rows.map((w) => ({
    id: w.id, code: w.code, assetId: w.equipmentId, assetName: w.equipment.name,
    orderType: w.orderType as WorkOrderType, status: w.status as WorkOrderStatus,
    priority: w.priority as Criticality, assignee: w.assignee, description: w.description,
    openedAt: w.openedAt.toISOString(), dueAt: w.dueAt?.toISOString() ?? null,
    closedAt: w.closedAt?.toISOString() ?? null, costEstimate: w.costEstimate, costActual: w.costActual,
  }));
}

function mapPlan(p: { id: string; equipmentId: string; strategy: string; intervalLabel: string; nextDueAt: Date; taskList: unknown }): MaintenancePlan {
  return {
    id: p.id, assetId: p.equipmentId, strategy: p.strategy as MaintenancePlan["strategy"],
    intervalLabel: p.intervalLabel, nextDueAt: p.nextDueAt.toISOString(),
    taskList: (p.taskList ?? []) as string[],
  };
}

export async function getMaintenancePlan(assetId: string): Promise<MaintenancePlan[]> {
  if (adapterMode() === "real") return notWired("sap", "getMaintenancePlan");
  const rows = await prisma.maintenancePlan.findMany({ where: { equipmentId: assetId }, orderBy: { nextDueAt: "asc" } });
  return rows.map(mapPlan);
}

export async function listAllPlans(): Promise<(MaintenancePlan & { assetCode: string })[]> {
  if (adapterMode() === "real") return notWired("sap", "listAllPlans");
  const rows = await prisma.maintenancePlan.findMany({
    include: { equipment: { select: { code: true } } },
    orderBy: { nextDueAt: "asc" },
  });
  return rows.map((p) => ({ ...mapPlan(p), assetCode: p.equipment.code }));
}

export async function getCosts(assetId: string): Promise<CostBreakdown> {
  if (adapterMode() === "real") return notWired("sap", "getCosts");
  const rows = await prisma.workOrder.findMany({ where: { equipmentId: assetId } });
  const total = rows.reduce((s, w) => s + (w.costActual ?? w.costEstimate ?? 0), 0);
  // Deterministic split (sim): SAP CO would give real cost elements.
  return {
    assetId, labor: round(total * 0.5), materials: round(total * 0.35),
    external: round(total * 0.15), total: round(total), currency: "USD", periodLabel: "Últimos 90 días",
  };
}

export async function listSpareParts(assetId?: string): Promise<SparePart[]> {
  if (adapterMode() === "real") return notWired("sap", "listSpareParts");
  const rows = await prisma.sparePart.findMany({
    where: assetId ? { equipmentId: assetId } : undefined,
    include: { equipment: { select: { code: true, name: true } } },
    orderBy: { replacedCount: "desc" },
  });
  return rows.map((s) => ({
    id: s.id, code: s.code, name: s.name, specification: s.specification, category: s.category,
    assetId: s.equipmentId, assetCode: s.equipment?.code ?? null, assetName: s.equipment?.name ?? null,
    quantity: s.quantity, safetyStock: s.safetyStock, unit: s.unit,
    unitCost: s.unitCost, consumedLast30d: s.consumedLast30d, replacedCount: s.replacedCount,
  }));
}

export async function listTools(): Promise<Tool[]> {
  if (adapterMode() === "real") return notWired("sap", "listTools");
  const rows = await prisma.tool.findMany({ orderBy: { code: "asc" } });
  return rows.map((t) => ({
    id: t.id, code: t.code, name: t.name, toolRoom: t.toolRoom,
    storageLocation: t.storageLocation, available: t.available,
  }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
