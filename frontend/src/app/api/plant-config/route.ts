import { NextResponse } from "next/server";
import { getPlantConfig, savePlantConfig } from "@/lib/plant-config-store";
import { requireAuth } from "@/lib/auth";
import type { PlantConfig } from "@/lib/plant-config";

// GET /api/plant-config → config de planta vigente (DB o default estático)
export async function GET() {
  const cfg = await getPlantConfig();
  return NextResponse.json(cfg);
}

// PUT /api/plant-config → reemplaza la config (motor de replicación). Solo Supervisor.
export async function PUT(req: Request) {
  try {
    await requireAuth("Supervisor", "Manager");
  } catch {
    return NextResponse.json({ error: "No autorizado (requiere Supervisor)" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as PlantConfig | null;
  if (!body || !body.plant || !Array.isArray(body.areas) || !Array.isArray(body.equipment)) {
    return NextResponse.json({ error: "Config inválida: faltan plant/areas/equipment" }, { status: 400 });
  }
  await savePlantConfig(body);
  return NextResponse.json({ ok: true, areas: body.areas.length, equipment: body.equipment.length });
}
