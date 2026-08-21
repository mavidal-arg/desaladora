// ─────────────────────────────────────────────────────────────────────────────
// CÓDIGO DE COLORES UNIFICADO — fuente única (acordado con cliente).
//
// Principio: los colores SEMÁNTICOS (verde/ámbar/rojo/gris/azul/índigo) están
// reservados para ESTADO y CONDICIÓN, con significado fijo. Las CATEGORÍAS
// (tipos de equipo, categorías de repuesto) usan una paleta CUALITATIVA aparte,
// para no confundir "categoría" con "estado".
// ─────────────────────────────────────────────────────────────────────────────

export type StatusColor = { label: string; bg: string; text: string; dot: string; ring: string; hex: string };

// Tokens semánticos base (clases Tailwind + hex para charts/SVG).
const G = { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", ring: "ring-emerald-500/30", hex: "#10b981" }; // verde  — ok / en marcha / completado / en rango
const A = { bg: "bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",   ring: "ring-amber-500/40",   hex: "#f59e0b" }; // ámbar  — mantenimiento / en progreso / advertencia / fuera de rango
const R = { bg: "bg-red-500/15",     text: "text-red-600 dark:text-red-400",         dot: "bg-red-500",     ring: "ring-red-500/40",     hex: "#ef4444" }; // rojo   — detenido / falla / crítico
const N = { bg: "bg-gray-500/15",    text: "text-gray-600 dark:text-gray-400",       dot: "bg-gray-400",    ring: "ring-gray-400/30",    hex: "#9ca3af" }; // gris   — en espera / pendiente / neutro
const B = { bg: "bg-blue-500/15",    text: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500",    ring: "ring-blue-500/30",    hex: "#3b82f6" }; // azul   — abierta / aprobada / liberada
const I = { bg: "bg-indigo-500/15",  text: "text-indigo-600 dark:text-indigo-400",   dot: "bg-indigo-500",  ring: "ring-indigo-500/30",  hex: "#6366f1" }; // índigo — asignada / convertida

const mk = (label: string, c: typeof G): StatusColor => ({ label, ...c });

// Mapa único estado/condición → color + etiqueta en español.
export const STATUS_COLORS: Record<string, StatusColor> = {
  // ── Estado operativo (equipos / proceso) ──
  running: mk("En marcha", G), active: mk("Activo", G), idle: mk("En espera", N),
  maintenance: mk("Mantenimiento", A), stopped: mk("Detenido", R), down: mk("Detenido", R),
  // ── Órdenes de trabajo ──
  pending: mk("Pendiente", N), planned: mk("Planificada", N), draft: mk("Borrador", N),
  open: mk("Abierta", B), released: mk("Liberada", B), approved: mk("Aprobada", B),
  assigned: mk("Asignada", I), converted: mk("Convertida", I),
  in_progress: mk("En progreso", A), inprogress: mk("En progreso", A), paused: mk("Pausada", A),
  completed: mk("Completada", G), done: mk("Completada", G), closed: mk("Cerrada", N),
  // ── Calidad / condición ──
  pass: mk("Aprobado", G), fail: mk("Rechazado", R), failed: mk("Falla", R), rejected: mk("Rechazado", R),
  en_rango: mk("En rango", G), fuera_rango: mk("Fuera de rango", A), falla: mk("Falla", R), otros: mk("Otros", N),
  warning: mk("Advertencia", A), blocked: mk("Bloqueado", R),
  // ── Severidad / salud ──
  low: mk("Baja", N), medium: mk("Media", A), high: mk("Alta", R), critical: mk("Crítica", R),
  healthy: mk("Saludable", G),
  // ── Tendencia predictiva ──
  up: mk("En mejora", G), stable: mk("Estable", N), declining: mk("En deterioro", R),
  // ── Disponibilidad de herramienta ──
  available: mk("Disponible", G), in_use: mk("En uso", A),
  // ── No conformidad ──
  in_review: mk("En revisión", A),
};

const FALLBACK: StatusColor = mk("—", N);

/** Devuelve el color/etiqueta semántico de una clave de estado (case/space-insensitive). */
export function statusColor(key: string | null | undefined): StatusColor {
  if (!key) return FALLBACK;
  const k = String(key).toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_COLORS[k] ?? FALLBACK;
}

// ── Paleta CUALITATIVA para categorías (NO semántica) ──
// Evita verde/ámbar/rojo puros para no chocar con los estados.
export const CATEGORY_PALETTE = [
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#f97316", // orange
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
  "#f43f5e", // rose
];

/** Color estable (determinista) por nombre de categoría / tipo. */
export function categoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_PALETTE[Math.abs(h) % CATEGORY_PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA SCADA — 4 estados estándar de proceso para la Vista de proceso (P&ID).
// Convención de HMI de alto rendimiento (ISA-101): marcha=verde, detención=gris
// (des-energizado, sin color de alarma), anomalía=ámbar, alarma=rojo (parpadeante).
// Se mapea desde el estado/condición del equipo al bucket SCADA correspondiente.
// ─────────────────────────────────────────────────────────────────────────────
export type ScadaState = "marcha" | "detencion" | "anomalia" | "alarma";

export type ScadaStyle = StatusColor & { key: ScadaState; blink: boolean };

const mkScada = (key: ScadaState, label: string, c: typeof G, blink = false): ScadaStyle => ({ key, label, blink, ...c });

export const SCADA_COLORS: Record<ScadaState, ScadaStyle> = {
  marcha:    mkScada("marcha", "Marcha", G),
  detencion: mkScada("detencion", "Detención", N),
  anomalia:  mkScada("anomalia", "Anomalía", A),
  alarma:    mkScada("alarma", "Alarma", R, true),
};

// Leyenda ordenada para la pantalla (marcha → detención → anomalía → alarma).
export const SCADA_LEGEND: ScadaStyle[] = [
  SCADA_COLORS.marcha, SCADA_COLORS.detencion, SCADA_COLORS.anomalia, SCADA_COLORS.alarma,
];

/** Mapea un estado/condición de equipo (o de salud) al bucket SCADA de 4 estados. */
export function scadaState(key: string | null | undefined): ScadaStyle {
  const k = String(key ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["running", "active", "en_rango", "healthy", "pass", "available"].includes(k)) return SCADA_COLORS.marcha;
  if (["failed", "falla", "fail", "critical", "high", "blocked", "alarm", "alarma", "declining"].includes(k)) return SCADA_COLORS.alarma;
  if (["maintenance", "warning", "fuera_rango", "in_progress", "in_review", "paused", "in_use", "medium"].includes(k)) return SCADA_COLORS.anomalia;
  // idle / stopped / down / pending / closed / low / stable / desconocido → detención (gris)
  return SCADA_COLORS.detencion;
}

/** Estado SCADA a partir de un índice de salud 0–100 (para racks/membranas). */
export function scadaFromHealth(health: number): ScadaStyle {
  if (health >= 85) return SCADA_COLORS.marcha;
  if (health >= 72) return SCADA_COLORS.anomalia;
  return SCADA_COLORS.alarma;
}

// Chrome de charts (tomado de tokens de tema, no hex hardcodeado).
export const CHART = {
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  tooltipBg: "var(--popover)",
  tooltipBorder: "var(--border)",
  accent: "var(--accent)",
};

// Leyenda del estándar acordado (para mostrar en /admin como referencia).
export const COLOR_LEGEND: { group: string; items: { label: string; key: string }[] }[] = [
  { group: "Estado de equipo", items: [
    { label: "En marcha", key: "running" }, { label: "En espera", key: "idle" },
    { label: "Mantenimiento", key: "maintenance" }, { label: "Detenido", key: "stopped" } ] },
  { group: "Orden de trabajo", items: [
    { label: "Pendiente", key: "pending" }, { label: "Aprobada", key: "approved" },
    { label: "En progreso", key: "in_progress" }, { label: "Completada", key: "completed" } ] },
  { group: "Condición / medición", items: [
    { label: "En rango", key: "en_rango" }, { label: "Fuera de rango", key: "fuera_rango" },
    { label: "Falla", key: "falla" }, { label: "Otros", key: "otros" } ] },
];
