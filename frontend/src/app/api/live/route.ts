import { NextResponse } from "next/server";
import { getPlantLivePrimary } from "@/lib/live-signals";

export const dynamic = "force-dynamic";

// GET /api/live → valor primario "vivo" de toda la flota, en una pasada.
// Lo pollea el mímico (useSignalSim en modo fuente única). `{ code → LiveValue }`.
export async function GET() {
  const live = await getPlantLivePrimary();
  return NextResponse.json(live);
}
