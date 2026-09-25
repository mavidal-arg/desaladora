"use client";

import { useEffect, useRef, useState } from "react";
import type { EquipmentDef, SignalDef } from "@/lib/plant-config";
import { LIVE_UNIFIED } from "@/lib/flags";
import { apiUrl } from "@/lib/utils";

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

// Un equipo puede no tener señales: se da de alta en el inventario y su
// instrumentación se define después. Antes esto rompía el mímico con un
// `undefined.min`.
const SIN_SENAL: SignalDef = { signal: "", label: "Sin instrumentar", unit: "", base: 0, amp: 0 };

function primaryOf(e: EquipmentDef): SignalDef {
  return e.signals.find((s) => s.signal === e.primarySignal) ?? e.signals[0] ?? SIN_SENAL;
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
//
// `equipment` es obligatorio a propósito: antes caía por defecto en la constante
// compilada, así que el mímico y las vistas AR mostraban el plantel del template
// aunque el cliente hubiera editado el suyo. Sin default, el compilador marca a
// cualquiera que no le pase la config viva.
export function useSignalSim(equipment: EquipmentDef[], intervalMs = 2500) {
  const [live, setLive] = useState<Record<string, LiveValue>>(() =>
    LIVE_UNIFIED ? {} : Object.fromEntries(equipment.map((e) => [e.code, sample(e)]))
  );
  const ref = useRef<number | null>(null);

  useEffect(() => {
    // Fuente única: pollear el valor primario "vivo" de toda la flota.
    if (LIVE_UNIFIED) {
      if (equipment.length === 0) { setLive({}); return; }
      let alive = true;
      const poll = async () => {
        try {
          const res = await fetch(apiUrl("/api/live"));
          if (res.ok && alive) setLive(await res.json());
        } catch { /* red intermitente: mantener último */ }
      };
      poll();
      ref.current = window.setInterval(poll, Math.max(intervalMs, 4000));
      return () => { alive = false; if (ref.current) window.clearInterval(ref.current); };
    }
    const tick = () =>
      setLive(Object.fromEntries(equipment.map((e) => [e.code, sample(e)])));
    setLive(Object.fromEntries(equipment.map((e) => [e.code, sample(e)])));
    ref.current = window.setInterval(tick, intervalMs);
    return () => { if (ref.current) window.clearInterval(ref.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, equipment.length]);

  return live;
}
