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
  /** Ideal-vs-real de ESTE rack (no del líder). Poblado cuando la fuente única está activa. */
  idealVsReal?: TwinIdealVsReal[];
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

// ─────────────────────────────────────────────────────────────────────────────
// ULTRAFILTRACIÓN — ciclo de CEB
//
// La UF no se regenera con CIP: se regenera con CEB (Chemically Enhanced
// Backwash), un retrolavado al que se le inyecta químico en línea, en cada skid.
// [cita] ADV-129-00-DGM-PL-002_Rev0, NOTA 5: "La inyección de químicos CEB UF
// son a cada skid de UF." Equipos: bomba A19 + estanque de retrolavado BW/CEB de
// 283 m³. Reactivos de clase B (dosificación periódica): hipoclorito de sodio,
// hidróxido de sodio y ácido sulfúrico.
//
// La planta TAMBIÉN tiene instalado un CIP de recuperación para la UF (estanque
// A21 de 13 m³ + bombas A22, clase C), pero esta versión de la app NO lo modela:
// la UF se opera con CEB. Queda como instalación existente en el catálogo.
//
// Variable de estado del ciclo: la PERMEABILIDAD K = flux / TMP (LMH/bar). Cae
// mientras el skid filtra y el CEB la recupera — de ahí el diente de sierra.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Umbral que dispara el CEB, espejo de TWIN_THRESHOLDS.rfRisePct para RO.
 *
 * [inferencia] Los planos ADV son diagramas de flujo y balance de masas, no
 * filosofía de operación: NO traen períodos de ciclo ni umbrales de disparo.
 * Estos valores son un supuesto razonable, declarado en la propia UI, pendiente
 * de validar con Aguas del Valle antes de congelarlo.
 */
export const CEB_THRESHOLDS = {
  permDropPct: 15, // permeabilidad 15% bajo la base (membrana limpia) → CEB
  tmpRisePct: 20,  // TMP +20% sobre la base → alerta de ensuciamiento
  /** Horas de filtración por debajo de las cuales el ciclo se considera anormalmente corto. */
  shortCycleH: 6,
} as const;

/** Régimen en el que está un skid de UF. El CIP de UF no se modela en esta versión. */
export type UfRegime = "ceb" | "preservacion";

export const UF_REGIME_LABELS: Record<UfRegime, string> = {
  ceb: "CEB",
  preservacion: "Preservación",
};

/** Fila por skid de ultrafiltración para la vista del gemelo. */
export type UfSkidRow = {
  code: string; // A12-1
  name: string;
  status: string; // running / maintenance / ...
  regime: UfRegime;
  health: number;        // salud 0-100 derivada de la caída de permeabilidad
  k: number | null;     // permeabilidad K = flux/TMP (LMH/bar), sin normalizar por temperatura
  kBase: number | null; // permeabilidad de membrana recién retrolavada (base del ciclo)
  tmp: number | null;    // presión transmembrana (bar)
  flux: number | null;   // flux (LMH)
  turbidity: number | null; // turbidez de salida (NTU)
  cebHours: number | null;  // HORAS hasta el próximo CEB — el ciclo de UF es de horas, no de días
  cebCycles: number;        // ciclos de CEB ejecutados en la ventana
  lastCebAt: string | null; // ISO del último retrolavado
  trend: "stable" | "rising" | "critical";
};

/**
 * Punto de la serie de permeabilidad — el diente de sierra del ciclo de CEB.
 * A diferencia de la serie de RO (diaria, ciclo de CIP de semanas), ésta es
 * HORARIA: un ciclo de CEB dura horas y a resolución diaria no se vería.
 */
export type UfTrendPoint = {
  t: string; // "DD HH:mm"
  k: number;
  tmp: number;
  flux: number;
  /** true si en esa hora se ejecutó un CEB (marca el salto de recuperación). */
  ceb: boolean;
};

/** Próximo CEB proyectado + último ejecutado. */
export type UfCeb = {
  nextSkidCode: string | null;
  hours: number | null; // horas al umbral del skid más próximo
  trigger: "perm_threshold" | "tmp_threshold" | null;
  lastEvent: { at: string; skidCode: string; kBefore: number; kAfter: number; chemical: string } | null;
  /** Ciclo medio de filtración entre retrolavados, en horas (todos los skids). */
  avgCycleH: number | null;
};

/** Retorno de getUfSummary() — lo que renderiza la pestaña Ultrafiltración de /twin. */
export type UfSummary = {
  skids: UfSkidRow[];
  trend: UfTrendPoint[]; // serie del skid líder
  ceb: UfCeb;
  thresholds: typeof CEB_THRESHOLDS;
};
