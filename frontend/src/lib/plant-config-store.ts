import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { PLANT, normalizar, type PlantConfig } from "@/lib/plant-config";

// Se re-exporta para no romper a quien ya la importaba desde acá.
export { normalizar };

// ─────────────────────────────────────────────────────────────────────────────
// Store server-side de la config de planta (singleton en DB). Sólo LECTURA.
//
// Todo lo que la app muestra de la planta —mímico, áreas, gemelo, vistas AR,
// hoja de QR— sale de acá; si no hay fila, cae al `PLANT` estático.
//
// El `savePlantConfig()` que vivía en este archivo se fue con Administración: la
// planta ya no se edita desde adentro de la app sino desde la fábrica
// (`tier0-appfactory-ops` → Editar), que escribe la fila y corre el seed. Quien
// proyecta la config sobre las tablas es `materializar()`, y su único llamador
// pasa a ser `prisma/seed.ts`, en cada arranque del contenedor.
// ─────────────────────────────────────────────────────────────────────────────

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
