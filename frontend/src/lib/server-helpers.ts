/**
 * Server-side helpers: state transitions, aggregation, sanitization
 */

// ─── Work Order State Machine ───
const WO_TRANSITIONS: Record<string, string[]> = {
  Planned: ["Released"],
  Released: ["InProgress", "Planned"],
  InProgress: ["Paused", "Completed"],
  Paused: ["InProgress", "Completed"],
  Completed: [],
};

// ─── SAP Order State Machine ───
const SAP_TRANSITIONS: Record<string, string[]> = {
  Open: ["Converted"],
  Converted: ["Closed", "Open"],
  Closed: [],
};

// ─── Machine State Machine ───
const MACHINE_TRANSITIONS: Record<string, string[]> = {
  Running: ["Stopped", "Maintenance"],
  Stopped: ["Running", "Maintenance"],
  Maintenance: ["Stopped"],
};

export function isValidTransition(
  entity: "WorkOrder" | "SapOrder" | "Machine",
  from: string,
  to: string
): boolean {
  let map: Record<string, string[]>;
  switch (entity) {
    case "WorkOrder":
      map = WO_TRANSITIONS;
      break;
    case "SapOrder":
      map = SAP_TRANSITIONS;
      break;
    case "Machine":
      map = MACHINE_TRANSITIONS;
      break;
    default:
      return false;
  }
  const allowed = map[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function getValidTransitions(
  entity: "WorkOrder" | "SapOrder" | "Machine",
  from: string
): string[] {
  let map: Record<string, string[]>;
  switch (entity) {
    case "WorkOrder":
      map = WO_TRANSITIONS;
      break;
    case "SapOrder":
      map = SAP_TRANSITIONS;
      break;
    case "Machine":
      map = MACHINE_TRANSITIONS;
      break;
    default:
      return [];
  }
  return map[from] || [];
}

/**
 * Sanitize input: strips undefined values, converts empty strings to null for optional fields.
 */
export function sanitize<T extends Record<string, unknown>>(
  input: T,
  optionalFields: string[] = []
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (optionalFields.includes(key) && value === "") {
      result[key] = null;
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
