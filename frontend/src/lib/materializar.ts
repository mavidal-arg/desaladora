// Imports RELATIVOS, no con el alias `@/`: este módulo lo carga también
// `prisma/seed.ts` con `tsx` dentro del contenedor, y ahí no hay `tsconfig.json`
// —la imagen de runtime no lo copia—, así que el alias no resuelve y el seed
// muere con MODULE_NOT_FOUND. En el host sí resuelve, que es lo que hace
// traicionera la prueba local.
import { flId, eqId, type PlantConfig } from "./plant-config";
import type { PrismaClient } from "../generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Proyección de `PlantConfig` sobre las tablas.
//
// `PlantConfig` es la FUENTE de la planta; `FunctionalLocation`, `Equipment` y
// `PiSignal` son una proyección derivada de ella. Antes esto vivía sólo dentro
// de `prisma/seed.ts`, que leía la constante compilada: el resultado era que
// editar la planta en Administración cambiaba el JSON pero no las tablas, y el
// EAM (que lee por los adapters) seguía mostrando el plantel del template hasta
// que alguien reconstruyera la imagen.
//
// Su único llamador es `prisma/seed.ts`, en cada arranque del contenedor. Tuvo
// dos más —`savePlantConfig()` y `POST /api/assets`— que se fueron junto con
// Administración: la planta se edita desde la fábrica, que escribe `PlantConfig`
// y corre el seed. Sigue viviendo en su propio módulo, y no dentro del seed,
// porque es la definición de qué significa «las tablas siguen a la config» y
// leerla no debería obligar a leer 600 líneas de datos de demo.
//
// Qué NO hace: las lecturas históricas (`PiReading`), las órdenes de trabajo,
// los planes y los repuestos son DATOS DE DEMO derivados, no estructura. Los
// sigue generando el seed. Un equipo agregado en caliente queda con su señal
// definida pero sin historia hasta el próximo arranque.
//
// Tampoco BORRA señales que sobren, y es a propósito: el gemelo digital inyecta
// 28 señales virtuales por su cuenta (`rf`, `rfNorm`, `ndp`, `sec`, `tmp`,
// `beta`, `piOsmotic` en los cuatro racks RO) que no están ni pueden estar en la
// config. Barrer "lo que no figura en la config" se las llevaría puestas y
// dejaría al gemelo sin física. Una señal que sobra es ruido; una que falta
// rompe una pantalla.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que necesita de un cliente Prisma; sirve para el del app y el del seed. */
type Cliente = Pick<PrismaClient, "functionalLocation" | "equipment" | "piSignal">;

export type Resultado = {
  areas: number;
  equipos: number;
  senales: number;
  /** Equipos que estaban en la base y ya no están en la config. */
  dadosDeBaja: string[];
  /** Áreas que se quitaron de la config y se pudieron borrar. */
  areasBorradas: string[];
  /** Áreas quitadas de la config que siguen en pie porque algo las referencia. */
  areasHuerfanas: string[];
};

/**
 * Deja las tablas reflejando la config. Idempotente.
 *
 * Reconciliación: lo que está en la config se hace `upsert`; lo que ya no está
 * se marca `status: "decommissioned"`, NUNCA se borra. Hay siete claves foráneas
 * apuntando a `Equipment` sin `onDelete: Cascade` (órdenes de trabajo, planes,
 * repuestos, documentos, no conformidades, señales y el perfil predictivo), así
 * que un `delete` reventaría contra la primera OT que lo mencione. En un clon
 * nuevo esta rama no se ejerce: la base arranca vacía.
 */
