import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLANT, flId, eqId } from "../src/lib/plant-config";

const pool = new Pool({
  connectionString:
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  max: 5,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

// Deterministic "now" so the seed is reproducible across restarts.
const NOW = new Date("2026-06-15T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);
// Deterministic pseudo-random in [0,1) from an integer seed.
const rnd = (s: number) => {
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const hashInt = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

async function main() {
  console.log(`Seeding ${PLANT.plant.name} (${PLANT.plant.code})…`);

  // ─── Functional locations (site + areas from plant-config) ───
  await upsertFL({ id: PLANT.plant.id, code: PLANT.plant.code, name: PLANT.plant.name, area: "Planta", criticality: "critical", parentId: null });
  for (const a of PLANT.areas) {
    await upsertFL({ id: flId(a.code), code: a.code, name: a.name, area: a.short, criticality: a.criticality, parentId: PLANT.plant.id });
  }

  // ─── Equipment + signals + 14 daily readings (from plant-config) ───
  for (const e of PLANT.equipment) {
    const id = eqId(e.code);
    await prisma.equipment.upsert({
      where: { id },
      update: { status: e.status, healthIndex: e.health, runtimeHours: e.runtime, specs: e.specs, category: e.category, name: e.name },
      create: {
        id, code: e.code, name: e.name, functionalLocationId: flId(e.areaCode), category: e.category,
        location: `${areaName(e.areaCode)} — ${e.name}`,
        manufacturer: e.manufacturer, model: e.model, serialNumber: `${e.manufacturer.slice(0, 2).toUpperCase()}-${1000 + (hashInt(e.code) % 9000)}`,
        installDate: day(-1200), commissionDate: day(-1160), warrantyExpiry: day(160),
        specs: e.specs, criticality: e.criticality, status: e.status, healthIndex: e.health, runtimeHours: e.runtime,
      },
    });
    let si = 0;
    for (const s of e.signals) {
      const sigId = `sig_${id}_${s.signal}`;
      await prisma.piSignal.upsert({
        where: { id: sigId },
        update: { unit: s.unit },
        create: { id: sigId, equipmentId: id, signal: s.signal, unit: s.unit },
      });
      for (let i = 13; i >= 0; i--) {
        const ts = day(-i);
        const value = round2(s.base + s.amp * Math.sin(i + si) + s.amp * 0.5 * (rnd(hashInt(sigId) + i * 7) - 0.5) * 2);
        const rid = `${sigId}_${i}`;
        await prisma.piReading.upsert({ where: { id: rid }, update: { value }, create: { id: rid, signalId: sigId, ts, value, quality: "good" } });
      }
      si++;
    }
  }

  // ─── Predictive profiles (1:1) ───
  const trendOf = (h: number) => (h < 70 ? "declining" : h < 85 ? "down" : "up");
  for (const e of PLANT.equipment) {
    const id = eqId(e.code);
    const configured = !["pile", "tank", "silo"].includes(e.kind);
    // Equipos con salud baja → anomalía sobre su primera señal + posible falla predicha.
    const anomalies = e.health < 78 ? [{ param: e.signals[e.signals.length - 1].signal, value: round2(e.signals[e.signals.length - 1].base * 1.3), delta: round2(e.signals[e.signals.length - 1].amp * 1.5) }] : [];
    await prisma.predictiveProfile.upsert({
      where: { equipmentId: id },
      update: { configured, healthScore: e.health, trend: trendOf(e.health), anomalies, predFailureDays: e.health < 68 ? 20 + (hashInt(e.code) % 20) : null },
      create: { id: `pp_${id}`, equipmentId: id, configured, healthScore: e.health, trend: trendOf(e.health), predFailureDays: e.health < 68 ? 20 + (hashInt(e.code) % 20) : null, anomalies },
    });
  }

  // ─── Work Orders (derivados: mantenimiento/predictivo según estado/salud) ───
  const assignees = ["Rodrigo Fuentes", "Patricia Rojas", "Carlos Ferreyra", "Ana Duarte", "Luis Cortés", null];
  let woN = 0;
  for (const e of PLANT.equipment) {
    const id = eqId(e.code);
    const specs: Array<{ type: string; status: string; priority: string; assIdx: number; opened: number; due: number | null; closed: number | null; est: number; act: number | null; desc: string }> = [];
    if (e.status === "maintenance") specs.push({ type: "corrective", status: "in_progress", priority: "high", assIdx: 2, opened: -5, due: 2, closed: null, est: 4200, act: null, desc: `${e.code} Intervención correctiva — parada de mantenimiento` });
    if (e.health < 75) specs.push({ type: "predictive", status: "pending", priority: e.health < 68 ? "critical" : "medium", assIdx: 5, opened: -3, due: 12, closed: null, est: 2600, act: null, desc: `${e.code} Acción predictiva por condición (salud ${e.health}%)` });
    if (e.criticality === "critical" && hashInt(e.code) % 2 === 0) specs.push({ type: "preventive", status: "completed", priority: "medium", assIdx: 0, opened: -28, due: -22, closed: -24, est: 1600, act: 1540, desc: `${e.code} Preventivo trimestral` });
    if (specs.length === 0 && hashInt(e.code) % 3 === 0) specs.push({ type: "preventive", status: "approved", priority: "low", assIdx: 5, opened: -6, due: 10, closed: null, est: 900, act: null, desc: `${e.code} Inspección programada` });
    for (const s of specs) {
      woN++;
      const wid = `wo_${String(woN).padStart(3, "0")}`;
      await prisma.workOrder.upsert({
        where: { id: wid },
        update: { status: s.status, assignee: assignees[s.assIdx] },
        create: {
          id: wid, code: `WO-2026-${String(woN).padStart(3, "0")}`, equipmentId: id, orderType: s.type, status: s.status, priority: s.priority,
          assignee: assignees[s.assIdx], description: s.desc, openedAt: day(s.opened), dueAt: s.due == null ? null : day(s.due),
          closedAt: s.closed == null ? null : day(s.closed), costEstimate: s.est, costActual: s.act,
        },
      });
    }
  }

  // ─── Maintenance plans (uno por equipo crítico/alto, subset) ───
  const strategies = [["monthly", "Mensual"], ["runtime", "Cada 2000 h"], ["daily", "Diario"], ["predictive", "Por condición"]] as const;
  let mpN = 0;
  for (const e of PLANT.equipment) {
    if (!["critical", "high"].includes(e.criticality)) continue;
    if (hashInt(e.code) % 3 === 2) continue; // subset
    mpN++;
    const st = strategies[hashInt(e.code) % strategies.length];
    await prisma.maintenancePlan.upsert({
      where: { id: `mp_${eqId(e.code)}` },
      update: { nextDueAt: day(1 + (hashInt(e.code) % 20)) },
      create: {
        id: `mp_${eqId(e.code)}`, equipmentId: eqId(e.code), strategy: st[0], intervalLabel: st[1],
        nextDueAt: day(1 + (hashInt(e.code) % 20)),
        taskList: ["Inspección general", `Chequeo de ${e.signals[0].label.toLowerCase()}`, "Lubricación / limpieza según aplique"],
      },
    });
  }
  console.log(`  ${woN} work orders, ${mpN} maintenance plans.`);

  // ─── Spare parts (para equipos rotativos) ───
  const rotating = PLANT.equipment.filter((e) => ["pump", "fan", "chipper", "debarker", "conveyor", "turbogen"].includes(e.kind));
  let spN = 0;
  const partKinds = [["Sello mecánico", "Seals", 320], ["Rodamiento", "Bearings", 210], ["Correa", "Belts", 95], ["Filtro", "Filters", 60]] as const;
  for (const e of rotating) {
    const pk = partKinds[hashInt(e.code) % partKinds.length];
    spN++;
    await prisma.sparePart.upsert({
      where: { id: `sp_${eqId(e.code)}` },
      update: { quantity: 2 + (hashInt(e.code) % 8) },
      create: {
        id: `sp_${eqId(e.code)}`, code: `SP-${e.code}`, name: `${pk[0]} — ${e.code}`, specification: `${e.manufacturer} OEM`,
        category: pk[1], equipmentId: eqId(e.code), quantity: 2 + (hashInt(e.code) % 8), safetyStock: 2, unit: "pcs",
        unitCost: pk[2], consumedLast30d: hashInt(e.code) % 4, replacedCount: 3 + (hashInt(e.code) % 6),
      },
    });
  }
  // Repuestos generales sin equipo
  for (const g of [["SP-INS-701", "Transmisor de presión Rosemount 3051", "Instrumentation", 520], ["SP-VLV-501", "Válvula de control 4\"", "Valves", 1400]] as const) {
    spN++;
    await prisma.sparePart.upsert({ where: { id: g[0] }, update: {}, create: { id: g[0], code: g[0], name: g[1], specification: "—", category: g[2], equipmentId: null, quantity: 4, safetyStock: 2, unit: "pcs", unitCost: g[3], consumedLast30d: 0, replacedCount: 1 } });
  }

  // ─── Tools ───
  const tools = [
    ["TL-001", "Llave dinamométrica 1000 Nm", "Mechanical Tool Room", "Estante A-1", true],
    ["TL-002", "Láser de alineación", "Mechanical Tool Room", "Estante A-2", false],
    ["TL-003", "Analizador de vibraciones", "Predictive Lab", "Estante B-1", true],
    ["TL-004", "Cámara termográfica", "Predictive Lab", "Estante B-2", true],
    ["TL-005", "Multímetro de pinza", "Electrical Tool Room", "Estante C-1", true],
    ["TL-006", "Extractor hidráulico de rodamientos", "Mechanical Tool Room", "Estante A-3", true],
  ] as const;
  for (const t of tools) await prisma.tool.upsert({ where: { id: t[0] }, update: { available: t[4] }, create: { id: t[0], code: t[0], name: t[1], toolRoom: t[2], storageLocation: t[3], available: t[4] } });

  // ─── SE Suite documents (SOP + P&ID + safety para equipos clave) ───
  const docEq = PLANT.equipment.filter((e) => ["critical", "high"].includes(e.criticality)).slice(0, 8);
  let dcN = 0;
  for (const e of docEq) {
    dcN++;
    await prisma.seDocument.upsert({
      where: { id: `doc_sop_${eqId(e.code)}` },
      update: {},
      create: {
        id: `doc_sop_${eqId(e.code)}`, code: `SOP-${e.code}`, equipmentId: eqId(e.code), title: `SOP — Operación y mantenimiento ${e.name}`,
        docType: "SOP", revision: `Rev. ${1 + (hashInt(e.code) % 6)}`, docDate: day(-Math.floor(rnd(hashInt(e.code)) * 200) - 10),
        url: `/docs/SOP-${e.code}.pdf`,
        steps: ["Bloquear y etiquetar (LOTO)", "Verificar condiciones seguras", `Ejecutar tarea sobre ${e.name}`, "Prueba funcional", "Restablecer operación"],
        safetyNotes: ["Verificar LOTO antes de intervenir", "Usar EPP acorde al área"],
      },
    });
    if (e.criticality === "critical") {
      dcN++;
      await prisma.seDocument.upsert({
        where: { id: `doc_saf_${eqId(e.code)}` }, update: {},
        create: { id: `doc_saf_${eqId(e.code)}`, code: `SAF-${e.code}`, equipmentId: eqId(e.code), title: `Procedimiento de Seguridad — ${e.name}`, docType: "safety", revision: "Rev. 3", docDate: day(-40), url: `/docs/SAF-${e.code}.pdf`, steps: [], safetyNotes: ["Plan de contingencia específico del equipo", "Permisos de trabajo en caliente"] },
      });
    }
  }

  // ─── Non-conformities (equipos en mantenimiento o baja salud) ───
  let ncN = 0;
  for (const e of PLANT.equipment.filter((x) => x.status === "maintenance" || x.health < 75)) {
    ncN++;
    await prisma.nonConformity.upsert({
      where: { id: `nc_${eqId(e.code)}` }, update: {},
      create: { id: `nc_${eqId(e.code)}`, code: `NC-2026-${String(ncN).padStart(3, "0")}`, equipmentId: eqId(e.code), severity: e.health < 68 ? "critical" : e.health < 75 ? "high" : "medium", description: `${e.name}: desviación detectada en ${e.signals[e.signals.length - 1].label.toLowerCase()}`, status: e.status === "maintenance" ? "in_review" : "open", raisedAt: day(-2 - (hashInt(e.code) % 8)) },
    });
  }
  console.log(`  ${spN} spare parts, ${dcN} documents, ${ncN} non-conformities.`);

  // ─── Inspection routes (patrol / special / measuring) — genérico, sin asumir tipos ───
  const lineEq = PLANT.equipment.filter((e) => ["INTK", "UF", "RO"].includes(e.areaCode)).slice(0, 4).map((e) => eqId(e.code));
  const pressureEq = PLANT.equipment.filter((e) => e.kind === "ro_rack" || e.category === "Pumps").slice(0, 3).map((e) => eqId(e.code));
  const anyEq = PLANT.equipment[0] ? [eqId(PLANT.equipment[0].code)] : [];
  await prisma.inspectionRoute.upsert({
    where: { id: "ir_001" }, update: { nextInspectionAt: day(1), code: "PR-LINE-DAILY", name: "Ronda Diaria Línea de Agua", inspector: "Luis Cortés" },
    create: { id: "ir_001", code: "PR-LINE-DAILY", name: "Ronda Diaria Línea de Agua", category: "patrol", frequency: "daily", nextInspectionAt: day(1), inspector: "Luis Cortés", equipmentIds: lineEq,
      checkpoints: [{ item: "Estado general", body: "Captación → RO", expected: "Operación normal", leakStatus: "none" }],
      tasks: [{ date: day(-1).toISOString(), inspector: "Luis Cortés", status: "completed", startedAt: "08:00" }, { date: day(0).toISOString(), inspector: "Luis Cortés", status: "in_progress", startedAt: "08:00" }] },
  });
  await prisma.inspectionRoute.upsert({
    where: { id: "ir_002" }, update: { nextInspectionAt: day(20), code: "SE-HP-001", name: "Equipos Especiales — Alta Presión (RO)", inspector: "Marcela Díaz" },
    create: { id: "ir_002", code: "SE-HP-001", name: "Equipos Especiales — Alta Presión (RO)", category: "special", frequency: "monthly", nextInspectionAt: day(20), inspector: "Marcela Díaz", equipmentIds: pressureEq,
      checkpoints: [{ item: "Prueba de presión / integridad", body: "Trenes RO", expected: "Sin fugas > 60 bar", leakStatus: null }],
      tasks: [{ date: day(-10).toISOString(), inspector: "Marcela Díaz", status: "completed", startedAt: "09:00" }] },
  });
  await prisma.inspectionRoute.upsert({
    where: { id: "ir_003" }, update: { nextInspectionAt: day(-2), code: "MD-CAL-001", name: "Calibración de Instrumentos" },
    create: { id: "ir_003", code: "MD-CAL-001", name: "Calibración de Instrumentos", category: "measuring", frequency: "monthly", nextInspectionAt: day(-2), inspector: "Inspector C", equipmentIds: anyEq,
      checkpoints: [{ item: "Calibración transmisor presión", body: "Rosemount 3051", expected: "± 0.075%", leakStatus: null }],
      tasks: [{ date: day(-32).toISOString(), inspector: "Inspector C", status: "completed", startedAt: "10:00" }] },
  });

  // ─── Plant config editable (singleton) ───
  // Preserva ediciones del Admin DENTRO de la misma versión de template; si el
  // template por defecto sube de versión, re-siembra el singleton con el nuevo default.
  {
    const existing = await prisma.plantConfig.findUnique({ where: { id: "singleton" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storedVersion = (existing?.data as any)?.version ?? 0;
    if (!existing || storedVersion < PLANT.version) {
      await prisma.plantConfig.upsert({
        where: { id: "singleton" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: { data: PLANT as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: { id: "singleton", data: PLANT as any },
      });
      console.log(`  PlantConfig singleton sembrado a v${PLANT.version}.`);
    }
  }

  // ─── Gemelo Digital — señales virtuales (fouling → CIP) por rack RO ───
  const twinAgg = await seedTwin();

  // ─── Proceso Desal — registro de producción (rollup 60 días) ───
  await seedDesal(twinAgg);

  // ─── OEE / Eficiencia RO — turnos, paradas, calidad, reglas y alertas ───
  await seedOee();

  console.log("Seed OK.");
}

// ─────────────────────────────────────────────────────────────────────────────
// OEE / Eficiencia RO — módulo de producción (portado del análisis EQR-APP1).
// Trenes RO = racks A25-1..4. Datos deterministas e idempotentes (ids fijos).
// La disponibilidad sale de las paradas; la calidad, de las mediciones conforme.
// ─────────────────────────────────────────────────────────────────────────────
async function seedOee() {
  // Turnos y metas
  const shifts = [
    { id: "shift_dia", name: "Turno Día", startHour: 7, endHour: 19, targetM3h: 320, oeeTarget: 85, oeeAcceptable: 75, oeeCritical: 60 },
    { id: "shift_noche", name: "Turno Noche", startHour: 19, endHour: 7, targetM3h: 300, oeeTarget: 82, oeeAcceptable: 72, oeeCritical: 58 },
  ];
  for (const s of shifts) await prisma.shiftDef.upsert({ where: { id: s.id }, update: s, create: s });

  const hm = (d: number, h: number) => new Date(day(d).getTime() + h * 3600000);
  // Paradas: causa raíz distribuida para un Pareto legible; A25-3 arrastra OEE.
  const downtime = [
    { id: "dt01", trainCode: "A25-3", type: "no_planificada", cause: "proceso", d: -11, h: 3, dur: 900, desc: "Baja de recovery por incremento de SDI en alimentación", validated: true, by: "Carlos Ferreyra" },
    { id: "dt02", trainCode: "A25-2", type: "no_planificada", cause: "electrica", d: -9, h: 22, dur: 420, desc: "Disparo VDF bomba alta presión, reset y arranque", validated: true, by: "Ana Duarte" },
    { id: "dt03", trainCode: "A25-1", type: "no_planificada", cause: "mecanica", d: -7, h: 10, dur: 240, desc: "Fuga en acople de tren, ajuste de sello", validated: true, by: "Carlos Ferreyra" },
    { id: "dt04", trainCode: "A25-4", type: "no_planificada", cause: "instrumentacion", d: -6, h: 14, dur: 180, desc: "Falla transmisor de conductividad permeado", validated: true, by: "Ana Duarte" },
    { id: "dt05", trainCode: "A25-3", type: "no_planificada", cause: "mecanica", d: -5, h: 8, dur: 300, desc: "Vibración en bomba booster, alineación", validated: false, by: "Carlos Ferreyra" },
    { id: "dt06", trainCode: "A25-2", type: "no_planificada", cause: "externa", d: -4, h: 2, dur: 150, desc: "Corte externo de suministro eléctrico", validated: true, by: "Ana Duarte" },
    { id: "dt07", trainCode: "A25-1", type: "no_planificada", cause: "proceso", d: -3, h: 16, dur: 210, desc: "Alto ΔP por ensuciamiento, purga y reinicio", validated: false, by: "Carlos Ferreyra" },
    { id: "dt08", trainCode: "A25-4", type: "no_planificada", cause: "electrica", d: -2, h: 5, dur: 120, desc: "Falla contactor, reemplazo", validated: false, by: "Ana Duarte" },
    // Planificadas (no penalizan disponibilidad, reducen tiempo planificado)
    { id: "dt09", trainCode: "A25-1", type: "planificada", cause: "mecanica", d: -8, h: 9, dur: 480, desc: "CIP programado tren RO-1", validated: true, by: "María Sosa" },
    { id: "dt10", trainCode: "A25-3", type: "planificada", cause: "proceso", d: -6, h: 9, dur: 420, desc: "Inspección y muestreo membranas", validated: true, by: "María Sosa" },
  ];
  for (const x of downtime) {
    const start = hm(x.d, x.h);
    const end = new Date(start.getTime() + x.dur * 60000);
    const data = { trainCode: x.trainCode, type: x.type, cause: x.cause, startTime: start, endTime: end, durationMin: x.dur, description: x.desc, validated: x.validated, validatedBy: x.validated ? x.by : null, createdBy: x.by, shiftId: x.h >= 7 && x.h < 19 ? "shift_dia" : "shift_noche" };
    await prisma.downtimeEvent.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } });
  }

  // Calidad del permeado (mayoría conforme; 2 no_conforme por conductividad/boro).
  const quality = [
    { id: "q01", t: "A25-1", d: -12, cond: 320, tds: 260, ph: 7.4, b: 0.9, st: "conforme" },
    { id: "q02", t: "A25-2", d: -11, cond: 360, tds: 290, ph: 7.5, b: 1.0, st: "conforme" },
    { id: "q03", t: "A25-3", d: -10, cond: 430, tds: 350, ph: 7.6, b: 1.2, st: "conforme" },
    { id: "q04", t: "A25-4", d: -9, cond: 300, tds: 250, ph: 7.3, b: 0.8, st: "conforme" },
    { id: "q05", t: "A25-3", d: -7, cond: 560, tds: 470, ph: 7.7, b: 1.35, st: "no_conforme" },
    { id: "q06", t: "A25-1", d: -6, cond: 335, tds: 270, ph: 7.4, b: 0.95, st: "conforme" },
    { id: "q07", t: "A25-2", d: -5, cond: 370, tds: 300, ph: 7.5, b: 1.05, st: "conforme" },
    { id: "q08", t: "A25-4", d: -4, cond: 310, tds: 255, ph: 7.3, b: 0.85, st: "conforme" },
    { id: "q09", t: "A25-3", d: -3, cond: 450, tds: 380, ph: 7.6, b: 1.7, st: "no_conforme" },
    { id: "q10", t: "A25-1", d: -2, cond: 330, tds: 265, ph: 7.4, b: 0.9, st: "conforme" },
    { id: "q11", t: "A25-2", d: -1, cond: 365, tds: 295, ph: 7.5, b: 1.0, st: "conforme" },
    { id: "q12", t: "A25-4", d: 0, cond: 305, tds: 250, ph: 7.3, b: 0.8, st: "conforme" },
  ];
  for (const q of quality) {
    const data = { trainCode: q.t, ts: hm(q.d, 11), conductivity: q.cond, tds: q.tds, ph: q.ph, boron: q.b, status: q.st, notes: q.st === "no_conforme" ? "Fuera de especificación — revisar membranas / dosificación" : "", createdBy: "Luis Cortés", shiftId: "shift_dia" };
    await prisma.qualityReading.upsert({ where: { id: q.id }, update: data, create: { id: q.id, ...data } });
  }

  // Reglas del motor de alertas
  const rules = [
    { id: "rule_oee_crit", name: "OEE bajo umbral crítico", metric: "oee", op: "lt", threshold: 60, level: "critico", enabled: true, trainCode: null },
    { id: "rule_oee_warn", name: "OEE bajo umbral aceptable", metric: "oee", op: "lt", threshold: 75, level: "advertencia", enabled: true, trainCode: null },
    { id: "rule_cond_high", name: "Conductividad permeado alta", metric: "conductivity", op: "gt", threshold: 500, level: "advertencia", enabled: true, trainCode: null },
    { id: "rule_boron_high", name: "Boro fuera de spec", metric: "boron", op: "gt", threshold: 1.5, level: "critico", enabled: true, trainCode: null },
    { id: "rule_downtime_long", name: "Parada prolongada (>6 h)", metric: "downtime", op: "gt", threshold: 360, level: "advertencia", enabled: true, trainCode: null },
  ];
  for (const r of rules) await prisma.alertRule.upsert({ where: { id: r.id }, update: r, create: r });

  // Instancias de alerta (workflow activa → reconocida → resuelta)
  const alerts = [
    { id: "alr01", ruleId: "rule_oee_crit", trainCode: "A25-3", level: "critico", status: "activa", message: "OEE Tren RO-3 bajo umbral crítico", d: -1, h: 6, ackBy: null, action: null },
    { id: "alr02", ruleId: "rule_boron_high", trainCode: "A25-3", level: "critico", status: "reconocida", message: "Boro permeado 1.7 mg/l en Tren RO-3 (límite 1.5)", d: -3, h: 12, ackBy: "María Sosa", action: "Muestreo de verificación en curso; evaluando reemplazo de membranas" },
    { id: "alr03", ruleId: "rule_cond_high", trainCode: "A25-3", level: "advertencia", status: "resuelta", message: "Conductividad 560 µS/cm en Tren RO-3", d: -7, h: 13, ackBy: "Ana Duarte", action: "Purga adicional; conductividad normalizada" },
    { id: "alr04", ruleId: "rule_downtime_long", trainCode: "A25-3", level: "advertencia", status: "reconocida", message: "Parada de 900 min en Tren RO-3 (proceso)", d: -11, h: 18, ackBy: "María Sosa", action: "Ajuste de pretratamiento (SDI)" },
    { id: "alr05", ruleId: "rule_oee_warn", trainCode: "A25-2", level: "advertencia", status: "activa", message: "OEE Tren RO-2 bajo umbral aceptable", d: 0, h: 8, ackBy: null, action: null },
  ];
  for (const a of alerts) {
    const ts = hm(a.d, a.h);
    const data = {
      ruleId: a.ruleId, trainCode: a.trainCode, level: a.level, status: a.status, message: a.message, ts,
      ackBy: a.ackBy, ackAt: a.ackBy ? new Date(ts.getTime() + 3600000) : null,
      resolvedAt: a.status === "resuelta" ? new Date(ts.getTime() + 7200000) : null,
      actionTaken: a.action,
    };
    await prisma.alertEvent.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
  }

  console.log(`  OEE: ${shifts.length} turnos, ${downtime.length} paradas, ${quality.length} mediciones, ${rules.length} reglas, ${alerts.length} alertas.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMELO DIGITAL — narrativa de ensuciamiento (fouling) → CIP → recuperación.
//
// [inferencia: sim narrativa] Serie determinista de 60 días de las señales
// virtuales por rack RO. Física APROXIMADA de primeros principios (marcada como
// supuesto de calibración hasta tener fichas del fabricante SW30HRLE-440):
//   • Resistencia en serie:  Rt = Rm + Rf   (Rf = ensuciamiento)
//   • Flujo permeado:        Jw = (TMP − Δπ)/(μ·Rt)  ⇒  TMP = Δπ + μ·Jw·(Rm+Rf)
//   • Presión osmótica:      Δπ = van 't Hoff, modulada por T y polarización β
//   • SEC:                   sube ~lineal con el ensuciamiento (más TMP → más kW)
// La curva de Rf crece hasta rf_base·1.15 (umbral TWIN_THRESHOLDS.rfRisePct) →
// se dispara un CipEvent (trigger "rf_threshold") y Rf cae de vuelta a la base.
// Cada rack está en una FASE distinta del ciclo para dar variedad al demo.
// ─────────────────────────────────────────────────────────────────────────────
const TWIN_DAYS = 60;
const TWIN_MU_REF = 0.89e-3; // μ agua a 25 °C (Pa·s) — [inferencia: sim]
const TWIN_JW = 1.2e-5; // flux permeado medio (m/s) — [inferencia: sim]
const TWIN_RM = 1.55e14; // resistencia membrana limpia (1/m) — [inferencia: sim]
const TWIN_RF_RISE = 0.15; // umbral: Rf 15 % sobre la base → CIP (= TWIN_THRESHOLDS.rfRisePct)
const TWIN_SEC_RISE = 0.28; // subida de SEC (kWh/m³) a lo largo del ciclo — [inferencia: sim]

// eqId(code)_signal → así lo mapea el bridge (contrato C2). Unidades en TWIN_SIGNALS.
const TWIN_SIGNAL_UNITS: Record<string, string> = {
  rf: "1/m", rfNorm: "1/m", sec: "kWh/m³", tmp: "bar", ndp: "bar", piOsmotic: "bar", beta: "",
};

// Cada rack en distinta fase del ciclo de ensuciamiento (tau0 = edad HOY):
//   A25-1: recién lavado (tau0 chico, lejos del umbral) — salud alta
//   A25-2: a mitad de ciclo
//   A25-3: cerca del umbral (tau0 ≈ cycle) — próximo CIP, salud baja
const TWIN_RACKS = [
  { code: "A25-1", rfBase: 5.6e13, cycle: 40, tau0: 5, secBase: 2.88, piBase: 27.2 },
  { code: "A25-2", rfBase: 5.85e13, cycle: 35, tau0: 18, secBase: 2.95, piBase: 27.3 },
  { code: "A25-3", rfBase: 6.1e13, cycle: 30, tau0: 27, secBase: 3.02, piBase: 27.5 },
  { code: "A25-4", rfBase: 5.7e13, cycle: 38, tau0: 12, secBase: 2.9, piBase: 27.35 },
] as const;

type TwinRackCfg = (typeof TWIN_RACKS)[number];

// Edad (días desde el último CIP) del rack en el día t. t = 0..TWIN_DAYS-1,
// t = TWIN_DAYS-1 es HOY (NOW). ageAt(HOY) = tau0. Sawtooth mod cycle.
function twinAge(cfg: TwinRackCfg, t: number): number {
  return (((t - (TWIN_DAYS - 1) + cfg.tau0) % cfg.cycle) + cfg.cycle) % cfg.cycle;
}

// Estado físico del rack en el día t (todas las señales virtuales + T).
function twinDay(cfg: TwinRackCfg, t: number) {
  const age = twinAge(cfg, t);
  const frac = age / (cfg.cycle - 1); // 0 (recién lavado) → 1 (umbral de CIP)
  const T = 15 + 1.2 * Math.sin(t * 0.7 + cfg.piBase); // °C, jitter determinista ±1.2
  const muT = TWIN_MU_REF * (1 + 0.026 * (25 - T)); // μ(T): más frío ⇒ más viscoso
  const rfTrue = cfg.rfBase * (1 + TWIN_RF_RISE * Math.pow(frac, 1.25)); // fouling normalizado
  const rfNorm = rfTrue; // Rf normalizado a 25 °C (ASTM D4516) — serie limpia
  const rf = rfTrue * (muT / TWIN_MU_REF); // Rf aparente (sin normalizar, inflado por T)
  const beta = 1.05 + 0.05 * frac; // polarización de concentración (sube con el fouling)
  const piOsmotic = cfg.piBase * ((T + 273) / 288) * beta; // Δπ van 't Hoff
  const ndp = (muT * TWIN_JW * (TWIN_RM + rfTrue)) / 1e5; // Net Driving Pressure (bar)
  const tmp = piOsmotic + ndp; // TMP = Δπ + μ·Jw·(Rm+Rf)
  const sec = cfg.secBase + TWIN_SEC_RISE * frac; // SEC neto (kWh/m³) sube con el fouling
  return { age, frac, T, rf, rfNorm, sec, tmp, ndp, piOsmotic, beta };
}

async function seedTwin(): Promise<Map<number, { rfAvg: number; secComputed: number; tmpAvg: number; cipDays: number }>> {
  const agg = new Map<number, { rfAvg: number; secComputed: number; tmpAvg: number; cipDays: number }>();
  let readingN = 0;
  let cipN = 0;

  for (const cfg of TWIN_RACKS) {
    const id = eqId(cfg.code); // A25-1 → eq_a251
    // PiSignal por cada señal virtual (id = eqId_signal, contrato C2 del bridge).
    for (const [signal, unit] of Object.entries(TWIN_SIGNAL_UNITS)) {
      const sigId = `${id}_${signal}`;
      await prisma.piSignal.upsert({
        where: { id: sigId },
        update: { unit },
        create: { id: sigId, equipmentId: id, signal, unit },
      });
    }
    // PiReading diario (60 días) de cada señal virtual.
    for (let t = 0; t < TWIN_DAYS; t++) {
      const d = twinDay(cfg, t);
      const ts = day(t - (TWIN_DAYS - 1)); // t=59 → HOY (day(0))
      const vals: Record<string, number> = {
        rf: d.rf, rfNorm: d.rfNorm, sec: round2(d.sec), tmp: round2(d.tmp),
        ndp: round2(d.ndp), piOsmotic: round2(d.piOsmotic), beta: round3(d.beta),
      };
      for (const [signal, value] of Object.entries(vals)) {
        const sigId = `${id}_${signal}`;
        const rid = `${sigId}_t${t}`;
        await prisma.piReading.upsert({
          where: { id: rid },
          update: { value },
          create: { id: rid, signalId: sigId, ts, value, quality: "good" },
        });
        readingN++;
      }
      // CIP: al inicio del día con age==0 (t>0) hubo un lavado (Rf resetea a base).
      if (t > 0 && d.age === 0) {
        const cipId = `cip_${id}_t${t}`;
        const rfBefore = cfg.rfBase * (1 + TWIN_RF_RISE); // pre-lavado ≈ umbral
        const rfAfter = cfg.rfBase; // post-lavado ≈ base limpia
        await prisma.cipEvent.upsert({
          where: { id: cipId },
          update: { rfBefore, rfAfter, secBefore: round2(cfg.secBase + TWIN_SEC_RISE), secAfter: round2(cfg.secBase) },
          create: {
            id: cipId, day: ts, trainCode: cfg.code,
            rfBefore, rfAfter,
            secBefore: round2(cfg.secBase + TWIN_SEC_RISE), secAfter: round2(cfg.secBase),
            trigger: "rf_threshold",
          },
        });
        cipN++;
      }
    }
  }

  // Rollup diario para ProductionLog: promedio de racks + RUL mínimo (tren más próximo al CIP).
  for (let t = 0; t < TWIN_DAYS; t++) {
    let rfSum = 0, secSum = 0, tmpSum = 0, minRul = Infinity;
    for (const cfg of TWIN_RACKS) {
      const d = twinDay(cfg, t);
      rfSum += d.rfNorm; secSum += d.sec; tmpSum += d.tmp;
      minRul = Math.min(minRul, cfg.cycle - d.age); // días hasta el umbral
    }
    const n = TWIN_RACKS.length;
    agg.set(t, { rfAvg: rfSum / n, secComputed: round2(secSum / n), tmpAvg: round2(tmpSum / n), cipDays: Math.max(0, Math.round(minRul)) });
  }

  console.log(`  Twin: ${readingN} lecturas virtuales (7 señales × ${TWIN_RACKS.length} racks × ${TWIN_DAYS} días), ${cipN} eventos CIP.`);
  return agg;
}

async function seedDesal(twinAgg?: Map<number, { rfAvg: number; secComputed: number; tmpAvg: number; cipDays: number }>) {
  const phase = (PLANT.flags?.phase as number) ?? 1;
  // Producto objetivo Fase 1 ≈ 990 m³/h → ~23.760 m³/día; recovery ~45%; kWh/m³ ~3.1 con ERI.
  const baseProd = phase >= 2 ? 34000 : 23760;
  // Ventana alargada a TWIN_DAYS para acompañar la serie del gemelo (t: 0..TWIN_DAYS-1, t=59=HOY).
  let n = 0;
  for (let t = 0; t < TWIN_DAYS; t++) {
    const i = (TWIN_DAYS - 1) - t; // días atrás (i=0 → HOY)
    n++;
    const jitter = (rnd(t * 7 + 3) - 0.5);
    const availability = round2(97 + jitter * 4);         // %
    const permeate = round2(baseProd * (availability / 100) * (1 + jitter * 0.03));
    const recovery = round2(45 + jitter * 2);             // %
    const feed = round2(permeate / (recovery / 100));
    const tw = twinAgg?.get(t);
    // Energía del día: si hay rollup del gemelo, usar el SEC computado (coherente con el fouling);
    // si no, fallback al modelo previo. [inferencia: sim narrativa]
    const energy = round2(tw ? tw.secComputed + jitter * 0.06 : 3.1 + jitter * 0.25); // kWh/m³ (con ERI)
    const productTds = round2(250 + jitter * 40);         // mg/l
    const rejection = round2(99.4 + jitter * 0.2);        // %
    const id = `pl_${String(n).padStart(2, "0")}`;
    await prisma.productionLog.upsert({
      where: { id },
      update: {
        day: day(-i), permeateM3: permeate, recoveryPct: recovery, energyKwhM3: energy, productTds, availability,
        rfAvg: tw?.rfAvg ?? null, secComputed: tw?.secComputed ?? null, tmpAvg: tw?.tmpAvg ?? null, cipDays: tw?.cipDays ?? null,
      },
      create: {
        id, day: day(-i), phase, feedM3: feed, permeateM3: permeate, recoveryPct: recovery, energyKwhM3: energy, productTds, saltRejection: rejection, availability,
        rfAvg: tw?.rfAvg ?? null, secComputed: tw?.secComputed ?? null, tmpAvg: tw?.tmpAvg ?? null, cipDays: tw?.cipDays ?? null,
      },
    });
  }
  console.log(`  Desal: ${n} días de producción (Fase ${phase})${twinAgg ? " + rollup gemelo" : ""}.`);
}

function areaName(code: string) { return PLANT.areas.find((a) => a.code === code)?.name ?? code; }

async function upsertFL(f: { id: string; code: string; name: string; area: string; criticality: string; parentId: string | null }) {
  await prisma.functionalLocation.upsert({ where: { id: f.id }, update: { name: f.name, criticality: f.criticality }, create: f });
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1); });
