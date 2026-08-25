import { prisma } from "@/lib/prisma";
import { eqId } from "@/lib/plant-config";
import {
  CEB_THRESHOLDS,
  type UfCeb,
  type UfRegime,
  type UfSkidRow,
  type UfSummary,
  type UfTrendPoint,
} from "@/lib/twin-types";

// ─────────────────────────────────────────────────────────────────────────────
// ULTRAFILTRACIÓN — el ciclo de CEB.
//
// Hermano de `desal.ts`, que hace lo mismo para los racks de ósmosis inversa.
// La diferencia no es de implementación sino de proceso: los trenes RO se
// regeneran con CIP (limpieza química recirculada) y la UF se regenera con CEB
// (Chemically Enhanced Backwash) — retrolavado con reactivo inyectado en línea a
// cada skid.
//
// [cita] ADV-129-00-DGM-PL-002_Rev0, NOTA 5: "La inyección de químicos CEB UF
// son a cada skid de UF." Equipos del plano: bomba A19 + estanque de retrolavado
// BW/CEB de 283 m³. Reactivos clase B (dosificación periódica): hipoclorito de
// sodio, hidróxido de sodio, ácido sulfúrico.
//
// La planta tiene ADEMÁS un CIP de recuperación para UF (estanque A21 de 13 m³ +
// bombas A22, clase C del plano). Esta versión NO lo modela: la UF se opera con
// CEB. A21/A22 quedan en el catálogo como instalación existente.
//
// Variable de estado del ciclo: la PERMEABILIDAD K = flux / TMP (LMH/bar). Cae
// mientras el skid filtra y el CEB la recupera — el diente de sierra del gráfico.
//
// CADENCIA: el ciclo de CEB dura HORAS, no semanas. Ésa es la diferencia
// operativa de fondo con el CIP de los trenes RO (decenas de días) y la razón de
// que la serie de UF sea horaria mientras la de RO es diaria: a un punto por día
// el diente de sierra del CEB no existiría.
// ─────────────────────────────────────────────────────────────────────────────

/** Skids de ultrafiltración del plant-config (category="Membranes", kind="uf_skid"). */
export const UF_CODES = ["A12-1", "A12-2", "A12-3"] as const;

const r = (n: number, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; };

type Series = { ts: Date; value: number }[];
type SkidReadings = Map<string, Series>;

/** Carga las lecturas de los skids UF agrupadas por skid y señal, ascendentes por ts. */
async function loadSkidReadings(): Promise<Map<string, SkidReadings>> {
  const ids = UF_CODES.map((c) => eqId(c));
  const signals = await prisma.piSignal.findMany({
    where: { equipmentId: { in: ids } },
    // Serie horaria: se traen ~7 días de ciclo para que la regresión tenga
    // varios dientes de sierra y no dependa de un solo tramo.
    include: { readings: { orderBy: { ts: "desc" }, take: 200 } },
  });
  const bySkid = new Map<string, SkidReadings>();
  for (const code of UF_CODES) bySkid.set(code, new Map());
  const idToCode = new Map(UF_CODES.map((c) => [eqId(c), c as string]));
  for (const s of signals) {
    const code = idToCode.get(s.equipmentId);
    if (!code) continue;
    bySkid.get(code)!.set(s.signal, [...s.readings].reverse().map((x) => ({ ts: x.ts, value: x.value })));
  }
  return bySkid;
}

const latest = (sr: SkidReadings, name: string): number | undefined => sr.get(name)?.at(-1)?.value;

/**
 * Serie de permeabilidad K = flux / TMP (LMH/bar), alineando ambas señales por índice.
 *
 * NO está corregida por temperatura. La corrección a 20 °C es la práctica correcta
 * —la viscosidad del agua cambia con la temperatura y altera la permeabilidad—,
 * pero exige la temperatura de alimentación DE CADA SKID, y este modelo sólo
 * instrumenta la de captación (A1). Aplicar esa temperatura a los tres skids
 * sería fabricar una precisión que el dato no tiene, así que la permeabilidad se
 * reporta sin normalizar y así se declara en la UI. [inferencia] pendiente:
 * sondear con Aguas del Valle si hay TT por skid en la instrumentación real.
 */