export async function materializar(
  prisma: Cliente,
  cfg: PlantConfig,
  opciones: { fecha?: Date } = {},
): Promise<Resultado> {
  const ahora = opciones.fecha ?? new Date();
  const nombreDeArea = (code: string) => cfg.areas.find((a) => a.code === code)?.name ?? code;

  // Dos códigos distintos no pueden compartir id. Si lo hacen, el segundo upsert
  // pisa al primero y queda una fila con datos de los dos: pasó de verdad con
  // `A4-2` y `A42` y nadie se enteró hasta que faltó una bomba en el inventario.
  // Mejor romper acá, con los dos códigos en el mensaje, que corromper en
  // silencio.
  const porId = new Map<string, string[]>();
  for (const e of cfg.equipment) {
    const id = eqId(e.code);
    porId.set(id, [...(porId.get(id) ?? []), e.code]);
  }
  const choques = [...porId.entries()].filter(([, codes]) => codes.length > 1);
  if (choques.length > 0) {
    throw new Error(
      "Códigos de equipo que colapsan en el mismo id: " +
        choques.map(([id, codes]) => `${codes.join(" y ")} → ${id}`).join("; "),
    );
  }

  // ── Ubicaciones funcionales: el sitio y sus áreas ──
  await upsertFL(prisma, {
    id: cfg.plant.id,
    code: cfg.plant.code,
    name: cfg.plant.name,
    area: "Planta",
    criticality: "critical",
    parentId: null,
  });
  for (const a of cfg.areas) {
    await upsertFL(prisma, {
      id: flId(a.code),
      code: a.code,
      name: a.name,
      area: a.short,
      criticality: a.criticality,
      parentId: cfg.plant.id,
    });
  }

  // ── Equipos y sus señales ──
  let senales = 0;
  for (const e of cfg.equipment) {
    const id = eqId(e.code);
    await prisma.equipment.upsert({
      where: { id },
      // En el update va todo lo que la Administración puede cambiar. `code` no:
      // es la identidad del equipo y además es la clave del `eqId`.
      update: {
        name: e.name,
        category: e.category,
        functionalLocationId: flId(e.areaCode),
        location: `${nombreDeArea(e.areaCode)} — ${e.name}`,
        manufacturer: e.manufacturer,
        model: e.model,
        specs: e.specs,
        criticality: e.criticality,
        status: e.status,
        healthIndex: e.health,
        runtimeHours: e.runtime,
      },
      create: {
        id,
        code: e.code,
        name: e.name,
        functionalLocationId: flId(e.areaCode),
        category: e.category,
        location: `${nombreDeArea(e.areaCode)} — ${e.name}`,
        manufacturer: e.manufacturer,
        model: e.model,
        serialNumber: `${e.manufacturer.slice(0, 2).toUpperCase()}-${1000 + (hash(e.code) % 9000)}`,
        installDate: dias(ahora, -1200),
        commissionDate: dias(ahora, -1160),
        warrantyExpiry: dias(ahora, 160),
        specs: e.specs,
        criticality: e.criticality,
        status: e.status,
        healthIndex: e.health,
        runtimeHours: e.runtime,
      },
    });

    for (const s of e.signals) {
      await prisma.piSignal.upsert({
        where: { id: `sig_${id}_${s.signal}` },
        update: { unit: s.unit },
        create: { id: `sig_${id}_${s.signal}`, equipmentId: id, signal: s.signal, unit: s.unit },
      });
      senales++;
    }
  }

  // ── Lo que ya no está en la config ──
  const vigentes = cfg.equipment.map((e) => eqId(e.code));
  const sobrantes = await prisma.equipment.findMany({
    where: { id: { notIn: vigentes }, status: { not: "decommissioned" } },
    select: { id: true, code: true },
  });
  if (sobrantes.length > 0) {
    await prisma.equipment.updateMany({
      where: { id: { in: sobrantes.map((e) => e.id) } },
      data: { status: "decommissioned" },
    });
  }

  // ── Áreas que ya no están en la config ──
  // Se borran las que quedaron sin nada colgando. Las que todavía tienen equipos
  // dados de baja se dejan en pie: son la ubicación de esos equipos y borrarlas
  // rompería la clave foránea. Sin este paso, quitar un área dejaba un nodo
  // vacío colgado del árbol de activos.
  const codigosVigentes = new Set(cfg.areas.map((a) => flId(a.code)));
  codigosVigentes.add(cfg.plant.id);
  const areasSobrantes = await prisma.functionalLocation.findMany({
    where: { id: { notIn: [...codigosVigentes] } },
    select: { id: true, code: true, _count: { select: { equipment: true, children: true } } },
  });
  const borrables = areasSobrantes.filter((a) => a._count.equipment === 0 && a._count.children === 0);
  if (borrables.length > 0) {
    await prisma.functionalLocation.deleteMany({ where: { id: { in: borrables.map((a) => a.id) } } });
  }

  return {
    areas: cfg.areas.length,
    equipos: cfg.equipment.length,
    senales,
    dadosDeBaja: sobrantes.map((e) => e.code),
    areasBorradas: borrables.map((a) => a.code),
    areasHuerfanas: areasSobrantes.filter((a) => !borrables.includes(a)).map((a) => a.code),
  };
}

async function upsertFL(
  prisma: Cliente,
  f: { id: string; code: string; name: string; area: string; criticality: string; parentId: string | null },
) {
  await prisma.functionalLocation.upsert({
    where: { id: f.id },
    update: { name: f.name, area: f.area, criticality: f.criticality },
    create: f,
  });
}

// Mismo hash determinístico que usaba el seed, para que el número de serie de un
// equipo no cambie entre una siembra y la siguiente.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dias(desde: Date, n: number): Date {
  return new Date(desde.getTime() + n * 86400000);
}
