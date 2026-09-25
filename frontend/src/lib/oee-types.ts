// ─────────────────────────────────────────────────────────────────────────────
// OEE / Eficiencia RO — tipos y constantes del módulo de producción.
// Portado del análisis de EQR-APP1 (Módulo OEE de planta desaladora), mapeado
// al proceso de la desaladora-coquimbo: los "trenes RO" son los racks A25-x
// que el plant-config ya modela (Equipment category="Membranes").
// ─────────────────────────────────────────────────────────────────────────────

/** Trenes RO = racks de ósmosis inversa del plant-config. */
export const RO_TRAINS = ["A25-1", "A25-2", "A25-3", "A25-4"] as const;
export type TrainCode = (typeof RO_TRAINS)[number];

/**
 * Capacidad nominal de permeado por tren (m³/h). [inferencia]
 * Derivado del balance: captación 800 l/s · recovery 45% ≈ 360 l/s de permeado
 * ≈ 31.100 m³/día repartidos en 4 racks ≈ 324 m³/h por tren. Validar contra la
 * ingeniería ADV antes de congelar.
 */
export const RO_NOMINAL_M3H = 325;

/**
 * Límites de especificación del agua producto (permeado remineralizado).
 * [inferencia] Referencia NCh409 (Chile) + práctica de desalación de agua de mar.
 * Boro = 1.5 mg/l (NCh409). Validar contra la spec real de Aguas del Valle.
 */
export const QUALITY_LIMITS = {
  conductivityMax: 500, // µS/cm
  tdsMax: 500,          // mg/l
  phMin: 6.5,
  phMax: 8.5,
  boronMax: 1.5,        // mg/l
} as const;

export type DowntimeType = "planificada" | "no_planificada";
export type DowntimeCause = "mecanica" | "electrica" | "instrumentacion" | "proceso" | "externa";
export type QualityStatus = "conforme" | "no_conforme";
export type AlertLevel = "critico" | "advertencia" | "info";
export type AlertStatus = "activa" | "reconocida" | "resuelta";

export const DOWNTIME_TYPE_LABELS: Record<DowntimeType, string> = {
  planificada: "Planificada",
  no_planificada: "No planificada",
};

export const DOWNTIME_CAUSE_LABELS: Record<DowntimeCause, string> = {
  mecanica: "Mecánica",
  electrica: "Eléctrica",
  instrumentacion: "Instrumentación",
  proceso: "Proceso",
  externa: "Externa",
};

// ── Catálogo de causas raíz ──────────────────────────────────────────────────
//
// Una barra del Pareto es una CATEGORÍA (Proceso, Mecánica…), no una causa raíz.
// "Proceso: 1.530 min" no le dice a nadie qué hay que arreglar. Lo que se ataca
// es el modo de falla concreto que hay abajo — fouling, scaling, biofouling —,
// y cada uno tiene un indicador que lo anticipa antes de que pare el tren.
//
// Este catálogo es lo que el gráfico muestra al pasar el mouse por una columna:
// qué la compone realmente, y qué habría que estar mirando para adelantarse.
//
// Procedencia de los datos:
//   · Los cinco modos de PROCESO son doctrina estándar de desalación por ósmosis
//     inversa (ensuciamiento, incrustación, biofouling y sus indicadores).
//   · [inferencia] Los modos de mecánica / eléctrica / instrumentación / externa
//     son plausibles para esta planta pero NO están validados contra la
//     ingeniería de Aguas del Valle. Son supuesto pendiente de sondeo: antes de
//     congelarlos hay que confrontarlos con el historial real de la planta.

export type DowntimeSubCause = {
  /** Slug estable — es lo que se persiste en DowntimeEvent.subCause. */
  code: string;
  label: string;
  /** Mecanismo de falla: qué pasa físicamente y por qué termina en una parada. */
  description: string;
  /** Qué se ve subir o caer ANTES de la parada. Es el gancho a mantenimiento predictivo. */
  earlyIndicators: string;
};

