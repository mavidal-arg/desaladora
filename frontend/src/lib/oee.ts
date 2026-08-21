import { prisma } from "@/lib/prisma";
import { eqId } from "@/lib/plant-config";
import {
  RO_TRAINS,
  RO_NOMINAL_M3H,
  DOWNTIME_CAUSE_LABELS,
  type DowntimeCause,
  type OeeSummary,
  type OeeThresholds,
  type TrainOee,
  type ParetoCause,
} from "@/lib/oee-types";

// ─────────────────────────────────────────────────────────────────────────────
// Motor OEE — agregaciones server-side para el módulo /oee.
// OEE = Disponibilidad × Rendimiento × Calidad, por tren RO (rack A25-x).
//   · Disponibilidad ← DowntimeEvent (paradas no planificadas / tiempo planificado)
//   · Rendimiento    ← señales del rack (recovery, ΔP fouling) vs capacidad nominal
//   · Calidad        ← QualityReading (fracción de permeado conforme a spec)
// Se apoya en datos reales sembrados; ningún pilar se inventa en el request.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_DAYS = 14;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const r = (n: number, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; };

const DEFAULT_THRESHOLDS: OeeThresholds = { target: 85, acceptable: 75, critical: 60 };

/** Último valor de una señal (por code de equipo + nombre de señal). */
async function latestSignals(signal: string): Promise<Map<string, number>> {
  const ids = RO_TRAINS.map((c) => eqId(c));
  const sigs = await prisma.piSignal.findMany({
    where: { equipmentId: { in: ids }, signal },
    include: { readings: { orderBy: { ts: "desc" }, take: 1 } },
  });
  const idToCode = new Map(RO_TRAINS.map((c) => [eqId(c), c as string]));
  const out = new Map<string, number>();
  for (const s of sigs) {
    const code = idToCode.get(s.equipmentId);
    const v = s.readings[0]?.value;
    if (code && v !== undefined) out.set(code, v);
  }
  return out;
}

