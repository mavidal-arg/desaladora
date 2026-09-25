import { prisma } from "@/lib/prisma";
import { getPlantConfig } from "@/lib/plant-config-store";
import { eqId, type SignalDef } from "@/lib/plant-config";
import { signalLabel, signalDesc } from "@/lib/signal-labels";
import { TWIN_SIGNALS } from "@/lib/twin-types";
import { simValueAt, severityOf, type LiveSeverity } from "@/lib/sim";

export { simValueAt, severityOf };

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA de valores de señal — el único lugar que decide "cuál es el valor
// actual de esta señal AHORA".
//
// Mismo patrón que `asset-health.ts` (fuente única de salud). Nació del hallazgo
// de que el mismo activo mostraba números distintos en el Gemelo Digital, en la
// ficha del activo y en la vista QR, porque cada vista simulaba su propio valor
// en el browser con `Math.random`.
//
// En modo `sim` (hoy) el valor sale de una función pura `simValueAt` que "respira"
// alrededor del último `PiReading` sembrado — determinista, sin `Math.random`, así
// que el server y cualquier cliente que la llamen con el mismo instante calculan
// el mismo número. `PiReading` sigue siendo la historia para las tendencias.
//
// Cuando exista un adapter `real` (TimescaleDB / MQTT de Tier0), sólo cambia la
// fuente del `center` acá adentro; el resto de la app no se entera.
// ─────────────────────────────────────────────────────────────────────────────

export type { LiveSeverity };

export type LiveSignal = {
  signal: string;
  label: string;
  desc?: string;
  unit: string;
  /** Valor canónico AHORA (simValueAt sobre `seedValue`). */
  value: number;
  /** Centro sembrado — el `PiReading` más reciente. Base de tendencia y contraste. */
  seedValue: number;
  /** Timestamp del `PiReading` base. */
  ts: string;
  min?: number;
  max?: number;
  /** `instrument` = señal de instrumento (sig_eq_*) · `virtual` = calculada del gemelo (eq_*). */
  kind: "instrument" | "virtual";
  severity: LiveSeverity;
};

/** Señales calculadas del gemelo (contrato C2). No están en plant-config. */
const VIRTUAL_KEYS = new Set(Object.keys(TWIN_SIGNALS));

/** Amplitud de "respiración" para las virtuales, como fracción del centro. */
const VIRTUAL_AMP_FRAC: Record<string, number> = {
  rf: 0.015, rfNorm: 0.012, sec: 0.02, tmp: 0.015, ndp: 0.02, piOsmotic: 0.008, beta: 0.01,
};

/** Redondeo sensato según la magnitud (rf ~6e13, β ~1, presión ~60…). */
function roundFor(v: number): number {
  const a = Math.abs(v);
  if (a >= 1e6) return Math.round(v / 1e10) * 1e10;
  if (a >= 100) return Math.round(v * 10) / 10;
  if (a >= 1) return Math.round(v * 100) / 100;
  return Math.round(v * 1000) / 1000;
}

type SigRow = {
  id: string;
  signal: string;
  unit: string;
  readings: { value: number; ts: Date }[];
};

/** Construye una `LiveSignal` a partir de la fila de `PiSignal` + su def de plant-config. */
function buildLiveSignal(s: SigRow, def: SignalDef | undefined, status: string, now: number): LiveSignal | null {
  if (s.readings.length === 0) return null;
  const r = s.readings[0];
  const center = r.value;
  const isVirtual = VIRTUAL_KEYS.has(s.signal) && !def;
  const amp = def?.amp ?? Math.abs(center) * (VIRTUAL_AMP_FRAC[s.signal] ?? 0.02);

  let value: number;
  if (status === "stopped" || status === "maintenance") value = def?.min ?? 0;
  else if (status === "idle") value = center * 0.5;
  else value = simValueAt(s.id, now, center, amp);
  value = roundFor(value);

  const lbl = signalLabel(s.signal);
  return {
    signal: s.signal,
    label: lbl !== s.signal ? lbl : def?.label ?? s.signal,
    desc: signalDesc(s.signal),
    unit: s.unit || def?.unit || "",
    value,
    seedValue: center,
    ts: r.ts.toISOString(),
    min: def?.min,
    max: def?.max,
    kind: isVirtual ? "virtual" : "instrument",
    severity: severityOf(value, def?.min, def?.max),
  };
}

