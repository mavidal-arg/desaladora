import { prisma } from "@/lib/prisma";
import { getPlantConfig } from "@/lib/plant-config-store";
import { eqId } from "@/lib/plant-config";
import {
  TWIN_THRESHOLDS,
  type TwinSummary,
  type TwinRackRow,
  type TwinMetrics,
  type TwinTrendPoint,
  type TwinIdealVsReal,
} from "@/lib/twin-types";

// ─────────────────────────────────────────────────────────────────────────────
// Proceso Desal — agregaciones server-side para el dashboard /proceso.
// KPIs de una desaladora por ósmosis inversa: recovery, energía específica,
// rechazo de sales, producción, calidad de producto, disponibilidad de trenes,
// y salud de las membranas (UF / RO) como activos.
// ─────────────────────────────────────────────────────────────────────────────

export type DesalSummary = {
  phase: number;
  kpis: {
    productionM3d: number;   // producción del día (m³/día)
    productionLs: number;    // equivalente en l/s
    recoveryPct: number;
    energyKwhM3: number;
    saltRejection: number;
    productTds: number;
    availability: number;
  };
  trend: { day: string; produccion: number; energia: number }[];
};

const r = (n: number, d = 1) => { const p = 10 ** d; return Math.round(n * p) / p; };

export async function getDesalSummary(): Promise<DesalSummary> {
  const [logs, cfg] = await Promise.all([
    prisma.productionLog.findMany({ orderBy: { day: "asc" } }),
    getPlantConfig(),
  ]);
  const last = logs[logs.length - 1];
  const phase = last?.phase ?? (cfg.flags?.phase as number) ?? 1;
  const prodM3d = last?.permeateM3 ?? 0;
  return {
    phase,
    kpis: {
      productionM3d: r(prodM3d, 0),
      productionLs: r((prodM3d / 86.4), 0),         // m³/día → l/s
      recoveryPct: r(last?.recoveryPct ?? 0),
      energyKwhM3: r(last?.energyKwhM3 ?? 0, 2),
      saltRejection: r(last?.saltRejection ?? 0, 2),
      productTds: r(last?.productTds ?? 0, 0),
      availability: r(last?.availability ?? 0),
    },
    trend: logs.slice(-14).map((l) => ({
      day: l.day.toISOString().slice(5, 10),
      produccion: r(l.permeateM3, 0),
      energia: r(l.energyKwhM3, 2),
    })),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// GEMELO DIGITAL (contrato C3) — lectura de las señales virtuales de los racks RO.
// ─────────────────────────────────────────────────────────────────────────────

export const RO_CODES = ["A25-1", "A25-2", "A25-3", "A25-4"] as const;

/** Lecturas de un rack agrupadas por nombre de señal, en orden ascendente por ts. */
export type RackReadings = Map<string, { ts: Date; value: number }[]>;

/** Carga PiReading (virtuales + crudas) de los racks RO, agrupadas por rack y señal. */
export async function loadRackReadings(): Promise<Map<string, RackReadings>> {
  const rackIds = RO_CODES.map((c) => eqId(c));
  const signals = await prisma.piSignal.findMany({
    where: { equipmentId: { in: rackIds } },
    include: { readings: { orderBy: { ts: "desc" }, take: 70 } },
  });
  const byRack = new Map<string, RackReadings>();
  for (const code of RO_CODES) byRack.set(code, new Map());
  const idToCode = new Map(RO_CODES.map((c) => [eqId(c), c]));
  for (const s of signals) {
    const code = idToCode.get(s.equipmentId);
    if (!code) continue;
    const asc = [...s.readings].reverse().map((r) => ({ ts: r.ts, value: r.value }));
    byRack.get(code)!.set(s.signal, asc);
  }
  return byRack;
}

export const latestOf = (rr: RackReadings, name: string): number | undefined =>
  rr.get(name)?.at(-1)?.value;

/** Estima días al próximo CIP: regresión de dRf/dt (post-último-lavado) vs umbral. */
function estimateCipDays(rfNormSeries: { value: number }[], rfBase: number): number | null {
  if (rfNormSeries.length < 2) return null;
  const vals = rfNormSeries.map((r) => r.value);
  // Recortar al tramo monótono creciente desde el último CIP (última caída fuerte).
  let start = 0;
  for (let i = vals.length - 1; i > 0; i--) {
    if (vals[i] < vals[i - 1] * 0.97) { start = i; break; } // caída ⇒ CIP
  }
  const seg = vals.slice(start);
  if (seg.length < 2) return null;
  const slope = (seg[seg.length - 1] - seg[0]) / (seg.length - 1); // por día
  const last = seg[seg.length - 1];
  const threshold = rfBase * (1 + TWIN_THRESHOLDS.rfRisePct / 100);
  if (slope <= 0) return null; // recién lavado / estable
  return Math.max(0, Math.round((threshold - last) / slope));
}

/** Salud compuesta 0-100 del rack a partir del ensuciamiento normalizado + rechazo + ΔP. */
export function foulHealthOf(foul: number, saltRejection: number | undefined, dpTmp: number | undefined): number {
  const foulPen = Math.min(Math.max((foul - 1) / (TWIN_THRESHOLDS.rfRisePct / 100), 0), 1.3) * 42;
  const rejPen = Math.min(Math.max(99.6 - (saltRejection ?? 99.4), 0), 2) * 8;
  const dpPen = Math.min(Math.max(((dpTmp ?? 1.8) - 1.8) / 1.0, 0), 1) * 10;
  return Math.round(Math.min(Math.max(100 - foulPen - rejPen - dpPen, 20), 100));
}


export async function getTwinSummary(): Promise<TwinSummary> {
  const [byRack, cfg, cipEvents, lastLog] = await Promise.all([
    loadRackReadings(),
    getPlantConfig(),
    prisma.cipEvent.findMany({ orderBy: { day: "desc" }, take: 1 }),
    prisma.productionLog.findFirst({ orderBy: { day: "desc" } }),
  ]);

  const racks: TwinRackRow[] = [];
  const cfgByCode = new Map(cfg.equipment.map((e) => [e.code, e]));

  for (const code of RO_CODES) {
    const rr = byRack.get(code)!;
    const rfNormSeries = rr.get("rfNorm") ?? [];
    const rfBase = rfNormSeries.length ? Math.min(...rfNormSeries.map((r) => r.value)) : 0;
    const metrics: TwinMetrics = {
      rf: latestOf(rr, "rf") ?? 0,
      rfNorm: latestOf(rr, "rfNorm") ?? 0,
      sec: latestOf(rr, "sec") ?? 0,
      tmp: latestOf(rr, "tmp") ?? 0,
      ndp: latestOf(rr, "ndp") ?? 0,
      piOsmotic: latestOf(rr, "piOsmotic") ?? 0,
      beta: latestOf(rr, "beta") ?? 0,
    };
    const foul = rfBase ? metrics.rfNorm / rfBase : 1;
    const cipDays = estimateCipDays(rfNormSeries, rfBase);
    const health = foulHealthOf(foul, latestOf(rr, "saltRejection"), latestOf(rr, "dpTmp"));
    const trend: TwinRackRow["trend"] =
      cipDays !== null && cipDays <= 7 ? "critical" : foul > 1.02 ? "rising" : "stable";
    racks.push({
      code,
      name: cfgByCode.get(code)?.name ?? code,
      status: cfgByCode.get(code)?.status ?? "running",
      health,
      metrics,
      rfBase,
      cipDays,
      trend,
    });
  }

  // Tren líder = el más próximo al CIP (menor RUL). Su serie alimenta el gráfico de tendencia.
  const leader = [...racks].sort((a, b) => (a.cipDays ?? 1e9) - (b.cipDays ?? 1e9))[0];
  const leaderRr = byRack.get(leader.code)!;
  const leaderRf = leaderRr.get("rfNorm") ?? [];
  const leaderRaw = leaderRr.get("rf") ?? [];
  const leaderSec = leaderRr.get("sec") ?? [];
  const leaderTmp = leaderRr.get("tmp") ?? [];
  const nPts = Math.min(45, leaderRf.length);
  const trend: TwinTrendPoint[] = [];
  const startIdx = leaderRf.length - nPts;
  for (let k = 0; k < nPts; k++) {
    const idx = startIdx + k;
    trend.push({
      day: leaderRf[idx].ts.toISOString().slice(5, 10),
      rf: leaderRaw[idx]?.value ?? leaderRf[idx].value,
      rfNorm: leaderRf[idx].value,
      sec: leaderSec[idx]?.value ?? 0,
      tmp: leaderTmp[idx]?.value ?? 0,
    });
  }

  // Ideal (membrana limpia, base de la serie) vs real medido del tren líder.
  const secIdeal = leaderSec.length ? Math.min(...leaderSec.map((r) => r.value)) : 0;
  const tmpIdeal = leaderTmp.length ? Math.min(...leaderTmp.map((r) => r.value)) : 0;
  const secReal = leader.metrics.sec;
  const tmpReal = leader.metrics.tmp;
  const recIdeal = (cfg.flags?.recoveryPct as number) ?? 45;
  const recReal = lastLog?.recoveryPct ?? recIdeal;
  const dev = (real: number, ideal: number) => (ideal ? Math.round(((real - ideal) / ideal) * 1000) / 10 : 0);
  const idealVsReal: TwinIdealVsReal[] = [
    { label: "SEC", unit: "kWh/m³", ideal: r(secIdeal, 2), real: r(secReal, 2), deviationPct: dev(secReal, secIdeal) },
    { label: "TMP", unit: "bar", ideal: r(tmpIdeal, 1), real: r(tmpReal, 1), deviationPct: dev(tmpReal, tmpIdeal) },
    { label: "Recovery", unit: "%", ideal: r(recIdeal, 1), real: r(recReal, 1), deviationPct: dev(recReal, recIdeal) },
  ];

  const last = cipEvents[0];
  return {
    racks,
    trend,
    idealVsReal,
    cip: {
      nextTrainCode: leader.code,
      days: leader.cipDays,
      trigger: leader.cipDays !== null ? "rf_threshold" : null,
      lastEvent: last
        ? { day: last.day.toISOString().slice(0, 10), trainCode: last.trainCode, rfBefore: last.rfBefore, rfAfter: last.rfAfter }
        : null,
    },
    thresholds: TWIN_THRESHOLDS,
  };
}
