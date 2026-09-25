import { prisma } from "@/lib/prisma";
import { getOeeSummary, listAlertRules, type AlertRow, type AlertRuleRow } from "@/lib/oee";
import { getTwinSummary } from "@/lib/desal";
import { getUfSummary } from "@/lib/uf";
import { ALERT_METRIC_LABELS, RO_TRAINS } from "@/lib/oee-types";
import { notifyAlertEvent } from "@/lib/alert-notify";

// ─────────────────────────────────────────────────────────────────────────────
// Motor de alertas — evalúa AlertRule contra el estado ACTUAL de la planta y
// crea AlertEvent cuando cruza el umbral.
//
// Disparado por request (botón del presentador + poll liviano de /alertas),
// NO por un loop de background: el RUL de CIP/CEB se calcula por regresión
// sobre lecturas DIARIAS (getTwinSummary/getUfSummary) y no cruza un umbral
// solo en los minutos de una demo. Lo que garantiza que la alerta dispare
// frente al cliente es un botón determinístico con un valor de `override`,
// no esperar a que el reloj lo haga solo.
// ─────────────────────────────────────────────────────────────────────────────

export type MetricPoint = { metric: string; trainCode: string | null; value: number };
export type Breach = { rule: AlertRuleRow; trainCode: string | null; value: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Último QualityReading por tren RO — mismo criterio que `getTrainProcess` en oee.ts. */
async function latestQualityByTrain(): Promise<Map<string, { conductivity: number; tds: number; ph: number; boron: number }>> {
  const rows = await Promise.all(
    RO_TRAINS.map((code) =>
      prisma.qualityReading.findFirst({ where: { trainCode: code }, orderBy: { ts: "desc" } }),
    ),
  );
  const out = new Map<string, { conductivity: number; tds: number; ph: number; boron: number }>();
  RO_TRAINS.forEach((code, i) => {
    const q = rows[i];
    if (q) out.set(code, { conductivity: q.conductivity, tds: q.tds, ph: q.ph, boron: q.boron });
  });
  return out;
}

/** Duración (minutos) de la parada EN CURSO por tren, si hay alguna. */
async function ongoingDowntimeMinutes(): Promise<Map<string, number>> {
  const rows = await prisma.downtimeEvent.findMany({ where: { endTime: null } });
  const now = Date.now();
  const out = new Map<string, number>();
  for (const d of rows) out.set(d.trainCode, (now - d.startTime.getTime()) / 60000);
  return out;
}

/**
 * Arma el estado actual de la planta como una lista plana de puntos
 * (métrica, tren, valor), reusando las agregaciones que ya existen —
 * no se duplica ningún cálculo acá.
 *
 * `override` reemplaza (o agrega, si no existía) un punto puntual — es lo
 * que usa el botón de demo para garantizar un cruce de umbral determinístico.
 */
export async function buildMetricSnapshot(override?: MetricPoint): Promise<MetricPoint[]> {
  const [oee, twin, uf, quality, downtime] = await Promise.all([
    getOeeSummary(),
    getTwinSummary(),
    getUfSummary(),
    latestQualityByTrain(),
    ongoingDowntimeMinutes(),
  ]);

  const points: MetricPoint[] = [];
  for (const t of oee.trains) {
    points.push({ metric: "oee", trainCode: t.code, value: t.oee });
    points.push({ metric: "availability", trainCode: t.code, value: t.availability });
    points.push({ metric: "performance", trainCode: t.code, value: t.performance });
    points.push({ metric: "quality", trainCode: t.code, value: t.quality });
    const q = quality.get(t.code);
    if (q) {
      points.push({ metric: "conductivity", trainCode: t.code, value: q.conductivity });
      points.push({ metric: "tds", trainCode: t.code, value: q.tds });
      points.push({ metric: "ph", trainCode: t.code, value: q.ph });
      points.push({ metric: "boron", trainCode: t.code, value: q.boron });
    }
    const dt = downtime.get(t.code);
    if (dt != null) points.push({ metric: "downtime", trainCode: t.code, value: dt });
  }
  for (const rack of twin.racks) {
    if (rack.cipDays != null) points.push({ metric: "cip_days", trainCode: rack.code, value: rack.cipDays });
  }
  for (const skid of uf.skids) {
    if (skid.cebHours != null) points.push({ metric: "ceb_hours", trainCode: skid.code, value: skid.cebHours });
  }

  if (override) {
    const i = points.findIndex((p) => p.metric === override.metric && p.trainCode === override.trainCode);
    if (i >= 0) points[i] = override; else points.push(override);
  }
  return points;
}

/** Función pura, sin I/O — compara cada regla habilitada contra el snapshot. */
export function evaluateRules(snapshot: MetricPoint[], rules: AlertRuleRow[]): Breach[] {
  const breaches: Breach[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matches = snapshot.filter(
      (p) => p.metric === rule.metric && (rule.trainCode == null || p.trainCode === rule.trainCode),
    );
    for (const m of matches) {
      const hit = rule.op === "lt" ? m.value < rule.threshold : m.value > rule.threshold;
      if (hit) breaches.push({ rule, trainCode: m.trainCode, value: m.value });
    }
  }
  return breaches;
}

function buildMessage(b: Breach): string {
  const where = b.trainCode ? `tren ${b.trainCode}` : "planta";
  if (b.rule.metric === "cip_days") return `${b.rule.name}: ${where} · RUL ${Math.round(b.value)} días (umbral ${b.rule.threshold})`;
  if (b.rule.metric === "ceb_hours") return `${b.rule.name}: ${where} · RUL ${Math.round(b.value)} horas (umbral ${b.rule.threshold})`;
  const label = ALERT_METRIC_LABELS[b.rule.metric] ?? b.rule.metric;
  const rel = b.rule.op === "lt" ? "bajo" : "sobre";
  return `${label} ${r2(b.value)} en ${where} — ${rel} umbral (${b.rule.threshold})`;
}

function toAlertRow(a: {
  id: string; ruleId: string; trainCode: string | null; level: string; status: string;
  message: string; ts: Date; ackBy: string | null; ackAt: Date | null;
  resolvedAt: Date | null; actionTaken: string | null;
}): AlertRow {
  return {
    id: a.id, ruleId: a.ruleId, trainCode: a.trainCode, level: a.level, status: a.status,
    message: a.message, ts: a.ts.toISOString(), ackBy: a.ackBy,
    ackAt: a.ackAt?.toISOString() ?? null, resolvedAt: a.resolvedAt?.toISOString() ?? null,
    actionTaken: a.actionTaken,
  };
}

/**
 * Evalúa todas las reglas y crea+despacha los breaches nuevos.
 *
 * Dedupea contra cualquier `AlertEvent` ya `activa` de la misma regla+tren —
 * sin esto, un poll cada ~8s con la alerta todavía sin reconocer volvería a
 * mandar WhatsApp/llamada cada vez que corre.
 */
export async function evaluateAndDispatch(opts?: { override?: MetricPoint }): Promise<{ created: AlertRow[] }> {
  const [snapshot, rules] = await Promise.all([
    buildMetricSnapshot(opts?.override),
    listAlertRules(),
  ]);
  const breaches = evaluateRules(snapshot, rules);

  const created: AlertRow[] = [];
  for (const b of breaches) {
    const existing = await prisma.alertEvent.findFirst({
      where: { ruleId: b.rule.id, trainCode: b.trainCode, status: "activa" },
    });
    if (existing) continue;

    const row = await prisma.alertEvent.create({
      data: {
        ruleId: b.rule.id, trainCode: b.trainCode, level: b.rule.level,
        message: buildMessage(b),
      },
    });
    await notifyAlertEvent(row, b.rule);
    created.push(toAlertRow(row));
  }
  return { created };
}