function defsForCode(cfg: Awaited<ReturnType<typeof getPlantConfig>>, code: string): Map<string, SignalDef> {
  return new Map((cfg.equipment.find((e) => e.code === code)?.signals ?? []).map((s) => [s.signal, s]));
}

/**
 * Todas las señales del activo (instrumento + virtuales del gemelo) con su valor
 * canónico AHORA. Devuelve `[]` si el activo no existe o no tiene lecturas.
 */
export async function getLiveSignals(code: string, opts: { at?: number } = {}): Promise<LiveSignal[]> {
  const now = opts.at ?? Date.now();
  const id = eqId(code);
  const [eq, cfg] = await Promise.all([
    prisma.equipment.findUnique({ where: { id } }),
    getPlantConfig(),
  ]);
  if (!eq) return [];
  const defs = defsForCode(cfg, code);

  const signals = await prisma.piSignal.findMany({
    where: { equipmentId: id },
    include: { readings: { orderBy: { ts: "desc" }, take: 1 } },
    orderBy: { signal: "asc" },
  });

  const status = eq.status as string;
  return signals
    .map((s) => buildLiveSignal(s as SigRow, defs.get(s.signal), status, now))
    .filter((s): s is LiveSignal => s !== null);
}

/** Un único valor canónico. */
export async function getLiveValue(code: string, signal: string, opts: { at?: number } = {}): Promise<number | undefined> {
  const all = await getLiveSignals(code, opts);
  return all.find((s) => s.signal === signal)?.value;
}

/**
 * Valor primario "vivo" de TODA la flota, en una sola pasada a la DB (para el
 * poll del mímico). `{ code → { value, unit, label, pct } }`.
 */
export async function getPlantLivePrimary(opts: { at?: number } = {}): Promise<
  Record<string, { value: number; unit: string; label: string; pct: number }>
> {
  const now = opts.at ?? Date.now();
  const cfg = await getPlantConfig();
  const [equipment, signals] = await Promise.all([
    prisma.equipment.findMany({ select: { id: true, code: true, status: true } }),
    prisma.piSignal.findMany({ include: { readings: { orderBy: { ts: "desc" }, take: 1 } } }),
  ]);
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const primByCode = new Map(cfg.equipment.map((e) => [e.code, e.primarySignal]));
  const defByEqSig = new Map(
    cfg.equipment.map((e) => [eqId(e.code), new Map(e.signals.map((s) => [s.signal, s]))]),
  );

  // Agrupar señales por equipo.
  const byEq = new Map<string, SigRow[]>();
  for (const s of signals) {
    (byEq.get(s.equipmentId) ?? byEq.set(s.equipmentId, []).get(s.equipmentId)!).push(s as SigRow);
  }

  const out: Record<string, { value: number; unit: string; label: string; pct: number }> = {};
  for (const [eqIdKey, rows] of byEq) {
    const eq = eqById.get(eqIdKey);
    if (!eq) continue;
    const defs = defByEqSig.get(eqIdKey);
    const primName = primByCode.get(eq.code);
    const pickRow = rows.find((r) => r.signal === primName) ?? rows[0];
    const live = buildLiveSignal(pickRow, defs?.get(pickRow.signal), eq.status as string, now);
    if (!live) continue;
    const min = live.min ?? 0;
    const max = live.max ?? Math.abs(live.seedValue) * 1.4 + 1;
    const pct = max > min ? Math.max(0, Math.min(100, ((live.value - min) / (max - min)) * 100)) : 50;
    out[eq.code] = { value: live.value, unit: live.unit, label: live.label, pct };
  }
  return out;
}
