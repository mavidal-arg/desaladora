// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL LABELS — diccionario slug de señal → etiqueta ES amigable + descripción
// física. Los slugs son los que viajan en los datos (Prisma / adapters), tomados
// de los `sig(...)` de plant-config.ts. Sirve para que la UI (p. ej. "Anomalías
// de parámetros" en /predictive) NO muestre slugs crudos como `dpTmp`.
//
// Fuente de labels: metadata `label` de plant-config.ts (replicada acá como
// subset estable, ya que este módulo se usa client-side y no queremos arrastrar
// toda la config de planta al bundle). Descripciones = definición de ingeniería.
// ─────────────────────────────────────────────────────────────────────────────

export type SignalLabel = { label: string; desc: string };

export const SIGNAL_LABELS: Record<string, SignalLabel> = {
  // ── Membranas RO ──
  dpTmp: {
    label: "ΔP transmembrana (ensuciamiento)",
    desc: "Caída de presión a través del tren de membranas; su aumento indica ensuciamiento/fouling y anticipa la necesidad de CIP.",
  },
  recovery: {
    label: "Recovery",
    desc: "Porcentaje del agua de alimentación que se convierte en permeado (agua producto).",
  },
  saltRejection: {
    label: "Rechazo de sales",
    desc: "Porcentaje de sales retenidas por la membrana; su caída indica deterioro de la membrana o mayor paso de sales.",
  },
  permeateTds: {
    label: "SDT de permeado",
    desc: "Sólidos disueltos totales en el permeado (mg/l); su aumento refleja menor rechazo de sales / calidad de agua producto.",
  },
  // ── Membranas UF ──
  // Ojo: la clave `tmp` la comparten los skids de UF (~0,6 bar) y el gemelo de
  // los trenes RO (~54 bar). La descripción vale para ambos, pero el régimen de
  // limpieza que anticipa NO es el mismo: en UF dispara un CEB, en RO un CIP.
  tmp: {
    label: "Presión transmembrana (TMP)",
    desc: "Presión neta a través de la membrana; su aumento refleja ensuciamiento. En ultrafiltración anticipa el próximo CEB (retrolavado químico, ciclo de horas); en ósmosis inversa, el próximo CIP (ciclo de semanas).",
  },
  flux: {
    label: "Flux",
    desc: "Caudal de permeado por unidad de área de membrana (LMH). La UF opera a flux constante, así que lo que se mueve es la TMP: la permeabilidad (flux / TMP) cae hasta que el CEB la recupera.",
  },
  turbidity: {
    label: "Turbidez de salida",
    desc: "Turbidez del agua tratada (NTU); su aumento indica ruptura de fibra o filtración deficiente (peor SDI para RO).",
  },
  // ── Gemelo digital / energía ──
  sec: {
    label: "Consumo específico (SEC)",
    desc: "Energía neta por m³ de permeado (kWh/m³), ya descontada la recuperación del ERI; KPI energético central de la desaladora.",
  },
  rf: {
    label: "Factor de ensuciamiento (Rf)",
    desc: "Resistencia de ensuciamiento normalizada del tren; su aumento sostenido anticipa la limpieza química (CIP).",
  },
  beta: {
    label: "Factor de polarización (β)",
    desc: "Polarización por concentración en la superficie de la membrana; valores altos aceleran el ensuciamiento.",
  },
  // ── Hidráulica / mecánica general ──
  pressure: {
    label: "Presión",
    desc: "Presión de operación del equipo (bar).",
  },
  flow: {
    label: "Caudal",
    desc: "Caudal de proceso a través del equipo.",
  },
  dp: {
    label: "Pérdida de carga",
    desc: "Caída de presión a través del filtro/equipo; su aumento indica colmatación o necesidad de lavado.",
  },
  level: {
    label: "Nivel",
    desc: "Nivel del estanque (%); refleja el balance de la línea entre etapas.",
  },
  tankLevel: {
    label: "Nivel de estanque",
    desc: "Nivel del estanque de reactivo (%); indica autonomía de dosificación.",
  },
  motorCurrent: {
    label: "Corriente de motor",
    desc: "Corriente consumida por el motor (A); su aumento anticipa sobrecarga o falla mecánica.",
  },
  load: {
    label: "Carga",
    desc: "Carga del equipo (%) respecto de su capacidad nominal.",
  },
  dose: {
    label: "Dosis",
    desc: "Dosis de reactivo químico inyectada al proceso.",
  },
  efficiency: {
    label: "Eficiencia",
    desc: "Eficiencia del equipo (%); para el ERI, fracción de presión recuperada del rechazo.",
  },
  // ── Calidad de agua / química ──
  ph: {
    label: "pH",
    desc: "Acidez/alcalinidad del agua; se ajusta en remineralización para dejar el agua apta como potable.",
  },
  tds: {
    label: "SDT",
    desc: "Sólidos disueltos totales (mg/l); mide la salinidad del agua.",
  },
  hardness: {
    label: "Dureza",
    desc: "Dureza del agua (mg/l); se recupera en la remineralización tras la RO.",
  },
  temperature: {
    label: "Temperatura",
    desc: "Temperatura del agua (°C); afecta la viscosidad y el desempeño de las membranas.",
  },
  // ── Eléctrico ──
  power: {
    label: "Potencia",
    desc: "Potencia eléctrica consumida (kW); la energía es el mayor costo operativo de la desaladora.",
  },
  voltage: {
    label: "Tensión",
    desc: "Tensión de la barra/alimentación eléctrica (V).",
  },
};

/** Etiqueta ES amigable de un slug de señal; cae al slug crudo si no está mapeado. */
export function signalLabel(slug: string): string {
  return SIGNAL_LABELS[slug]?.label ?? slug;
}

/** Descripción física de un slug de señal (undefined si no está mapeado). */
export function signalDesc(slug: string): string | undefined {
  return SIGNAL_LABELS[slug]?.desc;
}
