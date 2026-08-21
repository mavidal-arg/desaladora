"use client";

import { useEffect, useRef, useState } from "react";
import { PLANT, type EquipmentDef } from "@/lib/plant-config";

// ─────────────────────────────────────────────────────────────────────────────
// useSignalSim — simulador cliente de la señal primaria de cada equipo.
//
// Datos FICTICIOS para demo: jitterea el valor nominal (base ± amp) de la señal
// primaria de cada equipo cada `intervalMs`. Respeta el estado operativo:
//   - stopped / maintenance → valor ~0 (equipo fuera de servicio)
//   - idle                  → valor a media carga, sin variación
//   - running               → oscila alrededor del nominal
// No hay integración real: reemplazar por fetch al adapter `real` en el futuro.
// ─────────────────────────────────────────────────────────────────────────────

export type LiveValue = { value: number; unit: string; label: string; pct: number };

function primaryOf(e: EquipmentDef) {
  return e.signals.find((s) => s.signal === e.primarySignal) ?? e.signals[0];
}

function sample(e: EquipmentDef): LiveValue {
  const s = primaryOf(e);
  let value: number;
  if (e.status === "stopped" || e.status === "maintenance") {
    value = s.min != null ? s.min : 0;
  } else if (e.status === "idle") {
    value = s.base * 0.5;
  } else {
    value = s.base + s.amp * (Math.random() - 0.5) * 2;
  }
  const min = s.min ?? 0;
  const max = s.max ?? s.base + s.amp * 4;
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 50;
  return { value: Math.round(value * 100) / 100, unit: s.unit, label: s.label, pct };
}

/** Devuelve un mapa { equipmentCode → LiveValue } que se refresca en vivo. */
export function useSignalSim(equipment: EquipmentDef[] = PLANT.equipment, intervalMs = 2500) {
  const [live, setLive] = useState<Record<string, LiveValue>>(() =>
    Object.fromEntries(equipment.map((e) => [e.code, sample(e)]))
  );
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const tick = () =>
      setLive(Object.fromEntries(equipment.map((e) => [e.code, sample(e)])));
    setLive(Object.fromEntries(equipment.map((e) => [e.code, sample(e)])));
    ref.current = window.setInterval(tick, intervalMs);
    return () => { if (ref.current) window.clearInterval(ref.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, equipment.length]);

  return live;
}
