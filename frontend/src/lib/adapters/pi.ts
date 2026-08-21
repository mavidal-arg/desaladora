// pi.ts — AVEVA PI System adapter (asset hierarchy via PI AF, series via PI Web API).
// sim mode reads the cached Postgres mirror via Prisma.
import { prisma } from "@/lib/prisma";
import { getAssetHealth } from "@/lib/asset-health";
import {
  adapterMode,
  notWired,
  type AssetTreeNode,
  type Criticality,
  type AssetStatus,
  type SignalValue,
  type TrendPoint,
  type PredictiveProfile,
} from "./types";

export async function getAssetTree(): Promise<AssetTreeNode[]> {
  if (adapterMode() === "real") return notWired("pi", "getAssetTree");

  const [fls, equipment] = await Promise.all([
    prisma.functionalLocation.findMany({ orderBy: { code: "asc" } }),
    prisma.equipment.findMany({ orderBy: { code: "asc" } }),
  ]);

  const eqByFl = new Map<string, typeof equipment>();
  for (const e of equipment) {
    const key = e.functionalLocationId ?? "_orphan";
    (eqByFl.get(key) ?? eqByFl.set(key, []).get(key)!).push(e);
  }

  const childrenOf = (parentId: string | null): AssetTreeNode[] =>
    fls
      .filter((f) => f.parentId === parentId)
      .map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        kind: "functionalLocation" as const,
        criticality: f.criticality as Criticality,
        status: null,
        children: [
          ...childrenOf(f.id),
          ...(eqByFl.get(f.id) ?? []).map((e) => ({
            id: e.id,
            code: e.code,
            name: e.name,
            kind: "equipment" as const,
            criticality: e.criticality as Criticality,
            status: e.status as AssetStatus,
            children: [],
          })),
        ],
      }));

  return childrenOf(null);
}

export async function getCurrentValues(assetId: string): Promise<SignalValue[]> {
  if (adapterMode() === "real") return notWired("pi", "getCurrentValues");

  const signals = await prisma.piSignal.findMany({
    where: { equipmentId: assetId },
    include: { readings: { orderBy: { ts: "desc" }, take: 1 } },
    orderBy: { signal: "asc" },
  });

  return signals
    .filter((s) => s.readings.length > 0)
    .map((s) => {
      const r = s.readings[0];
      return {
        signal: s.signal,
        value: r.value,
        unit: s.unit,
        ts: r.ts.toISOString(),
        quality: r.quality as SignalValue["quality"],
      };
    });
}

export async function getTrend(
  assetId: string,
  signal: string,
  from: string,
  to: string
): Promise<TrendPoint[]> {
  if (adapterMode() === "real") return notWired("pi", "getTrend");

  const sig = await prisma.piSignal.findUnique({
    where: { equipmentId_signal: { equipmentId: assetId, signal } },
  });
  if (!sig) return [];

  const readings = await prisma.piReading.findMany({
    where: { signalId: sig.id, ts: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { ts: "asc" },
  });
  return readings.map((r) => ({ ts: r.ts.toISOString(), value: r.value }));
}

type PPRow = {
  equipmentId: string; configured: boolean; healthScore: number; trend: string;
  predFailureDays: number | null; anomalies: unknown;
  equipment: {
    code: string; name: string; category: string;
    // La ubicación funcional directa del equipo es el área (su `code` = areaCode: RO, UF, …).
    functionalLocation: { code: string } | null;
  };
};
/**
 * `health` viene de la fuente única (`lib/asset-health.ts`) y PISA el
 * `healthScore` sembrado. Sin esto, Predictivo mostraba para un rack RO un
 * número distinto al del Panel principal — y su propio tooltip ya prometía que
 * los racks se calculan del ensuciamiento, cosa que no hacía.
 */
function mapPredictive(p: PPRow, health?: Map<string, number>): PredictiveProfile {
  return {
    assetId: p.equipmentId, assetCode: p.equipment.code, assetName: p.equipment.name,
    configured: p.configured,
    healthScore: health?.get(p.equipment.code) ?? p.healthScore,
    trend: p.trend as PredictiveProfile["trend"], predFailureDays: p.predFailureDays,
    anomalies: (p.anomalies ?? []) as PredictiveProfile["anomalies"],
    category: p.equipment.category,
    areaCode: p.equipment.functionalLocation?.code ?? undefined,
  };
}

// Select compartido: campos mínimos + category/areaCode para el etiquetado de mantenimiento.
const predictiveEquipmentSelect = {
  code: true, name: true, category: true,
  functionalLocation: { select: { code: true } },
} as const;

export async function getPredictive(assetId: string): Promise<PredictiveProfile | null> {
  if (adapterMode() === "real") return notWired("pi", "getPredictive");
  const [p, health] = await Promise.all([
    prisma.predictiveProfile.findUnique({
      where: { equipmentId: assetId },
      include: { equipment: { select: predictiveEquipmentSelect } },
    }),
    getAssetHealth(),
  ]);
  return p ? mapPredictive(p as PPRow, health) : null;
}

export async function listPredictive(): Promise<PredictiveProfile[]> {
  if (adapterMode() === "real") return notWired("pi", "listPredictive");
  const [rows, health] = await Promise.all([
    prisma.predictiveProfile.findMany({
      include: { equipment: { select: predictiveEquipmentSelect } },
    }),
    getAssetHealth(),
  ]);
  // El orden sale de la salud RESUELTA, no de la columna: si ordenáramos por
  // `healthScore` en SQL, el ranking de "menor salud" contradiría los valores
  // que la propia tabla muestra.
  return rows
    .map((p) => mapPredictive(p as PPRow, health))
    .sort((a, b) => a.healthScore - b.healthScore);
}