export async function getOeeSummary(): Promise<OeeSummary> {
  const [allDowntime, allQuality, dayShift, activeAlerts, lastLog, racks, recovery, dpTmp] =
    await Promise.all([
      prisma.downtimeEvent.findMany({ orderBy: { startTime: "desc" }, take: 300 }),
      prisma.qualityReading.findMany({ orderBy: { ts: "desc" }, take: 300 }),
      prisma.shiftDef.findFirst({ orderBy: { startHour: "asc" } }),
      prisma.alertEvent.count({ where: { status: "activa" } }),
      prisma.productionLog.findFirst({ orderBy: { day: "desc" } }),
      prisma.equipment.findMany({ where: { code: { in: [...RO_TRAINS] } } }),
      latestSignals("recovery"),
      latestSignals("dpTmp"),
    ]);

  // El "presente" de la demo es la fecha del último ProductionLog (timeline
  // congelado del seed), no el reloj real — así la ventana cubre los datos.
  const to = lastLog?.day ?? new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 86400_000);
  const downtime = allDowntime.filter((d) => d.startTime >= from && d.startTime <= to);
  const quality = allQuality.filter((q) => q.ts >= from && q.ts <= to);

  const thresholds: OeeThresholds = dayShift
    ? { target: dayShift.oeeTarget, acceptable: dayShift.oeeAcceptable, critical: dayShift.oeeCritical }
    : DEFAULT_THRESHOLDS;

  const cfgByCode = new Map(racks.map((e) => [e.code, e]));
  const planMinWindow = WINDOW_DAYS * 24 * 60;

  const trains: TrainOee[] = RO_TRAINS.map((code) => {
    const dt = downtime.filter((d) => d.trainCode === code);
    const unplanned = dt.filter((d) => d.type === "no_planificada")
      .reduce((s, d) => s + (d.durationMin ?? 0), 0);
    const planned = dt.filter((d) => d.type === "planificada")
      .reduce((s, d) => s + (d.durationMin ?? 0), 0);
    const plannedTime = Math.max(planMinWindow - planned, 1);
    const availability = clamp(((plannedTime - unplanned) / plannedTime) * 100, 0, 100);

    // Rendimiento desde las señales del rack: recovery alto y ΔP bajo (menos
    // fouling) ⇒ más caudal frente a la nominal. [inferencia] fórmula demo.
    const rec = recovery.get(code) ?? 45;
    const dp = dpTmp.get(code) ?? 1.8;
    const performance = clamp(100 * (rec / 46) * (1.8 / Math.max(dp, 1.8)), 40, 100);
    const actualM3h = r(RO_NOMINAL_M3H * (performance / 100));

    const qr = quality.filter((q) => q.trainCode === code);
    const conforme = qr.filter((q) => q.status === "conforme").length;
    const quality_ = qr.length ? (conforme / qr.length) * 100 : 97;

    const eq = cfgByCode.get(code);
    const status = eq?.status ?? "running";
    // Un tren detenido/en mantenimiento no aporta rendimiento efectivo.
    const perfEff = status === "running" || status === "idle" ? performance : 0;
    const oee = (availability * perfEff * quality_) / 10000;

    return {
      code,
      name: eq?.name ?? code,
      status,
      oee: r(oee),
      availability: r(availability),
      performance: r(perfEff),
      quality: r(quality_),
      nominalM3h: RO_NOMINAL_M3H,
      actualM3h: status === "running" ? actualM3h : 0,
      downtimeMin: unplanned,
      qualityConforme: conforme,
      qualityTotal: qr.length,
    };
  });

  const avg = (sel: (t: TrainOee) => number) =>
    trains.length ? trains.reduce((s, t) => s + sel(t), 0) / trains.length : 0;
  const pA = avg((t) => t.availability);
  const pP = avg((t) => t.performance);
  const pQ = avg((t) => t.quality);

  // Pareto de paradas por causa raíz (todos los minutos de downtime).
  const byCause = new Map<DowntimeCause, number>();
  for (const d of downtime) {
    const c = d.cause as DowntimeCause;
    byCause.set(c, (byCause.get(c) ?? 0) + (d.durationMin ?? 0));
  }
  const totalMin = [...byCause.values()].reduce((s, m) => s + m, 0);
  let cum = 0;
  const paretoCauses: ParetoCause[] = [...byCause.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cause, minutes]) => {
      const pct = totalMin ? (minutes / totalMin) * 100 : 0;
      cum += pct;
      return { cause, label: DOWNTIME_CAUSE_LABELS[cause], minutes, pct: r(pct), cumPct: r(cum) };
    });

  return {
    window: { days: WINDOW_DAYS, from: from.toISOString(), to: to.toISOString() },
    plant: {
      oee: r((pA * pP * pQ) / 10000),
      availability: r(pA),
      performance: r(pP),
      quality: r(pQ),
      trainsOnline: racks.filter((e) => e.status === "running").length,
      trainsTotal: RO_TRAINS.length,
      totalDowntimeMin: trains.reduce((s, t) => s + t.downtimeMin, 0),
      totalProductionM3d: r(lastLog?.permeateM3 ?? 0),
    },
    trains,
    paretoCauses,
    pillarLoss: {
      availability: r(100 - pA),
      performance: r(100 - pP),
      quality: r(100 - pQ),
    },
    activeAlerts,
    thresholds,
  };
}

// ── Detalle de proceso por tren RO (para /oee/tren/[code]) ───────────────────
export type TrainProcess = {
  recovery: number;             // % de recuperación (permeado/alimentación)
  dpTmp: number;                // ΔP transmembrana (bar) — proxy de ensuciamiento
  feedPressureBar: number;      // presión de alimentación (bar)
  permeateConductivity: number | null;
  permeateTds: number | null;
  permeatePh: number | null;
  permeateBoron: number | null;
};