function permeabilitySeries(sr: SkidReadings): { ts: Date; value: number }[] {
  const flux = sr.get("flux") ?? [];
  const tmp = sr.get("tmp") ?? [];
  const n = Math.min(flux.length, tmp.length);
  const out: { ts: Date; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tmp[i].value;
    if (t <= 0.01) continue; // sin presión no hay permeabilidad definida
    out.push({ ts: flux[i].ts, value: flux[i].value / t });
  }
  return out;
}

/**
 * Estima las HORAS hasta el próximo CEB.
 *
 * Réplica directa de `estimateCipDays` (desal.ts) con el signo invertido: allá
 * la resistencia SUBE hasta cruzar el umbral, acá la permeabilidad BAJA. Se
 * recorta al tramo posterior al último retrolavado (última subida fuerte =
 * recuperación) y se proyecta la pendiente contra el umbral. La serie es horaria,
 * así que la pendiente ya está en unidades por hora.
 */
export function estimateCebHours(series: { value: number }[], kBase: number): number | null {
  if (series.length < 2) return null;
  const vals = series.map((s) => s.value);
  // Última recuperación fuerte ⇒ ahí empezó el ciclo actual.
  let start = 0;
  for (let i = vals.length - 1; i > 0; i--) {
    if (vals[i] > vals[i - 1] * 1.03) { start = i; break; }
  }
  const seg = vals.slice(start);
  if (seg.length < 2) return null;
  const slope = (seg[seg.length - 1] - seg[0]) / (seg.length - 1); // por hora (negativa)
  const last = seg[seg.length - 1];
  const threshold = kBase * (1 - CEB_THRESHOLDS.permDropPct / 100);
  if (slope >= 0) return null; // recién retrolavado / estable
  return Math.max(0, Math.round((last - threshold) / -slope));
}

/**
 * Permeabilidad de membrana recién retrolavada (base del ciclo).
 *
 * Tomar el máximo de la ventana parece lo obvio, pero el máximo es un solo punto
 * y se lo lleva el ruido de medición: la base queda inflada un par de puntos y
 * todos los skids parecen más ensuciados de lo que están. Se usa en cambio la
 * MEDIANA de las recuperaciones — los puntos inmediatamente posteriores a cada
 * CEB, detectados como saltos hacia arriba en la serie. Con varios ciclos en la
 * ventana eso es una base estable. Si no hay saltos (serie corta o skid recién
 * puesto en marcha) se cae al máximo, que es lo mejor disponible.
 */
function cleanBaseline(series: { value: number }[]): number | null {
  if (!series.length) return null;
  const peaks: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i].value > series[i - 1].value * 1.03) peaks.push(series[i].value);
  }
  if (peaks.length < 2) return Math.max(...series.map((s) => s.value));
  const sorted = peaks.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Ciclo medio de filtración entre retrolavados, en horas. */
function avgCycleHours(days: Date[]): number | null {
  if (days.length < 2) return null;
  const sorted = days.slice().sort((a, b) => a.getTime() - b.getTime());
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) sum += (sorted[i].getTime() - sorted[i - 1].getTime()) / 3_600_000;
  return Math.round((sum / (sorted.length - 1)) * 10) / 10;
}

/** Salud 0-100 del skid: cuánta permeabilidad perdió respecto de la base, más penalización por TMP. */
export function ufHealthOf(k: number | null, kBase: number | null, tmp: number | undefined): number {
  if (k == null || kBase == null || kBase <= 0) return 80;
  const drop = Math.max(0, (kBase - k) / kBase); // 0 = limpia
  const dropPen = Math.min(drop / (CEB_THRESHOLDS.permDropPct / 100), 1.3) * 45;
  const tmpPen = Math.min(Math.max(((tmp ?? 0.6) - 0.6) / 0.6, 0), 1) * 15;
  return Math.round(Math.min(Math.max(100 - dropPen - tmpPen, 20), 100));
}

/**
 * Resumen del régimen de CEB para la pestaña Ultrafiltración del gemelo.
 *
 * Espejo de `getTwinSummary()` en `desal.ts` — misma forma, otro proceso.
 */
