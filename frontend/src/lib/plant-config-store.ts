import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { PLANT, type PlantConfig } from "@/lib/plant-config";

// ─────────────────────────────────────────────────────────────────────────────
// Store server-side de la config de planta (singleton en DB).
// El mímico/áreas leen de acá; si no hay fila, cae al PLANT estático (default).
// Editar vía Admin CRUD persiste acá y se refleja en toda la app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Completa lo que la fila guardada no tenga.
 *
 * Por qué existe: la fila que ya está en producción se guardó ANTES de que
 * existiera el bloque `app`, así que leerla cruda deja `cfg.app` en undefined y
 * revienta cualquier consumidor de la identidad. La alternativa —subir
 * `PLANT.version` para que el seed re-siembre— es justamente la que NO se puede
 * usar: el seed corre en cada arranque y le pisaría al cliente su identidad.
 */
export function normalizar(raw: Partial<PlantConfig> | null | undefined): PlantConfig {
  const c = (raw ?? {}) as Partial<PlantConfig>;
  return {
    ...PLANT,
    ...c,
    app: { ...PLANT.app, ...(c.app ?? {}) },
    branding: { ...PLANT.branding, ...(c.branding ?? {}) },
    flags: { ...PLANT.flags, ...(c.flags ?? {}) },
    plant: { ...PLANT.plant, ...(c.plant ?? {}) },
    bands: c.bands ?? PLANT.bands,
    areas: c.areas ?? PLANT.areas,
    equipment: c.equipment ?? PLANT.equipment,
  };
}

// `cache` deduplica la lectura dentro de un mismo request: el layout raíz y
// `generateMetadata` la piden por separado y no hace falta ir dos veces a la DB.
export const getPlantConfig = cache(async (): Promise<PlantConfig> => {
  try {
    const row = await prisma.plantConfig.findUnique({ where: { id: "singleton" } });
    if (row?.data) return normalizar(row.data as unknown as Partial<PlantConfig>);
  } catch {
    // DB no disponible en build/prerender → default estático
  }
  return PLANT;
});

export async function savePlantConfig(data: PlantConfig): Promise<void> {
  // Se normaliza también al guardar: un PUT viejo (sin `app`) no debe borrar la
  // identidad que ya tenía el cliente.
  const completa = normalizar(data);
  await prisma.plantConfig.upsert({
    where: { id: "singleton" },
    update: { data: completa as unknown as object },
    create: { id: "singleton", data: completa as unknown as object },
  });
}
