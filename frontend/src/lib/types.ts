/**
 * Shared types used across client and server components
 */

export interface SapOrderRecord {
  id: string;
  orderNumber: string;
  material: string;
  description: string;
  quantity: number;
  unit: string;
  dueDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  workOrders?: WorkOrderRecord[];
}

export interface WorkOrderRecord {
  id: string;
  woNumber: string;
  sapOrderId: string | null;
  machine: string;
  plannedQty: number;
  actualQty: number;
  scrapQty: number;
  unit: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  runningTimeMin: number;
  createdAt: string;
  updatedAt: string;
  sapOrder?: SapOrderRecord | null;
  inspections?: QualityInspectionRecord[];
}

export interface MachineRecord {
  id: string;
  code: string;
  name: string;
  status: string;
  currentSpeed: number;
  productionRate: number;
  activeWorkOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityInspectionRecord {
  id: string;
  workOrderId: string;
  machineCode: string;
  basisWeight: number;
  moisture: number;
  result: string;
  inspectedBy: string;
  inspectedAt: string;
  createdAt: string;
  updatedAt: string;
  workOrder?: WorkOrderRecord;
}

export interface MachineLogRecord {
  id: string;
  machineCode: string;
  workOrderId: string | null;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface DowntimeEventRecord {
  id: string;
  machineCode: string;
  workOrderId: string | null;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogRecord {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  timestamp: string;
}

export type WOStatus = "Planned" | "Released" | "InProgress" | "Paused" | "Completed";
export type SapStatus = "Open" | "Converted" | "Closed";
export type MachineStatus = "Running" | "Stopped" | "Maintenance";
export type QualityResult = "Pass" | "Fail";