export const DOWNTIME_SUBCAUSES: Record<DowntimeCause, DowntimeSubCause[]> = {
  proceso: [
    {
      code: "fouling",
      label: "Ensuciamiento (fouling) de membranas RO",
      description:
        "Acumulación de sólidos, coloides, materia orgánica u óxidos metálicos sobre la membrana cuando el pretratamiento pierde desempeño. Eleva la presión diferencial, reduce el caudal de permeado y obliga a bajar producción o detener el tren para limpieza química.",
      earlyIndicators:
        "ΔP normalizada en alza · caída de la permeabilidad y del flujo normalizado · intervalo entre CIP cada vez más corto",
    },
    {
      code: "scaling",
      label: "Incrustación mineral (scaling)",
      description:
        "Precipitación de sales por sobresaturación en el rechazo — carbonato y sulfato de calcio, sulfato de bario, sílice. Se origina en recuperación excesiva, dosificación deficiente de antiincrustante o control inadecuado de pH, y puede dañar la membrana de forma irreversible.",
      earlyIndicators:
        "pérdida de flujo con presión de operación en alza · desvíos de pH, recovery, LSI / S&DSI o dosis de antiincrustante",
    },
    {
      code: "biofouling",
      label: "Biofouling en trenes RO",
      description:
        "Formación y crecimiento de biopelícula bacteriana en filtros, cañerías y membranas, favorecida por desinfección deficiente, mala decloración o carga orgánica elevada. Sube rápido la presión de alimentación y la caída de presión, eleva el consumo energético y exige limpiezas frecuentes.",
      earlyIndicators:
        "ΔP de alimentación subiendo rápido · SEC (kWh/m³) en alza · intervalo entre CIP en caída · disponibilidad del tren en baja",
    },
    {
      code: "pretratamiento",
      label: "Degradación del pretratamiento (SDI / turbidez)",
      description:
        "El SDI o la turbidez del agua de alimentación se van fuera de rango porque cae la coagulación o el desempeño de la ultrafiltración. El tren de ósmosis aguas abajo tiene que bajar carga para no ensuciarse.",
      earlyIndicators:
        "SDI₁₅ en alza · turbidez del filtrado fuera de banda · TMP de UF subiendo entre CEB",
    },
    {
      code: "integridad",
      label: "Pérdida de integridad de membrana / o-ring",
      description:
        "Fuga interna en un vessel, un o-ring o un interconector: el permeado sale fuera de especificación sin que haya señales de ensuciamiento. A diferencia del fouling, no se recupera limpiando.",
      earlyIndicators:
        "conductividad de permeado en alza con presión normal · caída del rechazo de sales",
    },
    {
      code: "inspeccion_programada",
      label: "Inspección / muestreo de membranas (parada planificada)",
      description:
        "Apertura de vessels para inspección visual y muestreo de membranas, planificada. No es una falla: es tiempo de mantenimiento que sale del tiempo disponible, no de la disponibilidad.",
      earlyIndicators: "programada por el plan de mantenimiento",
    },
    {
      code: "cip_programado",
      label: "CIP programado (parada planificada)",
      description:
        "Limpieza química de recuperación del tren, planificada. No es una falla: es tiempo de mantenimiento que sale del tiempo disponible, no de la disponibilidad.",
      earlyIndicators: "programada por el plan de mantenimiento o por el umbral del gemelo digital",
    },
  ],
  mecanica: [
    {
      code: "sello_hpp",
      label: "Sello mecánico de bomba de alta presión",
      description:
        "Desgaste o falla del sello de la bomba de alta presión: fuga al exterior, pérdida de presión de alimentación al tren y riesgo de daño al eje si no se detiene.",
      earlyIndicators: "goteo en la caja del sello · caída de la presión de descarga · consumo de agua de sello en alza",
    },
    {
      code: "rodamiento",
      label: "Rodamiento / vibración fuera de norma",
      description:
        "Degradación de rodamientos o desalineación en bombas de alta presión o booster. La vibración se va fuera de la banda admisible (ISO 10816) y obliga a parar antes de la falla catastrófica.",
      earlyIndicators: "vibración RMS en alza · temperatura de descanso subiendo · armónicos de falla en el espectro",
    },
    {
      code: "fuga_vessel",
      label: "Fuga en housing / vessel o acople",
      description:
        "Pérdida de estanqueidad en un porta-membranas, un acople o una brida del tren. Obliga a despresurizar y aislar el rack para intervenir.",
      earlyIndicators: "caída de presión sin cambio de carga · presencia de agua en el skid · balance de caudales descuadrado",
    },
    {
      code: "valvula_rechazo",
      label: "Válvula de rechazo o actuador",
      description:
        "Falla o agarrotamiento de la válvula que regula el rechazo, o de su actuador. El recovery deja de ser controlable y el tren no puede sostener el punto de operación.",
      earlyIndicators: "recovery oscilando · discrepancia entre consigna y posición · tiempo de carrera del actuador en alza",
    },
    {
      code: "eri",
      label: "Desgaste del recuperador de energía (ERI)",
      description:
        "Degradación del dispositivo de recuperación de energía del rechazo. Sube el consumo específico y baja la presión que el ERI devuelve al circuito.",
      earlyIndicators: "SEC (kWh/m³) en alza sin cambio de producción · caída de la eficiencia del ERI · ruido o vibración en el equipo",
    },
  ],
  electrica: [
    {
      code: "vdf_disparo",
      label: "Disparo de variador (VDF)",
      description:
        "El variador de la bomba de alta presión dispara por sobrecorriente, sobretensión o falla de bus DC, y saca el tren de servicio hasta el reset y rearranque.",
      earlyIndicators: "corriente de motor en alza a igual carga · alarmas recurrentes del VDF · temperatura del gabinete subiendo",
    },
    {
      code: "hueco_tension",
      label: "Hueco o caída de tensión en media tensión",
      description:
        "Perturbación en la alimentación de media tensión que hace disparar protecciones aguas abajo. Afecta a varios equipos a la vez.",
      earlyIndicators: "registros de calidad de energía · disparos simultáneos en más de un tren · desbalance de tensión",
    },
    {
      code: "falla_motor",
      label: "Falla de motor (aislación, sobrecalentamiento, desbalance)",
      description:
        "Degradación de la aislación, sobrecalentamiento o desbalance de fases en el motor de una bomba principal. Termina en disparo de la protección y parada del equipo.",
      earlyIndicators: "resistencia de aislación en caída · temperatura de bobinado en alza · desbalance de corriente entre fases",
    },
    {
      code: "contactor",
      label: "Contactor / protección térmica / MCC",
      description:
        "Falla de un contactor, una protección térmica o una celda del centro de control de motores. El equipo no arranca o se cae en operación.",
      earlyIndicators: "arranques fallidos · calentamiento en la celda (termografía) · número de maniobras sobre el límite del fabricante",
    },
  ],
  instrumentacion: [
    {
      code: "transmisor",
      label: "Deriva o descalibración de transmisor",
      description:
        "Un transmisor de presión o de conductividad se va de calibración. Genera una alarma falsa o un enclavamiento que para el tren sin que haya un problema de proceso real.",
      earlyIndicators: "desvío contra el instrumento patrón o contra un lazo redundante · lectura fuera de rango físico · fecha de calibración vencida",
    },
    {
      code: "caudalimetro",
      label: "Falla de caudalímetro",
      description:
        "Falla del medidor de caudal de permeado o de rechazo. El recovery se calcula mal y el control de proceso opera sobre un dato falso.",
      earlyIndicators: "balance de masa que no cierra · recovery fuera del rango físico · señal ruidosa o congelada",
    },
    {
      code: "sensor_ph_orp",
      label: "Sensor de pH / ORP del pretratamiento",
      description:
        "Falla o ensuciamiento del sensor de pH u ORP que gobierna la dosificación. La dosificación se va de rango y arrastra el problema a las membranas.",
      earlyIndicators: "deriva contra muestra de laboratorio · tiempo de respuesta del electrodo en alza · dosis del reactivo fuera de banda",
    },
    {
      code: "comunicacion",
      label: "Pérdida de comunicación PLC / SCADA o lazo 4-20 mA",
      description:
        "Caída del enlace con el PLC, falla de una tarjeta de E/S o corte de un lazo 4-20 mA. El operador pierde visibilidad o control y el enclavamiento lleva el tren a parada segura.",
      earlyIndicators: "señales congeladas o en calidad mala · errores de comunicación en el log del PLC · reintentos del enlace en alza",
    },
  ],
  externa: [
    {
      code: "corte_red",
      label: "Corte de suministro eléctrico de red",
      description:
        "Interrupción de la alimentación externa. La planta entra en parada de emergencia y el rearranque tiene su propia secuencia.",
      earlyIndicators: "avisos de la distribuidora · eventos previos de calidad de energía",
    },
    {
      code: "calidad_captacion",
      label: "Marea roja / bloom algal / turbidez en captación",
      description:
        "Evento de calidad del agua de mar — floración algal, alta turbidez por marejada — que obliga a bajar carga o suspender la captación para no arruinar el pretratamiento.",
      earlyIndicators: "turbidez y clorofila de captación en alza · alertas de la autoridad marítima o sanitaria · SDI de alimentación degradándose",
    },
    {
      code: "restriccion_despacho",
      label: "Restricción de despacho o consigna del cliente",
      description:
        "Parada por consigna: el estanque de producto está lleno o el cliente restringe el despacho. La planta baja carga por decisión comercial, no por falla.",
      earlyIndicators: "nivel del estanque de producto en alza · programa de despacho por debajo de la producción",
    },
    {
      code: "clima",
      label: "Clima y marejadas",
      description:
        "Condiciones de mar o clima que impiden operar la captación o las obras marinas con seguridad.",
      earlyIndicators: "pronóstico de marejadas · altura de ola sobre el límite operacional",
    },
  ],
};

