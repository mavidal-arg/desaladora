import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eqId } from "@/lib/plant-config";
import { TWIN_SIGNALS, type CalculatedPayload } from "@/lib/twin-types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/twin/ingest — cierra el lazo live del Gemelo Digital.
// Node-RED (Source Flow) publica el payload C1 calculado por twin_engine.py y lo
// POSTea acá. Persistimos según el contrato C2: PiSignal virtual + PiReading por
// rack, y recomputamos el rollup diario de ProductionLog promediando los racks.
//
// Auth server-to-server: si TWIN_INGEST_TOKEN está seteado, se exige
// `Authorization: Bearer <token>`; si no, endpoint abierto (demo). [inferencia]
// ─────────────────────────────────────────────────────────────────────────────

// C1 (snake_case) → C2 (camelCase). [cita] workflows/twin_digital.md · C2.
const C1_TO_C2: Record<string, keyof typeof TWIN_SIGNALS> = {
  R_f: "rf",
  Rf_norm: "rfNorm",
  SEC_kWh_m3: "sec",
  TMP_bar: "tmp",
  NDP_bar: "ndp",
  Delta_Pi_bar: "piOsmotic",
  beta: "beta",
};

// Códigos de los trenes RO (para el rollup promedio). [cita] plant-config.ts.
const RO_RACKS = ["A25-1", "A25-2", "A25-3"];

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function POST(req: NextRequest) {
  // ── Auth opcional por token ──
  const token = process.env.TWIN_INGEST_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: CalculatedPayload;
  try {
    payload = (await req.json()) as CalculatedPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const train = payload?.train_id;
  if (!train || typeof train !== "string") {
    return NextResponse.json({ error: "train_id requerido" }, { status: 400 });
  }
  const equipmentId = eqId(train); // A25-1 → eq_a251
  // El equipo debe existir (FK de PiSignal).
  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
  if (!eq) {
    return NextResponse.json({ error: `equipo ${train} (${equipmentId}) no existe` }, { status: 404 });
  }

  const ts = Number.isFinite(payload.ts) ? new Date(payload.ts) : new Date();
  const quality = payload.quality ?? "good";

  // ── Persistir cada señal virtual (C2): upsert PiSignal + insert PiReading ──
  const written: string[] = [];
  for (const [c1key, c2sig] of Object.entries(C1_TO_C2)) {
    const value = (payload as unknown as Record<string, number>)[c1key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const sigId = `${equipmentId}_${c2sig}`;
    await prisma.piSignal.upsert({
      where: { id: sigId },
      update: { unit: TWIN_SIGNALS[c2sig] },
      create: { id: sigId, equipmentId, signal: c2sig, unit: TWIN_SIGNALS[c2sig] },
    });
    // id determinista por minuto → idempotente ante reintentos del flow.
    const rid = `${sigId}_live_${Math.floor(ts.getTime() / 60000)}`;
    await prisma.piReading.upsert({
      where: { id: rid },
      update: { value, ts, quality },
      create: { id: rid, signalId: sigId, ts, value, quality },
    });
    written.push(c2sig);
  }

  // ── Recomputar el rollup diario de ProductionLog promediando los racks RO ──
  // Toma el último valor de rfNorm/sec/tmp de cada rack + el mínimo cip_days.
  const day = startOfDay(ts);
  const rollup = await recomputeRollup(day, train, payload.cip_days ?? null);

  return NextResponse.json({
    ok: true,
    train,
    signalsWritten: written,
    rollup,
  });
}

/** Promedia rfNorm/sec/tmp del último valor de cada rack RO y actualiza ProductionLog del día. */
async function recomputeRollup(day: Date, incomingTrain: string, incomingCipDays: number | null) {
  const latest: Record<string, { rfNorm?: number; sec?: number; tmp?: number }> = {};
  for (const code of RO_RACKS) {
    const id = eqId(code);
    for (const sig of ["rfNorm", "sec", "tmp"] as const) {
      const r = await prisma.piReading.findFirst({
        where: { signal: { equipmentId: id, signal: sig } },
        orderBy: { ts: "desc" },
        select: { value: true },
      });
      if (r) (latest[code] ??= {})[sig] = r.value;
    }
  }
  const vals = Object.values(latest);
  const avg = (k: "rfNorm" | "sec" | "tmp") => {
    const xs = vals.map((v) => v[k]).filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const rfAvg = avg("rfNorm");
  const secComputed = avg("sec");
  const tmpAvg = avg("tmp");

  // cipDays del día = mínimo entre el que llega y el ya persistido (tren más próximo al CIP).
  const existing = await prisma.productionLog.findFirst({ where: { day }, orderBy: { day: "desc" } });
  const cipDays =
    incomingCipDays == null
      ? existing?.cipDays ?? null
      : existing?.cipDays == null
        ? incomingCipDays
        : Math.min(existing.cipDays, incomingCipDays);

  if (existing) {
    await prisma.productionLog.update({
      where: { id: existing.id },
      data: {
        rfAvg: rfAvg ?? existing.rfAvg,
        secComputed: secComputed ?? existing.secComputed,
        tmpAvg: tmpAvg ?? existing.tmpAvg,
        cipDays,
      },
    });
  }
  return { day: day.toISOString().slice(0, 10), rfAvg, secComputed, tmpAvg, cipDays, incomingTrain };
}
