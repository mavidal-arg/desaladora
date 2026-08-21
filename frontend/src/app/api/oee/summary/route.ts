import { NextResponse } from "next/server";
import { getOeeSummary } from "@/lib/oee";

export const dynamic = "force-dynamic";

// GET /api/oee/summary → OEE por tren + planta + Pareto (para polling del cliente).
export async function GET() {
  const summary = await getOeeSummary();
  return NextResponse.json(summary);
}
