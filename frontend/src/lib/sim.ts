// ─────────────────────────────────────────────────────────────────────────────
// Núcleo determinista de la fuente única de señales — SIN dependencias (para que
// lo pueda importar un script suelto y `live-signals.ts` por igual).
// ─────────────────────────────────────────────────────────────────────────────

export type LiveSeverity = "ok" | "warn" | "out";

export function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Valor "vivo" determinista de una señal en el instante `nowMs`.
 *
 * Función PURA: mismo `(signalId, nowMs, center, amp)` → mismo número en cualquier
 * proceso. Sin `Math.random`. Dos ondas de período distinto (≈47 s y ≈113 s) con
 * fase sembrada por el hash del `signalId`, sumadas y escaladas por `amp`
 * alrededor de `center`.
 */
export function simValueAt(signalId: string, nowMs: number, center: number, amp: number): number {
  const seed = hashInt(signalId);
  const p1 = ((seed % 1000) / 1000) * Math.PI * 2;
  const p2 = ((seed % 733) / 733) * Math.PI * 2;
  const w1 = (2 * Math.PI) / 47000;
  const w2 = (2 * Math.PI) / 113000;
  const osc = 0.6 * Math.sin(nowMs * w1 + p1) + 0.4 * Math.sin(nowMs * w2 + p2);
  return center + amp * osc;
}

/** Severidad de una lectura contra su banda [min,max]. */
export function severityOf(value: number, min?: number, max?: number): LiveSeverity {
  if (min == null || max == null) return "ok";
  if (value < min || value > max) return "out";
  const margin = (max - min) * 0.05;
  if (value <= min + margin || value >= max - margin) return "warn";
  return "ok";
}
