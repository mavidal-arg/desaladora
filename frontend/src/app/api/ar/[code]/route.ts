import { NextResponse } from "next/server";
import { getAssetArView } from "@/lib/ar";

export const dynamic = "force-dynamic";

// GET /api/ar/[code] → vista de activo para AR (pública, solo-lectura).
// La usa ArAssetView para el poll "en vivo". Shape reducido y seguro.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const view = await getAssetArView(decodeURIComponent(code));
  if (!view) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
  return NextResponse.json(view);
}
