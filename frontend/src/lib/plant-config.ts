// ─────────────────────────────────────────────────────────────────────────────
// PLANT CONFIG — fuente única data-driven de la planta.
//
// Caso: PLANTA DESALADORA MAITENCILLO DE PANUL, COQUIMBO (Aguas del Valle S.A.).
// Desalación por ósmosis inversa. Modelo derivado de la Ingeniería Básica
// ADV-129-00-DGM-PL-001/002/003 (Diagramas de Flujo y Balance de Masas, 2023).
// Datos simulados para demo. Replicar a otra planta = clonar/editar (Admin CRUD).
// ─────────────────────────────────────────────────────────────────────────────

export type EquipmentKind =
  // pulp (heredados del template, no usados acá)
  | "debarker" | "chipper" | "conveyor" | "pile" | "silo" | "impregnation"
  | "digester" | "tank" | "washer" | "screen" | "o2reactor" | "dryer"
  | "evaporator" | "recovery_boiler" | "power_boiler" | "lime_kiln"
  | "causticizer" | "turbogen" | "pump" | "fan" | "motor" | "agitator"
  // desal
  | "intake_tower" | "band_filter" | "uf_skid" | "cartridge_filter"
  | "ro_rack" | "membrane" | "eri" | "calcite_contactor" | "dosing" | "mixer" | "outfall";

export type SignalDef = {
  signal: string; label: string; unit: string; base: number; amp: number; min?: number; max?: number;
};

export type EquipmentDef = {
  code: string; name: string; kind: EquipmentKind; areaCode: string; category: string;
  criticality: "low" | "medium" | "high" | "critical";
  status: "running" | "stopped" | "maintenance" | "idle";
  health: number; runtime: number; manufacturer: string; model: string;
  specs: Record<string, string>; mimic: { x: number; y: number };
  primarySignal: string; signals: SignalDef[]; help: string;
};

export type AreaDef = {
  code: string; name: string; short: string;
  criticality: "low" | "medium" | "high" | "critical";
  loop: string; // clave de banda del mímico
  help: string;
};

export type BandDef = { loop: string; title: string; sub: string };

export type PlantConfig = {
  version: number;
  plant: {
    id: string; code: string; name: string; company: string; location: string;
    product: string; capacity: string; commissioned: string;
  };
  /**
   * Identidad de la APLICACIÓN — distinta de la de la planta. Es lo que se ve en
   * la barra lateral, el login y la pestaña del navegador, y es exactamente lo
   * que cambia al entregarle esta app a otro cliente.
   */
  app: {
    name: string;       // "EAM — Equipment Asset Management"
    shortName: string;  // "EAM"
    client: string;     // "Aguas del Valle"
    site: string;       // "Desaladora Coquimbo V2"
    slug: string;       // "desaladora-coquimbo-v2" → URL, contenedor y base del clon
    tagline: string;    // bajada bajo el título del login
    footer: string;     // pie de la barra lateral y del login
  };
  branding: {
    /** Data URI (subido desde Admin) o nombre de archivo heredado del template. */
    logo: string;
    logoLight: string;
    primary: string; ink: string; accent: string;
  };
  flags: {
    phase: number;          // fase operativa mostrada (1|2|3)
    phaseLs: number;        // caudal de captación de la fase (l/s)
    eri: boolean;           // recuperación de energía instalada
    recoveryPct: number;    // recovery global objetivo (%)
    note?: string;
  };
  bands: BandDef[];
  areas: AreaDef[];
  equipment: EquipmentDef[];
};

const sig = (signal: string, label: string, unit: string, base: number, amp: number, min?: number, max?: number): SignalDef =>
  ({ signal, label, unit, base, amp, min, max });