/** Índice plano code → definición, para resolver una sub-causa sin recorrer el catálogo. */
export const SUBCAUSE_BY_CODE: Record<string, DowntimeSubCause> = Object.fromEntries(
  Object.values(DOWNTIME_SUBCAUSES).flat().map((s) => [s.code, s]),
);

/** Sub-causas válidas para una causa dada — la API valida contra esto. */
export function subCausesOf(cause: DowntimeCause): DowntimeSubCause[] {
  return DOWNTIME_SUBCAUSES[cause] ?? [];
}

/** Lo que se muestra cuando una parada quedó sin clasificar (filas previas al campo). */
export const UNCLASSIFIED_SUBCAUSE = { code: "sin_clasificar", label: "Sin clasificar" } as const;

export const ALERT_METRIC_LABELS: Record<string, string> = {
  oee: "OEE",
  availability: "Disponibilidad",
  performance: "Rendimiento",
  quality: "Calidad",
  conductivity: "Conductividad permeado",
  boron: "Boro permeado",
  tds: "SDT permeado",
  ph: "pH permeado",
  downtime: "Duración de parada",
  // Gemelo Digital — RUL hasta el próximo lavado (desal.ts / uf.ts).
  cip_days: "RUL CIP (días)",
  ceb_hours: "RUL CEB (horas)",
};

