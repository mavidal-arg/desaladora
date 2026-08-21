"use client";

import { useEffect, useRef, useState } from "react";
import { PLANT, type EquipmentDef } from "@/lib/plant-config";
import type { LiveValue } from "@/lib/useSignalSim";

// ─────────────────────────────────────────────────────────────────────────────
// useTwinLive — física viva del Gemelo Digital para el overlay del mímico.
//
// [inferencia] Simulación coherente para el DEMO. Deriva Rf (ensuciamiento),
// TMP y SEC por rack RO a partir de la `health` de cada equipo en plant-config,
// con jitter cada `intervalMs`. NO es telemetría real.
//
// En operación real, este hook consumiría las señales VIRTUALES calculadas por
// el motor Python (contrato C2 de twin-types.ts) — p.ej. polleando
// `apiUrl("/api/twin/live")` que lee PiReading{rf,tmp,sec} por rack. El shape de
// retorno se mantiene compatible con `LiveValue` (value/unit/label/pct) para
// encajar en las mismas cards del mímico que usa `useSignalSim`.
//
// Convención de fouling: menor salud → más ensuciamiento → Rf/TMP/SEC más altos
// y más cerca del umbral de CIP (TWIN_THRESHOLDS.rfRisePct = 15%).
// ─────────────────────────────────────────────────────────────────────────────

/** Rf de membrana limpia (base de calibración). [inferencia] SW30HRLE-440. */
const RF_CLEAN = 3.0; // ×10¹³ 1/m — escala de presentación
const RF_RISE_LIMIT = 0.15; // fracción sobre la base que dispara CIP (= 15%)

export type TwinLive = {
  /** Resistencia por ensuciamiento (fouling) — señal líder de la salud RO. */
  rf: LiveValue;
  /** Presión transmembrana. */
  tmp: LiveValue;
  /** Consumo específico de energía neto (con ERI). */
  sec: LiveValue;
  /** Fracción de subida de Rf sobre la base (0 = limpia, 0.15 = umbral CIP). */
  foulFrac: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const jit = (amp: number) => amp * (Math.random() - 0.5) * 2;

/** Fracción de ensuciamiento derivada de la salud del equipo. [inferencia] */
function foulFractionOf(health: number) {
  return clamp((90 - health) * 0.011, 0, 0.25);
}

function sampleTwin(e: EquipmentDef): TwinLive {
  const foul = foulFractionOf(e.health) + jit(0.004);
  const rf = RF_CLEAN * (1 + foul);
  const tmp = 54 + foul * 40 + jit(0.4); // bar — sube con el fouling
  const sec = 2.75 + foul * 3.0 + jit(0.02); // kWh/m³ — sube con el fouling
  const rfPct = clamp((foul / RF_RISE_LIMIT) * 100, 0, 100);
  const tmpPct = clamp(((tmp - 45) / (68 - 45)) * 100, 0, 100);
  const secPct = clamp(((sec - 2.5) / (3.6 - 2.5)) * 100, 0, 100);
  return {
    rf: { value: Math.round(rf * 100) / 100, unit: "×10¹³/m", label: "Rf fouling", pct: rfPct },
    tmp: { value: Math.round(tmp * 10) / 10, unit: "bar", label: "TMP", pct: tmpPct },
    sec: { value: Math.round(sec * 100) / 100, unit: "kWh/m³", label: "SEC", pct: secPct },
    foulFrac: Math.round(foul * 1000) / 1000,
  };
}

/**
 * Devuelve un mapa { rackCode → TwinLive } refrescado en vivo, sólo para racks RO
 * (kind === "ro_rack"). `enabled=false` desactiva el intervalo (para no cargar
 * /overview cuando el overlay del gemelo no está pedido).
 */
export function useTwinLive(
  equipment: EquipmentDef[] = PLANT.equipment,
  intervalMs = 2500,
  enabled = true,
): Record<string, TwinLive> {
  const racks = equipment.filter((e) => e.kind === "ro_rack");
  const build = () => Object.fromEntries(racks.map((e) => [e.code, sampleTwin(e)]));
  const [live, setLive] = useState<Record<string, TwinLive>>(() => (enabled ? build() : {}));
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLive({});
      return;
    }
    setLive(build());
    ref.current = window.setInterval(() => setLive(build()), intervalMs);
    return () => { if (ref.current) window.clearInterval(ref.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, racks.length]);

  return live;
}
