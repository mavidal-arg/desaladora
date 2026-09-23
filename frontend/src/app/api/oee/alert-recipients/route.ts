import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listAlertRecipients, createAlertRecipient, updateAlertRecipient, deactivateAlertRecipient,
  type SubscriptionPair,
} from "@/lib/alert-recipients";
import { OUTBOUND_CHANNELS } from "@/lib/alert-notify";

const LEVELS = ["critico", "advertencia", "info"];

function parseSubscriptions(raw: unknown): SubscriptionPair[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SubscriptionPair[] = [];
  for (const s of raw) {
    // OUTBOUND_CHANNELS y no CHANNELS: a `inapp` no se suscribe nadie, es un
    // broadcast. Aceptarlo acá crearía suscripciones que no significan nada.
    if (!s || !LEVELS.includes(s.level) || !OUTBOUND_CHANNELS.includes(s.channel)) return null;
    out.push({ level: s.level, channel: s.channel });
  }
  return out;
}

// GET /api/oee/alert-recipients
export async function GET() {
  return NextResponse.json(await listAlertRecipients());
}

// POST → crear destinatario + set inicial de subscripciones (manage_alert_rules)
export async function POST(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Solo Supervisor/Planificador gestiona destinatarios" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const subscriptions = parseSubscriptions(b?.subscriptions ?? []);
  if (!b?.name || subscriptions === null)
    return NextResponse.json({ error: "Datos inválidos: name, subscriptions[]" }, { status: 400 });

  const row = await createAlertRecipient({
    name: b.name, email: b.email || null, phoneWhatsapp: b.phoneWhatsapp || null, phoneVoice: b.phoneVoice || null,
    active: b.active ?? true, subscriptions, createdBy: user.displayName ?? user.role,
  });
  return NextResponse.json(row, { status: 201 });
}

// PATCH { id, name, email?, phoneWhatsapp?, phoneVoice?, active?, subscriptions[] } → edita destinatario
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const subscriptions = parseSubscriptions(b?.subscriptions ?? []);
  if (!b?.id || !b?.name || subscriptions === null)
    return NextResponse.json({ error: "Datos inválidos: id, name, subscriptions[]" }, { status: 400 });

  const row = await updateAlertRecipient(b.id, {
    name: b.name, email: b.email || null, phoneWhatsapp: b.phoneWhatsapp || null, phoneVoice: b.phoneVoice || null,
    active: b.active ?? true, subscriptions,
  });
  return NextResponse.json(row);
}

// DELETE ?id= → soft-delete (active=false)
export async function DELETE(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await deactivateAlertRecipient(id);
  return NextResponse.json({ ok: true });
}