// ── Estructuras del resumen computado ────────────────────────────────────────

export type TrainOee = {
  code: string;
  name: string;
  status: string;         // running | idle | maintenance | stopped
  oee: number;            // %
  availability: number;   // %
  performance: number;    // %
  quality: number;        // %
  nominalM3h: number;
  actualM3h: number;
  downtimeMin: number;    // minutos no planificados en la ventana
  qualityConforme: number;
  qualityTotal: number;
};

/** Un evento de parada, resumido para mostrarlo dentro del detalle de una columna. */
export type ParetoEvent = {
  id: string;
  trainCode: string;
  type: DowntimeType;
  subCause: string | null;
  minutes: number;
  startTime: string; // ISO
  description: string;
};

/** Desglose de una columna del Pareto: cuánto aporta cada causa raíz concreta. */
export type ParetoSubCause = {
  code: string;
  label: string;
  minutes: number;
  events: number;
  pct: number; // % dentro de su categoría
};

export type ParetoCause = {
  cause: DowntimeCause;
  label: string;
  minutes: number;
  pct: number;    // % del total de downtime
  cumPct: number; // acumulado (curva de Pareto)
  events: number; // nº de paradas — la métrica alternativa del gráfico
  plannedMin: number;   // minutos de parada planificada dentro de la columna
  unplannedMin: number; // minutos de parada no planificada
  subCauses: ParetoSubCause[];
  eventList: ParetoEvent[];
};

export type OeeThresholds = { target: number; acceptable: number; critical: number };

export type OeeSummary = {
  window: { days: number; from: string; to: string };
  plant: {
    oee: number;
    availability: number;
    performance: number;
    quality: number;
    trainsOnline: number;
    trainsTotal: number;
    totalDowntimeMin: number;
    totalProductionM3d: number;
  };
  trains: TrainOee[];
  paretoCauses: ParetoCause[];
  pillarLoss: { availability: number; performance: number; quality: number }; // puntos OEE perdidos
  activeAlerts: number;
  thresholds: OeeThresholds;
};

/** Clasifica un OEE (o pilar) contra los umbrales del turno → color semántico. */
export function oeeBand(value: number, t: OeeThresholds): "ok" | "warn" | "crit" {
  if (value >= t.target) return "ok";
  if (value >= t.critical) return "warn";
  return "crit";
}