// ── Config Desaladora Coquimbo ───────────────────────────────────────────────
// ⚠ `version` NO se toca al agregar campos. `prisma/seed.ts` re-siembra el
// singleton en CADA arranque del contenedor si `storedVersion < PLANT.version`:
// subirla le pisa la identidad a Coquimbo y a todos los clones en el próximo
// restart. Los campos nuevos se resuelven mezclando defaults en el store.
export const PLANT: PlantConfig = {
  version: 1,
  plant: {
    id: "site_desal", code: "DESAL-CQ", name: "Desaladora Maitencillo de Panul",
    company: "Aguas del Valle S.A.", location: "Panul, Coquimbo · Región de Coquimbo, Chile",
    product: "Agua potable por ósmosis inversa", capacity: "Fase 1: 800 l/s (Fase 2: 1.200 l/s)",
    commissioned: "2024",
  },
  app: {
    name: "EAM — Equipment Asset Management",
    shortName: "EAM",
    client: "Aguas del Valle",
    site: "Desaladora Coquimbo V2",
    slug: "desaladora-coquimbo-v2",
    tagline: "Entity-360 · PI · SAP · SE Suite",
    footer: "Aguas del Valle · Desaladora Coquimbo",
  },
  branding: {
    logo: "logo-aguasdelvalle.png", logoLight: "logo-aguasdelvalle-blanco.png",
    primary: "#0091D5", ink: "#0B3C68", accent: "#00A9E0",
  },
  flags: { phase: 1, phaseLs: 800, eri: true, recoveryPct: 45 },

  bands: [
    { loop: "water", title: "Línea de Agua", sub: "Mar → pretratamiento → RO → remineralización → agua potable" },
    { loop: "brine", title: "Salmuera", sub: "Rechazo → cámara de carga → emisario submarino" },
    { loop: "utility", title: "Servicios", sub: "CIP (RO) / CEB (UF) y energía" },
  ],

  areas: [
    { code: "INTK", name: "Captación / Obras Marinas", short: "Captación", criticality: "high", loop: "water",
      help: "Toma de agua de mar mediante torre de captación y emisario submarino; desbaste grueso (reja) y filtro de banda, y bombeo al estanque de agua de mar. Es el ingreso de la línea de agua." },
    { code: "UF", name: "Pretratamiento / Ultrafiltración", short: "Pretrat./UF", criticality: "high", loop: "water",
      help: "Acondiciona el agua de mar: coagulación (cloruro férrico), control de cloro (metabisulfito) y ultrafiltración por membranas para entregar agua de baja turbidez (SDI bajo) a la ósmosis inversa." },
    { code: "RO", name: "Ósmosis Inversa + ERI", short: "Ósmosis Inversa", criticality: "critical", loop: "water",
      help: "Separa la sal del agua forzándola a través de membranas a alta presión (~60 bar). El recuperador de energía (ERI) reutiliza la presión del rechazo, bajando fuertemente el consumo específico (kWh/m³)." },
    { code: "REMIN", name: "Remineralización", short: "Remineralización", criticality: "medium", loop: "water",
      help: "El permeado es muy puro y agresivo: se remineraliza con CO₂ + contactores de calcita y se ajusta pH/alcalinidad, más cloración y fluoruración, para dejarlo apto como agua potable." },
    { code: "PROD", name: "Impulsión / Agua Producto", short: "Impulsión", criticality: "critical", loop: "water",
      help: "Almacena el agua potable y la impulsa al sistema de distribución (red norte de Aguas del Valle). Es la salida del proceso." },
    { code: "BRINE", name: "Salmuera / Descarga", short: "Salmuera", criticality: "high", loop: "brine",
      help: "Concentra y descarga la salmuera de rechazo por el emisario submarino con difusor, previa decloración (metabisulfito), cumpliendo la normativa ambiental de descarga." },
    { code: "CIP", name: "CIP / CEB — Limpieza Química", short: "CIP/CEB", criticality: "medium", loop: "utility",
      help: "La planta tiene TRES regímenes de limpieza, y no son intercambiables (ADV-129-00-DGM-PL-002). · CEB de UF: retrolavado con reactivo inyectado en línea a cada skid (bomba A19 + estanque BW/CEB de 283 m³, con NaOCl / NaOH / H₂SO₄) — es el que la app opera para ultrafiltración, y su ciclo es de horas. · CIP de RO: limpieza química recirculada de los trenes de ósmosis inversa (estanque A28 de 115 m³ + rack CIP), con ciclo de semanas. · CIP de UF: limpieza de recuperación de la ultrafiltración (estanque A21 de 13 m³ + bombas A22, alimentado con permeado RO), instalada en la planta pero no modelada en esta versión. Todos los efluentes pasan por el estanque de neutralización antes de su descarga." },
    { code: "ELEC", name: "Servicios Eléctricos", short: "Eléctrico", criticality: "high", loop: "utility",
      help: "Salas eléctricas que alimentan bombas de alta presión y el resto de la planta. La energía es el mayor costo operativo de una desaladora." },
  ],

  equipment: [
    // ── Captación ──
    { code: "A1", name: "Torre de Captación", kind: "intake_tower", areaCode: "INTK", category: "Marine Intake",
      criticality: "high", status: "running", health: 92, runtime: 12000, manufacturer: "Obras Marinas", model: "Intake-800",
      specs: { caudal: "800 l/s", profundidad: "-15 m" }, mimic: { x: 0, y: 0 }, primarySignal: "flow",
      signals: [sig("flow", "Caudal", "m³/h", 2880, 120, 0, 3200), sig("temperature", "Temperatura", "°C", 15, 1.5, 10, 22), sig("tds", "SDT", "mg/l", 38329, 500, 30000, 42000)],
      help: "Toma de agua de mar por emisario submarino. Alimenta toda la línea; el SDT (~38 g/l) es la sal a remover." },
    { code: "A2", name: "Reja Mecánica", kind: "screen", areaCode: "INTK", category: "Screens",
      criticality: "medium", status: "running", health: 88, runtime: 9000, manufacturer: "Estruagua", model: "RM-1200",
      specs: { luz: "10 mm" }, mimic: { x: 1, y: 0 }, primarySignal: "dp",
      signals: [sig("dp", "Pérdida de carga", "mbar", 45, 8, 0, 200), sig("load", "Carga", "%", 60, 8, 0, 100)],
      help: "Retiene sólidos gruesos (algas, residuos) protegiendo bombas y filtros aguas abajo." },
    { code: "A3", name: "Filtro Rotatorio de Banda", kind: "band_filter", areaCode: "INTK", category: "Filters",
      criticality: "high", status: "running", health: 84, runtime: 11000, manufacturer: "Andritz", model: "RBF-3",
      specs: { luz: "0.5 mm" }, mimic: { x: 2, y: 0 }, primarySignal: "dp",
      signals: [sig("dp", "Pérdida de carga", "mbar", 90, 15, 0, 300), sig("flow", "Caudal", "m³/h", 2880, 120, 0, 3200), sig("load", "Carga", "%", 62, 9, 0, 100)],
      help: "Filtración fina previa: remueve microsólidos antes del bombeo y la ultrafiltración." },
    ...dpump("A4-1", "Bomba Agua de Mar 1", "INTK", "running", 82, 3.5, 1440),
    ...dpump("A4-2", "Bomba Agua de Mar 2", "INTK", "running", 79, 3.5, 1440),
    ...dpump("A4-3", "Bomba Agua de Mar 3 (standby)", "INTK", "idle", 85, 3.5, 1440),
    ...tk("A5", "Estanque Agua de Mar", "INTK", "running", 95, "1.400 m³"),

    // ── Pretratamiento / UF ──
    ...dpump("A11-1", "Bomba Alim. UF 1 (VDF)", "UF", "running", 83, 4.8, 1230),
    ...dpump("A11-2", "Bomba Alim. UF 2 (VDF)", "UF", "running", 80, 4.8, 1230),
    ...dose("DOS-FECL", "Dosif. Cloruro Férrico", "UF", "running", 90, 8),
    ...dose("DOS-MBS1", "Dosif. Metabisulfito", "UF", "running", 90, 4),
    ...dose("DOS-HIP1", "Dosif. Hipoclorito", "UF", "running", 90, 3),
    { code: "A13", name: "Mezclador Estático UF", kind: "mixer", areaCode: "UF", category: "Mixers",
      criticality: "low", status: "running", health: 95, runtime: 8000, manufacturer: "Statiflo", model: "SM-8",
      specs: {}, mimic: { x: 5, y: 0 }, primarySignal: "dp",
      signals: [sig("dp", "Pérdida de carga", "mbar", 120, 10, 0, 300)],
      help: "Mezcla en línea los reactivos (coagulante) con el agua para una dosificación uniforme antes de la UF." },
    ...ufskid("A12-1", "Skid Ultrafiltración 1", "running", 81),
    ...ufskid("A12-2", "Skid Ultrafiltración 2", "running", 78),
    ...ufskid("A12-3", "Skid Ultrafiltración 3", "maintenance", 64),
    ...tk("A14", "Estanque Lavado Prefiltros UF", "UF", "running", 93, "32 m³"),
    ...dpump("A15", "Bombas Pre-filtros UF", "UF", "running", 82, 3.0, 700),

    // ── Ósmosis Inversa + ERI ──
    { code: "A17", name: "Mezclador Estático RO", kind: "mixer", areaCode: "RO", category: "Mixers",
      criticality: "low", status: "running", health: 95, runtime: 8000, manufacturer: "Statiflo", model: "SM-8",
      specs: {}, mimic: { x: 6, y: 0 }, primarySignal: "dp",
      signals: [sig("dp", "Pérdida de carga", "mbar", 110, 10, 0, 300)],
      help: "Inyecta antiincrustante y metabisulfito al agua filtrada antes de las membranas RO." },
    ...dose("DOS-AS", "Dosif. Antiincrustante", "RO", "running", 90, 4),
    { code: "A32", name: "Filtro Cartucho RO", kind: "cartridge_filter", areaCode: "RO", category: "Filters",
      criticality: "high", status: "running", health: 86, runtime: 7000, manufacturer: "Pentair", model: "5um",
      specs: { grado: "5 µm" }, mimic: { x: 7, y: 0 }, primarySignal: "dp",
      signals: [sig("dp", "Pérdida de carga", "bar", 0.4, 0.1, 0, 1.5), sig("flow", "Caudal", "m³/h", 2437, 100, 0, 2800)],
      help: "Última barrera de seguridad (5 µm) que protege las membranas de ósmosis inversa de partículas." },
    ...dpump("A23", "Bomba Intermedia (VDF)", "RO", "running", 84, 10, 2437),
    { code: "A24-1", name: "Bomba Alta Presión 1 (VDF)", kind: "pump", areaCode: "RO", category: "Pumps",
      criticality: "critical", status: "running", health: 88, runtime: 15000, manufacturer: "Flowserve", model: "HP-62",
      specs: { presion: "62 bar", power: "1.500 kW" }, mimic: { x: 8, y: 0 }, primarySignal: "pressure",
      signals: [sig("pressure", "Presión", "bar", 62, 1.5, 0, 75), sig("flow", "Caudal", "m³/h", 1200, 60, 0, 1400), sig("motorCurrent", "Corriente", "A", 150, 8, 0, 220)],
      help: "Presuriza el agua a ~62 bar para vencer la presión osmótica del mar. Es el mayor consumidor de energía de la planta." },
    { code: "A24-2", name: "Bomba Alta Presión 2 (VDF)", kind: "pump", areaCode: "RO", category: "Pumps",
      criticality: "critical", status: "running", health: 85, runtime: 14600, manufacturer: "Flowserve", model: "HP-62",
      specs: { presion: "62 bar", power: "1.500 kW" }, mimic: { x: 8, y: 1 }, primarySignal: "pressure",
      signals: [sig("pressure", "Presión", "bar", 61, 1.5, 0, 75), sig("flow", "Caudal", "m³/h", 1180, 60, 0, 1400), sig("motorCurrent", "Corriente", "A", 148, 8, 0, 220)],
      help: "Segunda bomba de alta presión (configuración redundante) alimentando los trenes de membranas RO." },
    ...rorack("A25-1", "Rack Ósmosis Inversa 1", "running", 79),
    ...rorack("A25-2", "Rack Ósmosis Inversa 2", "running", 76),
    ...rorack("A25-3", "Rack Ósmosis Inversa 3", "running", 71),
    ...rorack("A25-4", "Rack Ósmosis Inversa 4", "running", 74),
    { code: "A26", name: "Rack Recuperador de Energía (ERI)", kind: "eri", areaCode: "RO", category: "Energy Recovery",
      criticality: "high", status: "running", health: 90, runtime: 15000, manufacturer: "Energy Recovery", model: "PX-Q300",
      specs: { eficiencia: "96%" }, mimic: { x: 10, y: 0 }, primarySignal: "efficiency",
      signals: [sig("efficiency", "Eficiencia", "%", 96, 1, 85, 98), sig("pressure", "Presión", "bar", 60, 1.5, 0, 75), sig("flow", "Caudal", "m³/h", 1400, 60, 0, 1600)],
      help: "Transfiere la presión de la salmuera de rechazo al agua de alimentación (intercambiador de presión), reduciendo el consumo energético hasta ~60%." },
    ...dpump("A27", "Bomba Booster ERI", "RO", "running", 86, 3.0, 1400),
    ...tk("A29", "Estanque Agua Desplazamiento", "RO", "running", 94, "473 m³"),

    // ── Remineralización ──
    ...dose("A34", "Evaporador / Dosif. CO₂", "REMIN", "running", 88, 20, "kg/h"),
    { code: "A35-1", name: "Contactor de Calcita 1", kind: "calcite_contactor", areaCode: "REMIN", category: "Contactors",
      criticality: "medium", status: "running", health: 87, runtime: 9000, manufacturer: "Watco", model: "CC-2",
      specs: { lecho: "calcita" }, mimic: { x: 0, y: 0 }, primarySignal: "ph",
      signals: [sig("ph", "pH", "", 7.6, 0.2, 6.5, 8.5), sig("flow", "Caudal", "m³/h", 990, 40, 0, 1100), sig("hardness", "Dureza", "mg/l", 60, 6, 40, 120)],
      help: "El agua permeada (ácida y sin minerales) pasa por lecho de calcita + CO₂ para recuperar dureza/alcalinidad y estabilizar el pH." },
    { code: "A35-2", name: "Contactor de Calcita 2", kind: "calcite_contactor", areaCode: "REMIN", category: "Contactors",
      criticality: "medium", status: "running", health: 85, runtime: 8800, manufacturer: "Watco", model: "CC-2",
      specs: { lecho: "calcita" }, mimic: { x: 0, y: 1 }, primarySignal: "ph",
      signals: [sig("ph", "pH", "", 7.5, 0.2, 6.5, 8.5), sig("flow", "Caudal", "m³/h", 990, 40, 0, 1100), sig("hardness", "Dureza", "mg/l", 58, 6, 40, 120)],
      help: "Segundo contactor de calcita en paralelo para asegurar remineralización uniforme del caudal producto." },
    ...dose("DOS-NAOH", "Dosif. Hidróxido de Sodio", "REMIN", "running", 90, 6),
    ...dose("DOS-FLU", "Dosif. Ácido Fluorosilícico", "REMIN", "running", 90, 1),
    ...dose("DOS-HIP2", "Dosif. Hipoclorito (cloración)", "REMIN", "running", 90, 2),
    ...tk("A38", "Estanque Agua Remineralizada", "REMIN", "running", 94, "—", [sig("ph", "pH", "", 7.5, 0.15, 6.5, 8.5), sig("tds", "SDT", "mg/l", 250, 20, 140, 400)]),

    // ── Impulsión / Producto ──
    { code: "A37-1", name: "Bomba Agua Potable Norte 1 (VDF)", kind: "pump", areaCode: "PROD", category: "Pumps",
      criticality: "critical", status: "running", health: 89, runtime: 13000, manufacturer: "KSB", model: "AP-6",
      specs: { presion: "6 bar", power: "400 kW" }, mimic: { x: 0, y: 0 }, primarySignal: "flow",
      signals: [sig("flow", "Caudal", "m³/h", 990, 40, 0, 1200), sig("pressure", "Presión", "bar", 6, 0.4, 0, 10), sig("motorCurrent", "Corriente", "A", 96, 6, 0, 150)],
      help: "Impulsa el agua potable producida al sistema de distribución (red norte). Su caudal es la producción entregada." },
    { code: "A37-2", name: "Bomba Agua Potable Norte 2 (standby)", kind: "pump", areaCode: "PROD", category: "Pumps",
      criticality: "high", status: "idle", health: 88, runtime: 12000, manufacturer: "KSB", model: "AP-6",
      specs: { presion: "6 bar", power: "400 kW" }, mimic: { x: 0, y: 1 }, primarySignal: "flow",
      signals: [sig("flow", "Caudal", "m³/h", 0, 5, 0, 1200), sig("pressure", "Presión", "bar", 0.1, 0.1, 0, 10), sig("motorCurrent", "Corriente", "A", 0, 2, 0, 150)],
      help: "Bomba de impulsión en reserva (standby); entra en servicio ante falla o mantenimiento de la principal." },
    ...tk("A42", "Estanque Agua Potable Planta", "PROD", "running", 92, "8,5 m³"),

    // ── Salmuera / Descarga ──
    ...tk("A33", "Cámara de Rechazo", "BRINE", "running", 95, "—", [sig("flow", "Caudal salmuera", "m³/h", 1590, 80, 0, 1800), sig("tds", "SDT salmuera", "mg/l", 69793, 800, 60000, 75000)]),
    ...dose("DOS-MBS2", "Dosif. Metabisulfito (decloración)", "BRINE", "running", 90, 3),
    { code: "OUT", name: "Difusor / Emisario Submarino", kind: "outfall", areaCode: "BRINE", category: "Marine Discharge",
      criticality: "high", status: "running", health: 96, runtime: 12000, manufacturer: "Obras Marinas", model: "Difusor",
      specs: {}, mimic: { x: 0, y: 0 }, primarySignal: "flow",
      signals: [sig("flow", "Caudal descarga", "m³/h", 1590, 80, 0, 1800), sig("pressure", "Presión", "bar", 1.2, 0.2, 0, 3)],
      help: "Descarga la salmuera al mar mediante difusor multipuerto para dilución rápida, cumpliendo los límites ambientales de la RCA." },

    // ── CIP / CEB — Limpieza Química ──
    // Los nombres A21/A28 son literales del plano ADV-129-00-DGM-PL-002: se
    // conservan tal cual aunque la app sólo opere el régimen CEB para la UF.
    ...dpump("A19", "Bomba BW/CEB Ultrafiltración", "CIP", "running", 88, 3.2, 780),
    ...tk("A28", "Estanque CIP RO", "CIP", "running", 90, "115 m³", [sig("ph", "pH", "", 7, 1, 2, 12)]),
    ...tk("A21", "Estanque CIP UF", "CIP", "running", 90, "13 m³", [sig("ph", "pH", "", 7, 1, 2, 12)]),
    ...tk("NEUT", "Estanque de Neutralización", "CIP", "running", 91, "196 m³", [sig("ph", "pH", "", 7.2, 0.5, 5, 9)]),
    ...dpump("A31", "Bomba Flushing / CIP RO", "CIP", "idle", 87, 4.0, 200),
    ...dpump("A30", "Bomba Agua de Servicio", "CIP", "running", 85, 3.5, 100),

    // ── Servicios Eléctricos ──
    { code: "SE-1", name: "Sala Eléctrica N°1", kind: "motor", areaCode: "ELEC", category: "Electrical Equipment",
      criticality: "high", status: "running", health: 96, runtime: 0, manufacturer: "Schneider", model: "MV-Room",
      specs: { tension: "6,6 kV" }, mimic: { x: 0, y: 0 }, primarySignal: "power",
      signals: [sig("power", "Potencia", "kW", 3200, 150, 0, 4500), sig("voltage", "Tensión", "V", 6600, 40, 0, 7000)],
      help: "Alimenta las bombas de alta presión de RO y el resto de la planta. La energía es el principal costo operativo de la desaladora." },
    { code: "SE-2", name: "Sala Eléctrica N°2", kind: "motor", areaCode: "ELEC", category: "Electrical Equipment",
      criticality: "high", status: "running", health: 96, runtime: 0, manufacturer: "Schneider", model: "MV-Room",
      specs: { tension: "6,6 kV" }, mimic: { x: 0, y: 1 }, primarySignal: "power",
      signals: [sig("power", "Potencia", "kW", 2100, 120, 0, 3000), sig("voltage", "Tensión", "V", 6600, 40, 0, 7000)],
      help: "Segunda sala eléctrica: pretratamiento, remineralización, impulsión y servicios auxiliares." },
  ],
};

