import { prisma } from "@/lib/prisma";
import {
  RO_CODES, foulHealthOf, latestOf, loadRackReadings,
} from "@/lib/desal";

// ─────────────────────────────────────────────────────────────────────────────
// Salud de activos — FUENTE ÚNICA.
//
// Antes había tres nociones distintas de "salud" para el mismo equipo, y cada
// pantalla elegía una:
//
//   · Panel principal y Producción  → ensuciamiento calculado (racks RO)
//   · Predictivo y Panel de Mantención → `PredictiveProfile.healthScore` sembrado
//   · Ficha del activo y vista AR    → `Equipment.healthIndex` sembrado
//
// El mismo rack mostraba números distintos según dónde se lo mirara, que es el
// hallazgo del documento de inconsistencias. Peor: el tooltip de Predictivo ya
// afirmaba que los racks RO se calculan del ensuciamiento — describía una
// conducta que el código no tenía.
//
// Acá vive la POLÍTICA, en un solo lugar: para un rack RO manda el ensuciamiento
// (Rf normalizado vs base, rechazo de sales y ΔP transmembrana, señales vivas
// del gemelo); para todo lo demás, el índice del catálogo. La física sigue
// viviendo en `desal.ts` — este módulo decide cuál gana, no cómo se calcula.
// ─────────────────────────────────────────────────────────────────────────────

export type MembraneRow = {
  code: string; name: string; kind: string; health: number; status: string; criticality: string;
  /**
   * Régimen de regeneración del equipo. NO son intercambiables: los trenes de
   * ósmosis inversa se limpian con CIP (limpieza química recirculada, estanque
   * A28) y la ultrafiltración con CEB (retrolavado químicamente asistido, bomba
   * A19 + estanque BW/CEB de 283 m³). Proyectarle "días para CIP" a un skid de
   * UF es atribuirle un proceso que no corre.
   */
  regime: "CIP" | "CEB";
};

/** Mapa code → salud (0-100) de los racks RO, derivada del Rf normalizado. */
export async function roFoulingHealth(): Promise<Map<string, number>> {
  const byRack = await loadRackReadings();
  const out = new Map<string, number>();
  for (const code of RO_CODES) {
    const rr = byRack.get(code)!;
    const rfNormSeries = rr.get("rfNorm") ?? [];
    if (rfNormSeries.length === 0) continue;
    const rfBase = Math.min(...rfNormSeries.map((r) => r.value));
    const foul = (rfNormSeries.at(-1)!.value) / rfBase;
    out.set(code, foulHealthOf(foul, latestOf(rr, "saltRejection"), latestOf(rr, "dpTmp")));
  }
  return out;
}

/**
 * Salud por código de activo, para TODA la flota.
 *
 * Un rack RO sin señales suficientes cae a su `healthIndex` de catálogo en vez
 * de quedar sin valor: es preferible un número viejo y declarado a un hueco que
 * cada pantalla rellene a su manera — que es exactamente cómo empezó este lío.
 */
export async function getAssetHealth(): Promise<Map<string, number>> {
  const [equipment, foul] = await Promise.all([
    prisma.equipment.findMany({ select: { code: true, healthIndex: true } }),
    roFoulingHealth(),
  ]);
  const out = new Map<string, number>();
  for (const e of equipment) out.set(e.code, Math.round(e.healthIndex));
  for (const [code, h] of foul) out.set(code, h);
  return out;
}

/** Promedio de flota — el "índice de salud planta" del Panel de Mantención. */
export function plantHealth(health: Map<string, number>): number {
  if (health.size === 0) return 0;
  const total = [...health.values()].reduce((s, h) => s + h, 0);
  return Math.round((total / health.size) * 10) / 10;
}

/**
 * ¿Es un tren de ósmosis inversa? Mismo criterio que `isRO` en PredictiveClient:
 * el área manda, y el prefijo de código es el respaldo. La tabla `Equipment` no
 * tiene columna `kind` — sólo vive en plant-config — así que server-side se
 * discrimina por código.
 */
export const isRoCode = (code: string) => /^A25/i.test(code);

/** Membranas (UF + racks RO) con su salud y su régimen de regeneración. */
export async function getMembranes(): Promise<MembraneRow[]> {
  const [rows, health] = await Promise.all([
    prisma.equipment.findMany({ where: { category: "Membranes" }, orderBy: { code: "asc" } }),
    getAssetHealth(),
  ]);
  return rows.map((e) => {
    const ro = isRoCode(e.code);
    return {
      code: e.code, name: e.name,
      kind: ro ? "Ósmosis Inversa" : "Ultrafiltración",
      health: health.get(e.code) ?? Math.round(e.healthIndex),
      status: e.status, criticality: e.criticality,
      regime: (ro ? "CIP" : "CEB") as "CIP" | "CEB",
    };
  });
}
