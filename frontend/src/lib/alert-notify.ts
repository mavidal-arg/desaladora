import { prisma } from "@/lib/prisma";
import type { AlertRuleRow } from "@/lib/oee";

// ─────────────────────────────────────────────────────────────────────────────
// Despacho saliente de alertas — puerto a TypeScript del patrón ya probado en
// icsh-assistant/agent/case_webhook_dispatcher.py: un POST a n8n con reintentos
// y backoff exponencial, con auditoría escrita SIEMPRE (incluso si falla o no
// hay webhook configurado) para que la falta de aviso sea visible.
//
// UN solo POST por AlertEvent, no uno por canal/destinatario: n8n hace el
// fan-out (wf-desal-alert-fanout.json), iterando sobre `recipients[channel]`.
// `delivered` acá significa "n8n aceptó el webhook", no "Twilio/SMTP confirmó
// que le llegó a cada destinatario" — no hay un canal de vuelta que lo
// confirme, misma limitación honesta del original en Python.
//
// El canal `inapp` es la excepción y no pasa por nada de eso: es un BROADCAST
// dentro de la app. No tiene destinatarios, no sale del proceso y no necesita
// credenciales de terceros — escribir la fila de AlertNotification ES la
// entrega, y la burbuja del Shell la levanta puliendo /api/alerts/inbox. Por
// eso es el único canal que funciona con la base recién creada.
// ─────────────────────────────────────────────────────────────────────────────

export type Channel = "inapp" | "email" | "whatsapp" | "voice";
export const CHANNELS: readonly Channel[] = ["inapp", "email", "whatsapp", "voice"];

/**
 * Canales que SALEN de la app y por lo tanto necesitan una dirección concreta
 * y n8n del otro lado. `inapp` queda afuera a propósito: nadie se suscribe a
 * él y no hay nada que enviar.
 */
export type OutboundChannel = Exclude<Channel, "inapp">;
export const OUTBOUND_CHANNELS: readonly OutboundChannel[] = ["email", "whatsapp", "voice"];

/** `recipient` de la fila in-app — no hay destinatario, la ve cualquiera. */
export const INAPP_BROADCAST = "*";
/** `recipient` cuando un canal saliente está prendido pero no tiene a nadie suscripto. */
const NO_RECIPIENTS = "(sin destinatarios)";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 800;

type EventForNotify = {
  id: string;
  ruleId: string;
  trainCode: string | null;
  level: string;
  message: string;
  ts: Date;
};

/** Qué canales están prendidos para cada severidad — configurable desde /alertas. */
export async function getChannelsForLevel(level: string): Promise<Channel[]> {
  const row = await prisma.alertChannelRule.findUnique({ where: { level } });
  if (!row) return [];
  return CHANNELS.filter((c) => row[c]);
}

type ContactPoint = { name: string; address: string };

/**
 * Destinatarios activos suscriptos a `level`, agrupados por canal — sólo entre
 * los `channels` habilitados por la política, y sólo si tienen el dato de
 * contacto de ese canal cargado.
 */
async function getRecipientsFor(
  level: string,
  channels: readonly OutboundChannel[],
): Promise<Record<OutboundChannel, ContactPoint[]>> {
  const result: Record<OutboundChannel, ContactPoint[]> = { email: [], whatsapp: [], voice: [] };
  if (channels.length === 0) return result;

  // Copia mutable: Prisma tipa el `in` como string[] y no acepta un readonly.
  const wanted = [...channels];
  const recipients = await prisma.alertRecipient.findMany({
    where: { active: true, subscriptions: { some: { level, channel: { in: wanted } } } },
    include: { subscriptions: { where: { level, channel: { in: wanted } } } },
  });

  for (const r of recipients) {
    const subscribedChannels = new Set(r.subscriptions.map((s) => s.channel));
    for (const c of channels) {
      if (!subscribedChannels.has(c)) continue;
      const address = c === "email" ? r.email : c === "whatsapp" ? r.phoneWhatsapp : r.phoneVoice;
      if (address) result[c].push({ name: r.name, address });
    }
  }
  return result;
}

function buildPayload(
  event: EventForNotify,
  rule: AlertRuleRow,
  recipients: Record<OutboundChannel, ContactPoint[]>,
  channels: Channel[],
) {
  return {
    alert_id: event.id,
    rule_id: rule.id,
    rule_name: rule.name,
    metric: rule.metric,
    level: event.level,
    train_code: event.trainCode,
    message: event.message,
    threshold: rule.threshold,
    op: rule.op,
    ts: event.ts.toISOString(),
    channels,
    recipients: {
      email: recipients.email.map((r) => ({ name: r.name, address: r.address })),
      whatsapp: recipients.whatsapp.map((r) => ({ name: r.name, address: r.address })),
      voice: recipients.voice.map((r) => ({ name: r.name, address: r.address })),
    },
    schema_version: "2.0",
  };
}

