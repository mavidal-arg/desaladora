import { NextResponse } from "next/server";
import { listRecentNotifications } from "@/lib/alert-notify";

// GET /api/twin/notifications — últimos envíos, para la tabla de estado de
// entrega por canal en /alertas. Sin filtro de permiso especial: es lectura,
// mismo criterio que GET /api/oee/alerts.
export async function GET() {
  return NextResponse.json(await listRecentNotifications());
}
