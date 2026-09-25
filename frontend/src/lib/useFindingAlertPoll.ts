"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";
import type { FindingSummary } from "@/lib/finding-treatment";

// ─────────────────────────────────────────────────────────────────────────────
// Poll GLOBAL del sumario de hallazgos — a diferencia de `useAlertPoll.ts`
// (que sólo corre mientras /alertas está abierta), este hook se monta una vez
// en el Shell y corre en CUALQUIER pantalla: es lo que hace que el banner de
// gravedad alta/crítica se vea sin tener que entrar a /hallazgos primero.
// 30s alcanza — un hallazgo de campo no cambia con la urgencia de un umbral
// de telemetría, no hace falta el poll de 8s de las alertas OEE.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 30000;

export function useFindingAlertPoll(): FindingSummary | null {
  const [summary, setSummary] = useState<FindingSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(apiUrl("/api/nonconformities/summary"));
        if (!res.ok || cancelled) return;
        setSummary(await res.json());
      } catch {
        // silencioso: un poll fallido no debe tapar el banner con un error, el próximo reintenta
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return summary;
}