/** Parámetros de proceso del tren: recovery/ΔP desde señales + última calidad del permeado. */
export async function getTrainProcess(code: string): Promise<TrainProcess> {
  const [rec, dp, q] = await Promise.all([
    latestSignals("recovery"),
    latestSignals("dpTmp"),
    prisma.qualityReading.findFirst({ where: { trainCode: code }, orderBy: { ts: "desc" } }),
  ]);
  const recovery = rec.get(code) ?? 45;
  const dpTmp = dp.get(code) ?? 1.8;
  // Presión de alimentación ≈ base SWRO + aporte por ΔP/ensuciamiento. [inferencia] demo.
  const feedPressureBar = r(56 + dpTmp * 2.2, 1);
  return {
    recovery: r(recovery, 1),
    dpTmp: r(dpTmp, 2),
    feedPressureBar,
    permeateConductivity: q?.conductivity ?? null,
    permeateTds: q?.tds ?? null,
    permeatePh: q?.ph ?? null,
    permeateBoron: q?.boron ?? null,
  };
}

// ── Fetchers serializables para las pestañas del módulo ──────────────────────

export type DowntimeRow = {
  id: string; trainCode: string; type: string; cause: string;
  startTime: string; endTime: string | null; durationMin: number | null;
  description: string; validated: boolean; validatedBy: string | null;
  createdBy: string; shiftId: string | null;
};
export type QualityRow = {
  id: string; trainCode: string; ts: string; conductivity: number; tds: number;
  ph: number; boron: number; status: string; notes: string; createdBy: string; shiftId: string | null;
};
export type ShiftRow = {
  id: string; name: string; startHour: number; endHour: number; targetM3h: number;
  oeeTarget: number; oeeAcceptable: number; oeeCritical: number;
};
export type AlertRow = {
  id: string; ruleId: string; trainCode: string | null; level: string; status: string;
  message: string; ts: string; ackBy: string | null; ackAt: string | null;
  resolvedAt: string | null; actionTaken: string | null;
};
export type AlertRuleRow = {
  id: string; name: string; metric: string; op: string; threshold: number;
  level: string; enabled: boolean; trainCode: string | null;
};

export async function listDowntime(): Promise<DowntimeRow[]> {
  const rows = await prisma.downtimeEvent.findMany({ orderBy: { startTime: "desc" }, take: 100 });
  return rows.map((d) => ({
    id: d.id, trainCode: d.trainCode, type: d.type, cause: d.cause,
    startTime: d.startTime.toISOString(), endTime: d.endTime?.toISOString() ?? null,
    durationMin: d.durationMin, description: d.description, validated: d.validated,
    validatedBy: d.validatedBy, createdBy: d.createdBy, shiftId: d.shiftId,
  }));
}
export async function listQuality(): Promise<QualityRow[]> {
  const rows = await prisma.qualityReading.findMany({ orderBy: { ts: "desc" }, take: 100 });
  return rows.map((q) => ({
    id: q.id, trainCode: q.trainCode, ts: q.ts.toISOString(), conductivity: q.conductivity,
    tds: q.tds, ph: q.ph, boron: q.boron, status: q.status, notes: q.notes,
    createdBy: q.createdBy, shiftId: q.shiftId,
  }));
}
export async function listShifts(): Promise<ShiftRow[]> {
  const rows = await prisma.shiftDef.findMany({ orderBy: { startHour: "asc" } });
  return rows.map((s) => ({
    id: s.id, name: s.name, startHour: s.startHour, endHour: s.endHour, targetM3h: s.targetM3h,
    oeeTarget: s.oeeTarget, oeeAcceptable: s.oeeAcceptable, oeeCritical: s.oeeCritical,
  }));
}
export async function listAlerts(): Promise<AlertRow[]> {
  const rows = await prisma.alertEvent.findMany({ orderBy: { ts: "desc" }, take: 100 });
  return rows.map((a) => ({
    id: a.id, ruleId: a.ruleId, trainCode: a.trainCode, level: a.level, status: a.status,
    message: a.message, ts: a.ts.toISOString(), ackBy: a.ackBy,
    ackAt: a.ackAt?.toISOString() ?? null, resolvedAt: a.resolvedAt?.toISOString() ?? null,
    actionTaken: a.actionTaken,
  }));
}
export async function listAlertRules(): Promise<AlertRuleRow[]> {
  const rows = await prisma.alertRule.findMany({ orderBy: { name: "asc" } });
  return rows.map((a) => ({
    id: a.id, name: a.name, metric: a.metric, op: a.op, threshold: a.threshold,
    level: a.level, enabled: a.enabled, trainCode: a.trainCode,
  }));
}
