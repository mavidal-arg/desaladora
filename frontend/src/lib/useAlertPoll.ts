"use client";

import { useEffect, useRef } from "react";
import { apiUrl } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// useAlertPoll — evaluación ambiente de las reglas de alerta mientras /alertas
// está abierta. Mismo patrón que useTwinLive.ts (setInterval del lado del
// cliente) — el motor de alertas es request-driven, no hay loop de servidor.
//
// El dedup real vive en el servidor (evaluateAndDispatch): este poll puede
// pegarle cada 8s sin miedo a reenviar WhatsApp/llamada de una alerta que
// sigue activa.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 8000;

export function useAlertPoll(onCreated: (count: number) => void, enabled = true) {
  const onCreatedRef = useRef(onCreated);
  useEffect(() => { onCreatedRef.current = onCreated; });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(apiUrl("/api/twin/evaluate-alerts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "poll" }),
        });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const n = Array.isArray(body?.created) ? body.created.length : 0;
        if (n > 0) onCreatedRef.current(n);
      } catch {
        // silencioso: un poll fallido no interrumpe la demo, el próximo reintenta
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [enabled]);
}
