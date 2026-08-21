/**
 * Permission system — role-based access control for the EAM Entity-360 app.
 * Roles (REQUIREMENTS.md §4): Mantenedor, Planificador, Supervisor, Lector.
 */

export type Action =
  // views (one per module)
  | "view_dashboard"
  | "view_equipment"
  | "view_maintenance"
  | "view_spare_parts"
  | "view_operations"
  | "view_inspection"
  | "view_predictive"
  | "view_analytics"
  | "view_oee"
  // oee / eficiencia RO
  | "log_downtime"
  | "validate_downtime"
  | "log_quality"
  | "manage_shifts"
  | "manage_alert_rules"
  | "ack_alert"
  // ar / observaciones de terreno (QR)
  | "raise_observation"
  // equipment
  | "edit_equipment"
  | "view_costs"
  // work orders (lifecycle: pending → assigned → approved → in_progress → completed)
  | "create_wo"
  | "assign_wo"
  | "transition_wo"
  | "close_wo"
  | "edit_plan"
  // inspection / compliance
  | "record_inspection"
  | "close_nc"
  // spare parts & tools
  | "manage_spares"
  | "manage_tools"
  // reports
  | "export_report";

const ALL_ACTIONS: Action[] = [
  "view_dashboard", "view_equipment", "view_maintenance", "view_spare_parts",
  "view_operations", "view_inspection", "view_predictive", "view_analytics", "view_oee",
  "log_downtime", "validate_downtime", "log_quality", "manage_shifts",
  "manage_alert_rules", "ack_alert", "raise_observation",
  "edit_equipment", "view_costs", "create_wo", "assign_wo", "transition_wo",
  "close_wo", "edit_plan", "record_inspection", "close_nc", "manage_spares",
  "manage_tools", "export_report",
];

const VIEW_ACTIONS: Action[] = [
  "view_dashboard", "view_equipment", "view_maintenance", "view_spare_parts",
  "view_operations", "view_inspection", "view_predictive", "view_analytics", "view_oee",
];

export const PERMISSION_MATRIX: Record<string, Action[]> = {
  // Full access incl. costs, NC closure, equipment criticality, tools, exports.
  Supervisor: ALL_ACTIONS,
  // Plan & schedule: create/assign/transition WOs, edit plans, manage spares.
  // OEE: valida paradas, define turnos/metas y reglas de alerta.
  Planificador: [
    ...VIEW_ACTIONS,
    "create_wo", "assign_wo", "transition_wo", "edit_plan", "manage_spares",
    "log_downtime", "validate_downtime", "manage_shifts", "manage_alert_rules", "ack_alert",
    "raise_observation",
  ],
  // Execute: transition assigned WOs, record inspections, log spare consumption.
  // OEE: registra paradas y calidad de permeado, reconoce alertas.
  Mantenedor: [
    ...VIEW_ACTIONS,
    "transition_wo", "record_inspection",
    "log_downtime", "log_quality", "ack_alert", "raise_observation",
  ],
  // Read-only across all modules; action buttons disabled (not hidden) with Tooltip.
  Lector: VIEW_ACTIONS,
};

/** Check whether a role is allowed to perform an action. */
export function can(role: string, action: Action): boolean {
  const allowed = PERMISSION_MATRIX[role];
  if (!allowed) return false;
  return allowed.includes(action);
}

/** Check if a role is Supervisor (unrestricted). */
export function isSupervisor(role: string): boolean {
  return role === "Supervisor";
}
