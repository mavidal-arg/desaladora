import { NextResponse } from "next/server";
import { getFindingSummary } from "@/lib/finding-treatment";

// GET /api/nonconformities/summary → agregados livianos (severidad × estado)
// para el banner global y las cards de /hallazgos. Pensado para poll frecuente
// desde cualquier pantalla — no trae las filas, sólo conteos.
export async function GET() {
  return NextResponse.json(await getFindingSummary());
}