async function postWithRetry(
  url: string,
  payload: unknown,
  opts: { authHeader?: string | null; timeoutMs?: number; maxAttempts?: number; backoffBaseMs?: number },
): Promise<{ attempts: number; status: number | null; error: string | null }> {
  const {
    authHeader,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
  } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;

  let lastError: string | null = null;
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal,
      });
      lastStatus = res.status;
      if (res.ok) return { attempts: attempt, status: lastStatus, error: null };
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (e) {
      lastError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffBaseMs * 2 ** (attempt - 1)));
    }
  }
  return { attempts: maxAttempts, status: lastStatus, error: lastError };
}

export type AlertNotificationRow = {
  id: string;
  alertEventId: string;
  channel: string;
  recipient: string;
  delivered: boolean;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

/** Últimos envíos, para la tabla de estado de entrega por canal en /alertas. */
export async function listRecentNotifications(take = 60): Promise<AlertNotificationRow[]> {
  const rows = await prisma.alertNotification.findMany({ orderBy: { createdAt: "desc" }, take });
  return rows.map((n) => ({
    id: n.id,
    alertEventId: n.alertEventId,
    channel: n.channel,
    recipient: n.recipient,
    delivered: n.delivered,
    attempts: n.attempts,
    lastError: n.lastError,
    createdAt: n.createdAt.toISOString(),
    deliveredAt: n.deliveredAt?.toISOString() ?? null,
  }));
}

/**
 * Despacha un `AlertEvent` recién creado y deja la auditoría en
 * `AlertNotification` — una fila por (canal, destinatario) que debía recibirla,
 * sea cual sea el resultado.
 *
 * Tres caminos distintos, a propósito:
 *
 *   · `inapp`  → la fila ES la entrega (`delivered: true`). No hay POST, no hay
 *                destinatarios: la levanta la burbuja del Shell. Funciona sin
 *                configurar absolutamente nada.
 *   · salientes con destinatarios → un POST a n8n, y una fila por dirección.
 *   · salientes SIN destinatarios → igual se escribe una fila, con el motivo en
 *                `lastError`. Antes esto era un `return` temprano y el silencio
 *                no quedaba registrado en ningún lado, justo lo contrario de lo
 *                que promete el comentario de `AlertNotification` en el schema.
 *                Ese era el estado real de las dos desaladoras: canales
 *                prendidos, cero destinatarios, cero filas de auditoría.
 *
 * Si `ALERT_WEBHOOK_URL` no está configurada, degrada con gracia: las filas
 * salientes quedan `delivered=false` con el motivo, así toda la UI se puede
 * ensayar sin gastar un envío real.
 */
export async function notifyAlertEvent(event: EventForNotify, rule: AlertRuleRow): Promise<void> {
  const channels = await getChannelsForLevel(event.level);
  if (channels.length === 0) return; // ninguna política severidad→canal prendida

  const outbound = OUTBOUND_CHANNELS.filter((c) => channels.includes(c));
  const recipients = await getRecipientsFor(event.level, outbound);
  const hasRecipients = outbound.some((c) => recipients[c].length > 0);

  const payload = buildPayload(event, rule, recipients, channels);
  const url = (process.env.ALERT_WEBHOOK_URL || "").trim();
  const authHeader = (process.env.ALERT_WEBHOOK_AUTH_HEADER || "").trim() || null;

  let delivered = false;
  let attempts = 0;
  let error: string | null = url ? null : "ALERT_WEBHOOK_URL not configured";
  let status: number | null = null;

  // Sólo se gasta el POST si hay al menos una dirección real del otro lado.
  if (url && hasRecipients) {
    const res = await postWithRetry(url, payload, { authHeader });
    attempts = res.attempts;
    status = res.status;
    error = res.error;
    delivered = error === null && status !== null && status >= 200 && status < 300;
  }

  type AuditRow = {
    channel: Channel;
    recipient: string;
    delivered: boolean;
    attempts: number;
    lastError: string | null;
    responseStatus: number | null;
  };
  const rows: AuditRow[] = [];

  if (channels.includes("inapp")) {
    rows.push({
      channel: "inapp",
      recipient: INAPP_BROADCAST,
      delivered: true,
      attempts: 0,
      lastError: null,
      responseStatus: null,
    });
  }

  for (const c of outbound) {
    const list = recipients[c];
    if (list.length === 0) {
      rows.push({
        channel: c,
        recipient: NO_RECIPIENTS,
        delivered: false,
        attempts: 0,
        lastError: "canal habilitado sin destinatarios suscriptos",
        responseStatus: null,
      });
      continue;
    }
    for (const r of list) {
      rows.push({ channel: c, recipient: r.address, delivered, attempts, lastError: error, responseStatus: status });
    }
  }

  if (rows.length === 0) return;

  await prisma.$transaction([
    prisma.alertEvent.update({ where: { id: event.id }, data: { notifiedAt: new Date() } }),
    ...rows.map((row) =>
      prisma.alertNotification.create({
        data: {
          alertEventId: event.id,
          channel: row.channel,
          recipient: row.recipient,
          payload,
          delivered: row.delivered,
          attempts: row.attempts,
          lastError: row.lastError,
          responseStatus: row.responseStatus,
          deliveredAt: row.delivered ? new Date() : null,
        },
      }),
    ),
  ]);
}