export async function getUfSummary(): Promise<UfSummary> {
  const [bySkid, equipment, cebEvents] = await Promise.all([
    loadSkidReadings(),
    prisma.equipment.findMany({ where: { code: { in: [...UF_CODES] } } }),
    prisma.cebEvent.findMany({ orderBy: { day: "desc" }, take: 200 }),
  ]);
  const eqByCode = new Map(equipment.map((e) => [e.code, e]));

  const seriesByCode = new Map<string, { ts: Date; value: number }[]>();
  const skids: UfSkidRow[] = UF_CODES.map((code) => {
    const sr = bySkid.get(code) ?? new Map();
    const perm = permeabilitySeries(sr);
    seriesByCode.set(code, perm);

    const eq = eqByCode.get(code);
    const status = eq?.status ?? "running";
    // Un skid fuera de servicio prolongado está en preservación (metabisulfito,
    // clase D del plano), no en ciclo de CEB: no tiene sentido proyectarle un
    // próximo retrolavado.
    const regime: UfRegime = status === "stopped" ? "preservacion" : "ceb";

    const k = perm.at(-1)?.value ?? null;
    // La base se deriva de la MISMA serie que k, para que la comparación sea
    // homogénea: tomarla del kAfter de un CebEvent mezclaría dos orígenes.
    const kBase = cleanBaseline(perm);

    const cebHours = regime === "ceb" && kBase != null ? estimateCebHours(perm, kBase) : null;
    const tmp = latest(sr, "tmp");
    const flux = latest(sr, "flux");
    const turbidity = latest(sr, "turbidity");
    const health = regime === "preservacion"
      ? Math.round(eq?.healthIndex ?? 80)
      : ufHealthOf(k, kBase, tmp);

    const mine = cebEvents.filter((e) => e.skidCode === code);
    return {
      code,
      name: eq?.name ?? code,
      status,
      regime,
      health,
      k: k != null ? r(k, 1) : null,
      kBase: kBase != null ? r(kBase, 1) : null,
      tmp: tmp != null ? r(tmp, 2) : null,
      flux: flux != null ? r(flux, 1) : null,
      turbidity: turbidity != null ? r(turbidity, 3) : null,
      cebHours,
      cebCycles: mine.length,
      lastCebAt: mine[0]?.day.toISOString() ?? null,
      trend: cebHours == null ? "stable" : cebHours <= 2 ? "critical" : cebHours <= 4 ? "rising" : "stable",
    };
  });

  // Skid líder = el más próximo al umbral de CEB; si ninguno proyecta, el de menor salud.
  const withHours = skids.filter((s) => s.cebHours != null);
  const lead = withHours.length
    ? withHours.reduce((a, b) => (a.cebHours! <= b.cebHours! ? a : b))
    : skids.slice().sort((a, b) => a.health - b.health)[0];

  // Serie del líder, recortada a las últimas 72 h: suficiente para ver varios
  // dientes de sierra sin volver ilegible el eje.
  const leadSeries = lead ? (seriesByCode.get(lead.code) ?? []).slice(-72) : [];
  const leadSr = lead ? bySkid.get(lead.code) ?? new Map() : new Map();
  const fluxSeries = leadSr.get("flux") ?? [];
  const tmpSeries = leadSr.get("tmp") ?? [];
  const offset = Math.max(0, (seriesByCode.get(lead?.code ?? "")?.length ?? 0) - leadSeries.length);
  const cebAt = new Set(
    cebEvents.filter((e) => lead && e.skidCode === lead.code).map((e) => e.day.toISOString().slice(0, 13)),
  );
  const fmtT = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
  const trend: UfTrendPoint[] = leadSeries.map((p, i) => ({
    t: fmtT(p.ts),
    k: r(p.value, 1),
    tmp: r(tmpSeries[offset + i]?.value ?? 0, 2),
    flux: r(fluxSeries[offset + i]?.value ?? 0, 1),
    ceb: cebAt.has(p.ts.toISOString().slice(0, 13)),
  }));

  const last = cebEvents[0];
  const ceb: UfCeb = {
    nextSkidCode: lead?.code ?? null,
    hours: lead?.cebHours ?? null,
    trigger: lead?.cebHours != null ? "perm_threshold" : null,
    lastEvent: last
      ? {
          at: last.day.toISOString(),
          skidCode: last.skidCode,
          kBefore: r(last.kBefore, 1),
          kAfter: r(last.kAfter, 1),
          chemical: last.chemical,
        }
      : null,
    avgCycleH: avgCycleHours(cebEvents.filter((e) => lead && e.skidCode === lead.code).map((e) => e.day)),
  };

  return { skids, trend, ceb, thresholds: CEB_THRESHOLDS };
}
