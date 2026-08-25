// ─────────────────────────────────────────────────────────────────────────────
// Modelo declarativo del mímico SCADA (data-driven, extensible).
//
// Una pantalla se compone de SECCIONES; cada sección es un lienzo SVG (viewBox)
// con NODOS (equipos, posicionados) y CAÑERÍAS (polilíneas entre equipos, con
// fluido y sentido). El renderer (ScadaMimic.tsx) es genérico: para cubrir toda
// la planta se agregan más `ScadaSection` — no se toca el render.
//
// Piloto: RO_SECTION (Ósmosis Inversa + ERI). Referencia de disposición: PFD
// ILUKA I1KA-C7525-DIA-001-00002 (zona RO).
// ─────────────────────────────────────────────────────────────────────────────

/** Símbolo SCADA a dibujar (mapea EquipmentKind del plant-config). */
export type SymbolKind =
  | "pump" | "ro_rack" | "uf_skid" | "eri" | "cartridge_filter"
  | "tank" | "mixer" | "dosing" | "intake_tower" | "valve" | "generic";

/** Fluido de una cañería → color (paleta separada de los estados SCADA). */
export type Fluid = "feed" | "permeate" | "brine" | "chemical" | "cip";

export type ScadaNode = {
  code: string;              // matchea EquipmentDef.code del config
  symbol: SymbolKind;
  x: number; y: number;      // centro en coordenadas del viewBox
  w?: number; h?: number;    // tamaño (símbolos rectangulares); r via w para circulares
  label?: string;            // sobreescribe el nombre corto
  valueSignal?: string;      // señal a mostrar (default = primarySignal del equipo)
  labelPos?: "top" | "bottom" | "left" | "right"; // dónde cae la etiqueta+valor
};

export type ScadaPipe = {
  from?: string; to?: string;        // trazabilidad (opcional)
  fluid: Fluid;
  points: [number, number][];        // waypoints ortogonales en el viewBox
  gate?: string | string[];          // equipo(s) aguas-arriba: anima el flujo sólo si está en marcha
  dashed?: boolean;                   // línea punteada (p.ej. recuperación de energía)
  arrow?: boolean;                    // marcador de sentido al final
};

export type IoPort = { x: number; y: number; label: string; fluid: Fluid; dir: "in" | "out" };

export type ScadaSection = {
  id: string;
  title: string;
  subtitle?: string;
  viewBox: string;
  nodes: ScadaNode[];
  pipes: ScadaPipe[];
  io?: IoPort[];             // entradas/salidas de la sección (flechas de borde)
};

// ── Etiquetas de fluido para la leyenda ──────────────────────────────────────
export const FLUID_LABEL: Record<Fluid, string> = {
  feed: "Agua de alimentación",
  permeate: "Permeado",
  brine: "Salmuera / rechazo",
  chemical: "Químico",
  cip: "Limpieza química (CIP RO / CEB UF)",
};

// Colores de fluido (NO semántica de estado; los estados usan la capa SCADA).
export const FLUID_HEX: Record<Fluid, string> = {
  feed: "#38bdf8",      // celeste — agua de mar filtrada a presión
  permeate: "#2dd4bf",  // teal — agua producto (permeado)
  brine: "#f59e0b",     // ámbar — salmuera concentrada
  chemical: "#a78bfa",  // violeta — dosificación
  cip: "#f472b6",       // rosa — limpieza química
};

// ── Sección piloto: Ósmosis Inversa + ERI ────────────────────────────────────
// Flujo: (alim. filtrada) → A32 cartucho → A23 intermedia → A24-1/2 alta presión
//   → bus → A25-1..4 racks RO (paralelo) → permeado (→ remineralización)
//   + concentrado → A26 ERI → A33 cámara de rechazo → emisario. A26 recupera
//   energía al bus vía A27 booster (línea punteada).
const RACK_Y = [90, 180, 270, 360];

