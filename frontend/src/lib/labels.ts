// ─────────────────────────────────────────────────────────────────────────────
// Capa de traducción de DISPLAY (es). Los VALORES en DB quedan en inglés
// (estables para adapters/real SAP-PI); acá se traducen sólo para mostrar.
// Toda función cae al valor original si no encuentra traducción.
// ─────────────────────────────────────────────────────────────────────────────

const map = (dict: Record<string, string>) => (v: string | null | undefined): string => {
  if (v == null) return "";
  return dict[v] ?? dict[v.toLowerCase()] ?? v;
};

// Estado de orden de trabajo. Faltaba: el panel pintaba los valores crudos
// (`pending`, `in_progress`, `approved`) al lado de tarjetas en español.
export const esWoStatus = map({
  pending: "Pendiente", approved: "Aprobada", in_progress: "En ejecución",
  completed: "Completada", cancelled: "Cancelada",
});

// Estado de equipo
export const esEquipStatus = map({
  running: "En marcha", idle: "Detenido", maintenance: "En mantención",
  stopped: "Fuera de servicio", fault: "En falla",
});

// Tipo de orden de trabajo
export const esWoType = map({
  preventive: "Preventivo", corrective: "Correctivo", emergency: "Emergencia", predictive: "Predictivo",
});

// Estrategia de plan de mantenimiento
export const esStrategy = map({
  monthly: "Mensual", runtime: "Por horas de marcha", daily: "Diario", predictive: "Por condición", weekly: "Semanal",
});

// Tendencia predictiva
export const esTrend = map({
  up: "En mejora", stable: "Estable", down: "A la baja", declining: "En deterioro",
});

// Categorías de repuesto
export const esPartCategory = map({
  Seals: "Sellos", Bearings: "Rodamientos", Belts: "Correas", Filters: "Filtros",
  Instrumentation: "Instrumentación", Valves: "Válvulas", Gaskets: "Juntas",
});

// Categorías / tipos de equipo
export const esEquipCategory = map({
  Pumps: "Bombas", Motors: "Motores", Boilers: "Calderas", Fans: "Ventiladores",
  "Heat Exchangers": "Intercambiadores", Kilns: "Hornos", Turbines: "Turbinas",
  "Paper Machines": "Máquinas", Compressors: "Compresores", "Storage Tanks": "Tanques",
  "Electrical Equipment": "Equipo eléctrico", Debarkers: "Descortezadores", Chippers: "Astilladores",
  Conveyors: "Cintas transportadoras", Digesters: "Digestores", Washers: "Lavadores",
  Screens: "Rejas", Reactors: "Reactores", Agitators: "Agitadores",
  "Marine Intake": "Captación marina", Filters: "Filtros", Mixers: "Mezcladores",
  "Energy Recovery": "Recuperación de energía", Contactors: "Contactores",
  Dosing: "Dosificación", "Marine Discharge": "Descarga marina", Membranes: "Membranas",
});

// Cualquier categoría (repuesto o equipo)
export const esCategory = (v: string | null | undefined) => esPartCategory(v) !== (v ?? "") ? esPartCategory(v) : esEquipCategory(v);

// Pañol / sala de herramientas
export const esToolRoom = map({
  "Mechanical Tool Room": "Pañol Mecánico", "Predictive Lab": "Laboratorio Predictivo",
  "Electrical Tool Room": "Pañol Eléctrico",
});

// Tipo de documento SE Suite
export const esDocType = map({
  SOP: "Procedimiento (SOP)", "P&ID": "P&ID", safety: "Seguridad", manual: "Manual",
});

// Frecuencia de inspección
export const esFrequency = map({ daily: "Diaria", weekly: "Semanal", monthly: "Mensual", annual: "Anual" });

// Categoría de ruta de inspección
export const esInspectionCategory = map({ patrol: "Ronda", special: "Equipos especiales", measuring: "Instrumentos" });
