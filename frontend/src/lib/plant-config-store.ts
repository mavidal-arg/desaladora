import { prisma } from "@/lib/prisma";
import { PLANT, type PlantConfig } from "@/lib/plant-config";

// ─────────────────────────────────────────────────────────────────────────────
// Store server-side de la config de planta (singleton en DB).
// El mímico/áreas leen de acá; si no hay fila, cae al PLANT estático (default).
// Editar vía Admin CRUD persiste acá y se refleja en toda la app.
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlantConfig(): Promise<PlantConfig> {
  try {
    const row = await prisma.plantConfig.findUnique({ where: { id: "singleton" } });
    if (row?.data) return row.data as unknown as PlantConfig;
  } catch {
    // DB no disponible en build/prerender → default estático
  }
  return PLANT;
}

export async function savePlantConfig(data: PlantConfig): Promise<void> {
  await prisma.plantConfig.upsert({
    where: { id: "singleton" },
    update: { data: data as unknown as object },
    create: { id: "singleton", data: data as unknown as object },
  });
}