export const RO_SECTION: ScadaSection = {
  id: "ro",
  title: "Ósmosis Inversa + Recuperación de Energía",
  subtitle: "Sección piloto SCADA · 4 trenes RO en paralelo · datos vivos ~2,5 s",
  viewBox: "0 0 1000 560",
  io: [
    { x: 18, y: 250, label: "Alim. UF", fluid: "feed", dir: "in" },
    { x: 982, y: 50, label: "Permeado →", fluid: "permeate", dir: "out" },
    { x: 982, y: 470, label: "Salmuera →", fluid: "brine", dir: "out" },
  ],
  nodes: [
    { code: "A32", symbol: "cartridge_filter", x: 105, y: 250, w: 46, h: 78, labelPos: "bottom" },
    { code: "A23", symbol: "pump", x: 185, y: 250, w: 44, labelPos: "bottom" },
    { code: "A24-1", symbol: "pump", x: 300, y: 175, w: 50, labelPos: "top" },
    { code: "A24-2", symbol: "pump", x: 300, y: 325, w: 50, labelPos: "bottom" },
    { code: "A25-1", symbol: "ro_rack", x: 540, y: RACK_Y[0], w: 150, h: 54, valueSignal: "tmp", labelPos: "left" },
    { code: "A25-2", symbol: "ro_rack", x: 540, y: RACK_Y[1], w: 150, h: 54, valueSignal: "tmp", labelPos: "left" },
    { code: "A25-3", symbol: "ro_rack", x: 540, y: RACK_Y[2], w: 150, h: 54, valueSignal: "tmp", labelPos: "left" },
    { code: "A25-4", symbol: "ro_rack", x: 540, y: RACK_Y[3], w: 150, h: 54, valueSignal: "tmp", labelPos: "left" },
    { code: "A26", symbol: "eri", x: 720, y: 470, w: 72, h: 62, labelPos: "bottom" },
    { code: "A27", symbol: "pump", x: 560, y: 400, w: 40, label: "Booster ERI", labelPos: "bottom" },
    { code: "A33", symbol: "tank", x: 882, y: 470, w: 64, h: 88, labelPos: "bottom" },
  ],
  pipes: [
    // Alimentación
    { fluid: "feed", points: [[18, 250], [82, 250]], gate: "A32", arrow: true, to: "A32" },
    { fluid: "feed", points: [[128, 250], [163, 250]], gate: "A32", from: "A32", to: "A23" },
    { fluid: "feed", points: [[207, 250], [255, 250], [255, 175], [276, 175]], gate: "A23", to: "A24-1" },
    { fluid: "feed", points: [[255, 250], [255, 325], [276, 325]], gate: "A23", to: "A24-2" },
    // Alta presión → bus vertical
    { fluid: "feed", points: [[324, 175], [430, 175]], gate: "A24-1" },
    { fluid: "feed", points: [[324, 325], [430, 325]], gate: "A24-2" },
    { fluid: "feed", points: [[430, 90], [430, 360]], gate: ["A24-1", "A24-2"] },
    // Bus → racks
    ...RACK_Y.map((y, i): ScadaPipe => ({ fluid: "feed", points: [[430, y], [465, y]], gate: ["A24-1", "A24-2"], to: `A25-${i + 1}`, arrow: true })),
    // Permeado: rama superior de cada rack → colector vertical → salida
    ...RACK_Y.map((y, i): ScadaPipe => ({ fluid: "permeate", points: [[615, y - 14], [650, y - 14]], gate: `A25-${i + 1}`, from: `A25-${i + 1}` })),
    { fluid: "permeate", points: [[650, 76], [650, 346]], gate: ["A25-1", "A25-2", "A25-3", "A25-4"] },
    { fluid: "permeate", points: [[650, 76], [650, 50], [982, 50]], gate: ["A25-1", "A25-2", "A25-3", "A25-4"], arrow: true },
    // Concentrado: rama inferior → colector vertical → ERI
    ...RACK_Y.map((y, i): ScadaPipe => ({ fluid: "brine", points: [[615, y + 14], [700, y + 14]], gate: `A25-${i + 1}`, from: `A25-${i + 1}` })),
    { fluid: "brine", points: [[700, 104], [700, 374]], gate: ["A25-1", "A25-2", "A25-3", "A25-4"] },
    { fluid: "brine", points: [[700, 374], [700, 470], [684, 470]], gate: ["A25-1", "A25-2", "A25-3", "A25-4"], to: "A26", arrow: true },
    // ERI → cámara de rechazo → emisario
    { fluid: "brine", points: [[756, 470], [850, 470]], gate: "A26", to: "A33", arrow: true },
    { fluid: "brine", points: [[914, 470], [982, 470]], gate: "A33", arrow: true },
    // Recuperación de energía: ERI → booster A27 → bus (punteada)
    { fluid: "feed", points: [[720, 439], [720, 400], [580, 400]], gate: "A26", dashed: true, to: "A27", arrow: true },
    { fluid: "feed", points: [[540, 400], [430, 400], [430, 360]], gate: "A27", dashed: true, arrow: true },
  ],
};
