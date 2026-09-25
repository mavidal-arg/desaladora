import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAlertChannelRules, setAlertChannelRule } from "@/lib/alert-channels";
import { CHANNELS, type Channel } from "@/lib/alert-notify";

const LEVELS = ["critico", "advertencia", "info"];

// GET /api/oee/alert-channels — las 3 filas de política severidad→canales.
export async function GET() {
  return NextResponse.json(await listAlertChannelRules());
}

// PATCH { level, channel, enabled } — togglea un canal para una severidad.
export async function PATCH(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: "No autenticado" }, { status: 401 }); }
  if (!can(user.role, "manage_alert_rules")) return NextResponse.json({ error: "Solo Supervisor/Planificador gestiona canales" }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b || !LEVELS.includes(b.level) || !CHANNELS.includes(b.channel) || typeof b.enabled !== "boolean")
    return NextResponse.json({ error: "Datos inválidos: level, channel, enabled" }, { status: 400 });

  const row = await setAlertChannelRule(b.level, b.channel as Channel, b.enabled, user.displayName ?? user.role);
  return NextResponse.json(row);
}
