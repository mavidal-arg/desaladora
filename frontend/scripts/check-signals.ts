// Chequeo rápido de la fuente única de señales. No hay framework de test en esta
// app; se corre a mano:  npx tsx scripts/check-signals.ts
//
// (1) `simValueAt` es determinista: mismo (signalId, t) → mismo valor.
// (2) Todo slug de SIGNAL_LABELS y TWIN_SIGNALS existe en plant-config o es una
//     señal virtual conocida del gemelo (no queda un label huérfano).

import { simValueAt } from "../src/lib/sim";
import { SIGNAL_LABELS } from "../src/lib/signal-labels";
import { TWIN_SIGNALS } from "../src/lib/twin-types";
import { PLANT } from "../src/lib/plant-config";

let failures = 0;
const fail = (msg: string) => { console.error("  ✗", msg); failures++; };
const ok = (msg: string) => console.log("  ✓", msg);

// (1) Determinismo
{
  const cases: [string, number, number, number][] = [
    ["eq_a251_rf", 1_726_000_000_000, 6e13, 9e11],
    ["sig_eq_a111_flow", 1_726_000_123_456, 1300, 60],
    ["sig_eq_a251_recovery", 1_726_000_999_999, 45, 1.5],
  ];
  let allEq = true;
  for (const [id, t, c, a] of cases) {
    const x = simValueAt(id, t, c, a);
    const y = simValueAt(id, t, c, a);
    if (x !== y) { allEq = false; fail(`simValueAt no determinista para ${id}: ${x} ≠ ${y}`); }
    if (!Number.isFinite(x)) { allEq = false; fail(`simValueAt no finito para ${id}`); }
  }
  // dos instantes distintos → debe moverse (no está congelado)
  const m1 = simValueAt("eq_a251_sec", 1_726_000_000_000, 3, 0.06);
  const m2 = simValueAt("eq_a251_sec", 1_726_000_030_000, 3, 0.06);
  if (m1 === m2) { allEq = false; fail("simValueAt no varía entre instantes distintos"); }
  if (allEq) ok("simValueAt determinista y vivo");
}

// (2) Registro sin huérfanos
{
  const cfgSlugs = new Set<string>();
  for (const e of PLANT.equipment) for (const s of e.signals) cfgSlugs.add(s.signal);
  const virtual = new Set(Object.keys(TWIN_SIGNALS)); // rf, rfNorm, sec, tmp, ndp, piOsmotic, beta
  const known = new Set([...cfgSlugs, ...virtual]);

  const orphans = Object.keys(SIGNAL_LABELS).filter((slug) => !known.has(slug));
  if (orphans.length) fail(`SIGNAL_LABELS con slugs que no existen en plant-config ni en el gemelo: ${orphans.join(", ")}`);
  else ok(`SIGNAL_LABELS: ${Object.keys(SIGNAL_LABELS).length} slugs, todos conocidos`);

  // toda señal virtual del gemelo debería tener unidad declarada
  const noUnit = Object.entries(TWIN_SIGNALS).filter(([, u]) => u === undefined);
  if (noUnit.length) fail(`TWIN_SIGNALS sin unidad: ${noUnit.map(([k]) => k).join(", ")}`);
  else ok(`TWIN_SIGNALS: ${Object.keys(TWIN_SIGNALS).length} señales virtuales con unidad`);
}

if (failures) { console.error(`\n${failures} chequeo(s) fallido(s).`); process.exit(1); }
console.log("\nOK — fuente única de señales consistente.");