// ── Fábricas compactas ───────────────────────────────────────────────────────
function dpump(code: string, name: string, area: string, status: EquipmentDef["status"], health: number, pBar: number, qM3h: number): [EquipmentDef] {
  return [{ code, name, kind: "pump", areaCode: area, category: "Pumps", criticality: "medium", status, health,
    runtime: 8000 + (health * 137) % 30000, manufacturer: "KSB", model: `${pBar}bar`, specs: { presion: `${pBar} bar` },
    mimic: { x: 0, y: 0 }, primarySignal: "pressure",
    signals: [sig("pressure", "Presión", "bar", pBar, pBar * 0.06 + 0.1, 0, pBar * 1.4 + 1), sig("flow", "Caudal", "m³/h", qM3h, qM3h * 0.05 + 5, 0, qM3h * 1.3 + 50), sig("motorCurrent", "Corriente", "A", 60, 5, 0, 130)],
    help: `${name}: bomba del área. Presión de descarga y caudal son los indicadores de operación; la corriente/vibración anticipan fallas.` }];
}
function dose(code: string, name: string, area: string, status: EquipmentDef["status"], health: number, doseBase: number, unit = "mg/l"): [EquipmentDef] {
  return [{ code, name, kind: "dosing", areaCode: area, category: "Dosing", criticality: "medium", status, health,
    runtime: 6000 + (health * 91) % 20000, manufacturer: "ProMinent", model: "Skid", specs: {},
    mimic: { x: 0, y: 0 }, primarySignal: "dose",
    signals: [sig("dose", "Dosis", unit, doseBase, doseBase * 0.15 + 0.2, 0, doseBase * 2 + 1), sig("flow", "Caudal", "l/h", 120, 15, 0, 300), sig("tankLevel", "Nivel estanque", "%", 65, 8, 0, 100)],
    help: `${name}: skid de dosificación química. La dosis (${unit}) y el nivel del estanque de reactivo son los parámetros clave de operación.` }];
}
function tk(code: string, name: string, area: string, status: EquipmentDef["status"], health: number, vol: string, extra: SignalDef[] = []): [EquipmentDef] {
  return [{ code, name, kind: "tank", areaCode: area, category: "Storage Tanks", criticality: "medium", status, health,
    runtime: 0, manufacturer: "CB&I", model: vol, specs: vol && vol !== "—" ? { volumen: vol } : {},
    mimic: { x: 0, y: 0 }, primarySignal: "level",
    signals: [sig("level", "Nivel", "%", 72, 9, 0, 100), ...extra],
    help: `${name}: estanque de proceso (${vol}). Amortigua el flujo entre etapas; el nivel refleja el balance de la línea.` }];
}
function ufskid(code: string, name: string, status: EquipmentDef["status"], health: number): [EquipmentDef] {
  return [{ code, name, kind: "uf_skid", areaCode: "UF", category: "Membranes", criticality: "high", status, health,
    runtime: 10000 + (health * 173) % 25000, manufacturer: "Inge/Dupont", model: "UF", specs: { fibras: "PVDF" },
    mimic: { x: 0, y: 0 }, primarySignal: "flux",
    signals: [sig("flux", "Flux", "LMH", 55, 4, 30, 80), sig("tmp", "Presión transmembrana", "bar", 0.6, 0.15, 0, 2), sig("turbidity", "Turbidez salida", "NTU", 0.08, 0.03, 0, 0.5)],
    help: `${name}: módulo de ultrafiltración (membranas de fibra hueca). El flux y la presión transmembrana (TMP) indican el ensuciamiento; turbidez baja = agua apta para RO. Se regenera con CEB (retrolavado químicamente asistido), NO con CIP: su ciclo es de horas.` }];
}
function rorack(code: string, name: string, status: EquipmentDef["status"], health: number): [EquipmentDef] {
  return [{ code, name, kind: "ro_rack", areaCode: "RO", category: "Membranes", criticality: "critical", status, health,
    runtime: 16000 + (health * 211) % 30000, manufacturer: "Dupont/Toray", model: "SWRO", specs: { membranas: "SW30HRLE-440" },
    mimic: { x: 0, y: 0 }, primarySignal: "recovery",
    signals: [sig("recovery", "Recovery", "%", 45, 1.5, 35, 50), sig("pressure", "Presión", "bar", 60, 1.5, 0, 75), sig("saltRejection", "Rechazo sales", "%", 99.4, 0.2, 98, 99.8), sig("permeateTds", "SDT permeado", "mg/l", 280, 25, 100, 500), sig("dpTmp", "ΔP tren", "bar", 1.8, 0.3, 0, 4)],
    help: `${name}: tren de membranas de ósmosis inversa de agua de mar. El recovery, el rechazo de sales y el ΔP (ensuciamiento/fouling) son los indicadores de salud clave — alimentan el mantenimiento predictivo (CIP/reemplazo).` }];
}

// ── Derivados ────────────────────────────────────────────────────────────────
export const areaByCode = Object.fromEntries(PLANT.areas.map((a) => [a.code, a]));
export const equipmentByArea = (code: string) => PLANT.equipment.filter((e) => e.areaCode === code);
export const flId = (areaCode: string) => `fl_${areaCode.toLowerCase()}`;
export const eqId = (code: string) => `eq_${code.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
