// ─────────────────────────────────────────────────────────────────────────────
// OEE / Eficiencia RO — tipos y constantes del módulo de producción.
// Portado del análisis de EQR-APP1 (Módulo OEE de planta desaladora), mapeado
// al proceso de la desaladora-coquimbo: los "trenes RO" son los racks A25-x
// que el plant-config ya modela (Equipment category="Membranes").
// ─────────────────────────────────────────────────────────────────────────────

/** Trenes RO = racks de ósmosis inversa del plant-config. */
export const RO_TRAINS = ["A25-1", "A25-2", "A25-3", "A25-4"] as const;
export type TrainCode = (typeof RO_TRAINS)[number];

/**
 * Capacidad nominal de permeado por tren (m³/h). [inferencia]
 * Derivado del balance: captación 800 l/s · recovery 45% ≈ 360 l/s de permeado
 * ≈ 31.100 m³/día repartidos en 4 racks ≈ 324 m³/h por tren. Validar contra la
 * ingeniería ADV antes de congelar.
 */
export const RO_NOMINAL_M3H = 325;

/**
 * Límites de especificación del agua producto (permeado remineralizado).
 * [inferencia] Referencia NCh409 (Chile) + práctica de desalación de agua de mar.
 * Boro = 1.5 mg/l (NCh409). Validar contra la spec real de Aguas del Valle.
 */
export const QUALITY_LIMITS = {
  conductivityMax: 500, // µS/cm
  tdsMax: 500,          // mg/l
  phMin: 6.5,
  phMax: 8.5,
  boronMax: 1.5,        // mg/l
} as const;

export type DowntimeType = "planificada" | "no_planificada";
export type DowntimeCause = "mecanica" | "electrica" | "instrumentacion" | "proceso" | "externa";
export type QualityStatus = "conforme" | "no_conforme";
export type AlertLevel = "critico" | "advertencia" | "info";
export type AlertStatus = "activa" | "reconocida" | "resuelta";

export const DOWNTIME_TYPE_LABELS: Record<DowntimeType, string> = {
  planificada: "Planificada",
  no_planificada: "No planificada",
};

export const DOWNTIME_CAUSE_LABELS: Record<DowntimeCause, string> = {
  mecanica: "Mecánica",
  electrica: "Eléctrica",
  instrumentacion: "Instrumentación",
  proceso: "Proceso",
  externa: "Externa",
};

export const ALERT_METRIC_LABELS: Record<string, string> = {
  oee: "OEE",
  availability: "Disponibilidad",
  performance: "Rendimiento",
  quality: "Calidad",
  conductivity: "Conductividad permeado",
  boron: "Boro permeado",
  tds: "SDT permeado",
  ph: "pH permeado",
  downtime: "Duración de parada",
};

// ── Estructuras del resumen computado ────────────────────────────────────────

export type TrainOee = {
  code: string;
  name: string;
  status: string;         // running | idle | maintenance | stopped
  oee: number;            // %
  availability: number;   // %
  performance: number;    // %
  quality: number;        // %
  nominalM3h: number;
  actualM3h: number;
  downtimeMin: number;    // minutos no planificados en la ventana
  qualityConforme: number;
  qualityTotal: number;
};

export type ParetoCause = {
  cause: DowntimeCause;
  label: string;
  minutes: number;
  pct: number;    // % del total de downtime
  cumPct: number; // acumulado (curva de Pareto)
};

export type OeeThresholds = { target: number; acceptable: number; critical: number };

export type OeeSummary = {
  window: { days: number; from: string; to: string };
  plant: {
    oee: number;
    availability: number;
    performance: number;
    quality: number;
    trainsOnline: number;
    trainsTotal: number;
    totalDowntimeMin: number;
    totalProductionM3d: number;
  };
  trains: TrainOee[];
  paretoCauses: ParetoCause[];
  pillarLoss: { availability: number; performance: number; quality: number }; // puntos OEE perdidos
  activeAlerts: number;
  thresholds: OeeThresholds;
};

/** Clasifica un OEE (o pilar) contra los umbrales del turno → color semántico. */
export function oeeBand(value: number, t: OeeThresholds): "ok" | "warn" | "crit" {
  if (value >= t.target) return "ok";
  if (value >= t.critical) return "warn";
  return "crit";
}
