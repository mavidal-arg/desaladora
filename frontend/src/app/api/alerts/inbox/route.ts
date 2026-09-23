import { NextResponse } from "next/server";
import { listInAppAlerts } from "@/lib/alert-inbox";

// GET /api/alerts/inbox → alertas del canal in-app para la burbuja del Shell.
// Sin auth, igual que /api/oee/alerts y /api/nonconformities/summary: es lectura
// y la app es una demo pública. Las acciones que salen de la burbuja (editar,
// tratar, reconocer) sí van por endpoints con permiso.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: await listInAppAlerts() });
}
