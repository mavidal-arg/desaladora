// ─────────────────────────────────────────────────────────────────────────────
// twin-types.ts — Contratos compartidos del Gemelo Digital (WAT / Tier0).
//
// Fuente única de verdad de:
//   • los NOMBRES de las señales virtuales calculadas (contrato C2, persistencia)
//   • el shape del payload que publica el motor Python (contrato C1)
//   • los tipos que consume la UI (/twin, mímico, /proceso, /predictive) (contrato C3)
//
// Lo importan: Agente C (schema/seed/desal.ts), Agente D (UI), y sirve de
// referencia para Agente B (bridge Node-RED) y Agente A (motor Python).
// NO editar sin re-congelar el contrato en workflows/twin_digital.md.
// ─────────────────────────────────────────────────────────────────────────────

// ── C2: señales virtuales calculadas, por rack RO (A25-1/2/3) ────────────────
// Nombre PiSignal.signal → unidad. camelCase para matchear el estilo existente
// (recovery, saltRejection, permeateTds, dpTmp, motorCurrent).
export const TWIN_SIGNALS = {
  rf: "1/m", // Resistencia por ensuciamiento (fouling) — cruda
  rfNorm: "1/m", // Rf normalizado a T/S de referencia (ASTM D4516)
  sec: "kWh/m³", // Consumo específico de energía neto (con ERI)
  tmp: "bar", // Presión transmembrana
  ndp: "bar", // Net Driving Pressure (TMP − Δπ)
  piOsmotic: "bar", // Presión osmótica diferencial Δπ (van 't Hoff)
  beta: "", // Factor de polarización de concentración (adimensional)
} as const;

export type TwinSignal = keyof typeof TWIN_SIGNALS;

/** Condiciones de referencia para la normalización ASTM D4516. */
export const TWIN_REF = {
  tempRefC: 25, // °C de referencia
  tdsRefMgL: 38329, // salinidad feed de referencia (mg/l, = A1 nominal)
} as const;

/** Umbrales prescriptivos (PDF §8.3.2) que disparan alerta / CIP. */
export const TWIN_THRESHOLDS = {
  rfRisePct: 15, // Rf 15% sobre la base (membrana limpia) → CIP
  secRiseKwhM3: 0.2, // SEC +0.2 kWh/m³ sobre la base → alerta energética
} as const;

// ── C1: payload que publica el motor Python en .../RO_XX/Metrics/Calculated ──
// snake_case (contrato con Python/MQTT). El bridge (Agente B) lo mapea a las
// señales camelCase de C2 al persistir.
export type CalculatedPayload = {
  train_id: string; // p.ej. "A25-1"
  ts: number; // epoch ms
  TMP_bar: number;
  NDP_bar: number;
  Delta_Pi_bar: number;
  Water_Flux_m_s: number;
  R_Total: number;
  R_f: number;
  Rf_norm: number;
  SEC_kWh_m3: number;
  beta: number;
  cip_days: number | null; // RUL: días hasta cruzar el umbral (null si no degrada)
  quality?: "good" | "uncertain" | "bad";
};

// ── C3: tipos que consume la app (retorno de getTwinSummary en desal.ts) ─────
/** Métricas físicas instantáneas de un tren RO (último valor). */
export type TwinMetrics = {
  rf: number;
  rfNorm: number;
  sec: number;
  tmp: number;
  ndp: number;
  piOsmotic: number;
  beta: number;
};

/** Fila por tren de membranas RO para la vista del gemelo. */
export type TwinRackRow = {
  code: string; // A25-1
  name: string;
  status: string; // running / maintenance / ...
  health: number; // salud compuesta 0-100 (derivada de Rf/ΔP/rechazo)
  metrics: TwinMetrics;
  rfBase: number; // Rf de membrana limpia (base de calibración)
  cipDays: number | null; // días hasta CIP (RUL)
  trend: "stable" | "rising" | "critical"; // dRf/dt cualitativo
};

/** Punto de la serie temporal para las tendencias de ensuciamiento. */
export type TwinTrendPoint = {
  day: string; // MM-DD
  rf: number;
  rfNorm: number;
  sec: number;
  tmp: number;
};

/** Comparación ideal (primeros principios, membrana limpia) vs real medido. */
export type TwinIdealVsReal = {
  label: string; // p.ej. "SEC", "TMP", "Recovery"
  unit: string;
  ideal: number; // valor teórico membrana/bomba nueva
  real: number; // valor medido actual
  deviationPct: number; // (real-ideal)/ideal * 100
};

/** Próximo evento de CIP proyectado + último ejecutado. */
export type TwinCip = {
  nextTrainCode: string | null;
  days: number | null; // RUL del tren más próximo al umbral
  trigger: "rf_threshold" | "sec_threshold" | null;
  lastEvent: { day: string; trainCode: string; rfBefore: number; rfAfter: number } | null;
};

/** Retorno de getTwinSummary() — lo que renderiza /twin. */
export type TwinSummary = {
  racks: TwinRackRow[];
  trend: TwinTrendPoint[]; // serie del tren líder (o promedio)
  idealVsReal: TwinIdealVsReal[];
  cip: TwinCip;
  thresholds: typeof TWIN_THRESHOLDS;
};
