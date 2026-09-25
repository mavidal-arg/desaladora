// Stable adapter contract (REQUIREMENTS.md §6). Return shapes mirror PI Web API / SAP OData
// / SE Suite REST. The frontend depends ONLY on these types — never on Prisma models directly —
// so swapping ADAPTER_MODE from `sim` to `real` replaces adapter bodies, not the app.

export type Criticality = "low" | "medium" | "high" | "critical";
export type AssetStatus = "running" | "stopped" | "maintenance" | "idle";

export interface AssetTreeNode {
  id: string;
  code: string;
  name: string;
  kind: "functionalLocation" | "equipment";
  criticality: Criticality;
  status: AssetStatus | null; // null for functional locations
  children: AssetTreeNode[];
}

export interface SignalValue {
  signal: string;
  value: number;
  unit: string;
  ts: string;
  quality: "good" | "bad" | "uncertain";
}

export interface TrendPoint {
  ts: string;
  value: number;
}

export interface FunctionalLocation {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  area: string;
  criticality: Criticality;
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  functionalLocationId: string | null;
  category: string;
  location: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installDate: string;
  commissionDate: string;
  warrantyExpiry: string;
  specs: Record<string, string>;
  criticality: Criticality;
  status: AssetStatus;
  healthIndex: number;
  runtimeHours: number;
}

export type WorkOrderType = "preventive" | "corrective" | "emergency" | "predictive";
export type WorkOrderStatus = "pending" | "assigned" | "approved" | "in_progress" | "completed";

export interface WorkOrder {
  id: string;
  code: string;
  assetId: string;
  assetName: string;
  orderType: WorkOrderType;
  status: WorkOrderStatus;
  priority: Criticality;
  assignee: string | null;
  description: string;
  openedAt: string;
  dueAt: string | null;
  closedAt: string | null;
  costEstimate: number | null;
  costActual: number | null;
}

export interface MaintenancePlan {
  id: string;
  assetId: string;
  strategy: "daily" | "monthly" | "runtime" | "predictive";
  intervalLabel: string;
  nextDueAt: string;
  taskList: string[];
}

export interface CostBreakdown {
  assetId: string;
  labor: number;
  materials: number;
  external: number;
  total: number;
  currency: string;
  periodLabel: string;
}

export interface SparePart {
  id: string;
  code: string;
  name: string;
  specification: string;
  category: string;
  assetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  quantity: number;
  safetyStock: number;
  unit: string;
  unitCost: number;
  consumedLast30d: number;
  replacedCount: number;
}

export interface Tool {
  id: string;
  code: string;
  name: string;
  toolRoom: string;
  storageLocation: string;
  available: boolean;
}

export interface SeDocument {
  id: string;
  code: string;
  assetId: string | null;
  title: string;
  docType: "SOP" | "P&ID" | "safety" | "manual";
  revision: string;
  updatedAt: string;
  url: string;
}

export interface Procedure {
  id: string;
  title: string;
  steps: string[];
  safetyNotes: string[];
}

export interface ObservationReading {
  signal: string;
  label: string;
  value: number;
  unit: string;
  /** "app" = lo que mostraba la app · "field" = lo que leyó el operador. */
  source: "app" | "field";
  capturedAt: string;
}

export interface NonConformity {
  id: string;
  code: string;
  assetId: string;
  severity: Criticality;
  description: string;
  status: "open" | "in_review" | "closed";
  /** Categoría corta para agrupar recurrencia por equipo (ver finding-treatment.ts). */
  findingType: string;
  /** Sólo se fija al cerrar: distingue un hallazgo resuelto de uno mal levantado. */
  treatmentOutcome?: "resolved" | "false_positive" | null;
  treatmentNote?: string | null;
  raisedAt: string;
  /** Quién la levantó. Vacío en las no-conformidades del sistema (sin autor). */
  raisedBy?: string | null;
  raisedByRole?: string | null;
  /** Snapshot de datos del momento en que se levantó (sólo observaciones de terreno). */
  readings?: ObservationReading[];
}

export interface InspectionRoute {
  id: string;
  code: string;
  name: string;
  category: "patrol" | "special" | "measuring";
  assetIds: string[];
  frequency: "daily" | "weekly" | "monthly";
  nextInspectionAt: string;
  inspector: string;
  tasks: { date: string; inspector: string; status: string; startedAt?: string }[];
}

export interface InspectionChecklistItem {
  item: string;
  body: string;
  expected: string;
  leakStatus: "none" | "minor" | "major" | null;
}

export interface PredictiveProfile {
  assetId: string;
  assetCode: string;
  assetName: string;
  configured: boolean;
  healthScore: number;
  trend: "up" | "stable" | "down" | "declining";
  predFailureDays: number | null;
  anomalies: { param: string; value: number; delta: number }[];
  // Optional enrichment (added for domain-aware maintenance labelling — B4).
  // Kept OPTIONAL so existing consumers of the contract are unaffected.
  category?: string; // categoría de equipo (Membranes, Pumps, …) desde Equipment.category
  areaCode?: string; // código de área (RO, UF, INTK, …) desde la ubicación funcional del equipo
}

export type AdapterMode = "sim" | "real";

export function adapterMode(): AdapterMode {
  return (process.env.ADAPTER_MODE as AdapterMode) || "sim";
}

/** Throw for unimplemented real-mode bodies — keeps the boundary explicit. */
export function notWired(adapter: string, fn: string): never {
  throw new Error(
    `[adapter:${adapter}] ${fn} real mode not wired — set ADAPTER_MODE=sim or implement the real call`
  );
}
