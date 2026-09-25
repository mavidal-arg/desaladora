"use client";

// useSceneSignals — adapta la física viva del Gemelo Digital (useTwinLive) al
// SignalMap que consume la escena 3D (misa-3d-twin-scene). Los anchors del GLB
// (anchor:<code>:<signal>) se resuelven contra este mapa por (asset_code, signal).
//
// Fuente viva: useTwinLive() → { "A25-1": {rf,tmp,sec,foulFrac}, ... } por rack RO.
// El ERI no está instrumentado en el sim → recovery se muestra como valor de
// contexto [inferencia]. Reusa la severidad por umbrales de scene-config.

import { useMemo } from "react";
import { useTwinLive } from "@/lib/useTwinLive";
import type { EquipmentDef } from "@/lib/plant-config";

export type LiveValue = { value: number; unit?: string; ts?: number };

/** value/unit por (asset_code → signal). p.ej. signals["A25-1"]["tmp"] */
export type SignalMap = Record<string, Record<string, LiveValue>>;

/** Umbrales de severidad + display por señal (de scene-config). */
export type SceneConfig = {
  signals?: Record<
    string,
    { label?: string; unit?: string; warn?: number; crit?: number; invert?: boolean }
  >;
};

// Labels CORTOS para los chips flotantes (los verbosos de signal-labels.ts son
// para tablas/tooltips). Unit cae al que trae el LiveValue.
const SHORT: Record<string, { label: string; unit: string }> = {
  tmp: { label: "TMP", unit: "bar" },
  sec: { label: "SEC", unit: "kWh/m³" },
  rf: { label: "Rf", unit: "×10¹³/m" },
  beta: { label: "β", unit: "" },
  recovery: { label: "Recovery", unit: "%" },
};

export function signalMeta(signal: string): { label: string; unit: string } {
  return SHORT[signal] ?? { label: signal, unit: "" };
}

/** ok|warn|crit|idle desde los umbrales de scene-config (invert = menor es peor). */
export function severityTone(
  signal: string,
  value: number | undefined,
  config?: SceneConfig,
): "ok" | "warn" | "crit" | "idle" {
  if (value == null || !Number.isFinite(value)) return "idle";
  const t = config?.signals?.[signal];
  if (!t || (t.warn == null && t.crit == null)) return "ok";
  const worse = (a: number, b: number) => (t.invert ? a <= b : a >= b);
  if (t.crit != null && worse(value, t.crit)) return "crit";
  if (t.warn != null && worse(value, t.warn)) return "warn";
  return "ok";
}

/** Umbrales de la escena RO (espejo de misa-3d-twin-scene/examples/ro_scene.yaml). */
export const RO_SCENE_CONFIG: SceneConfig = {
  signals: {
    tmp: { warn: 62, crit: 66 },
    sec: { warn: 3.2, crit: 3.4 },
    recovery: { warn: 42, crit: 40, invert: true },
  },
};

/** SignalMap vivo (refresco ~2,5 s) derivado de useTwinLive para los racks RO + ERI. */
export function useSceneSignals(equipment: EquipmentDef[]): SignalMap {
  const live = useTwinLive(equipment);
  return useMemo(() => {
    const map: SignalMap = {};
    for (const [code, t] of Object.entries(live)) {
      map[code] = {
        tmp: { value: t.tmp.value, unit: t.tmp.unit },
        sec: { value: t.sec.value, unit: t.sec.unit },
        rf: { value: t.rf.value, unit: t.rf.unit },
      };
    }
    // ERI recovery: valor de contexto (no instrumentado en el sim). [inferencia]
    const avgFoul =
      Object.values(live).reduce((s, t) => s + t.foulFrac, 0) / (Object.keys(live).length || 1);
    map["ERI-1"] = { recovery: { value: Math.round((46 - avgFoul * 8) * 10) / 10, unit: "%" } };
    return map;
  }, [live]);
}
