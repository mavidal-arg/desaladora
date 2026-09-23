"use client";

import { useCallback, useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/utils";
import type { InboxItem } from "@/lib/alert-inbox";

// ─────────────────────────────────────────────────────────────────────────────
// Poll GLOBAL del canal in-app. Mismo criterio que `useFindingAlertPoll`: vive
// en el Shell y corre en CUALQUIER pantalla — a diferencia de `useAlertPoll`,
// que sólo existe mientras /alertas está abierta y por eso nunca sirvió para
// enterarse de nada sin estar ya mirando la página de alertas.
//
// El estado es un store de módulo, no `useState` por componente, porque el
// Shell monta TRES campanitas (sidebar expandido, riel de íconos, barra
// superior móvil): sólo una se ve según el ancho, pero las tres se renderizan.
// Con estado por componente eran tres intervalos y tres fetch cada 15 s, y los
// badges podían mostrar números distintos entre sí. Acá hay un solo intervalo,
// contado por suscriptores, y todas leen lo mismo.
//
// 15 s: una observación de terreno no necesita los 8 s del evaluador de
// umbrales, pero 30 s se siente lento para algo que aparece como burbuja.
//
// El "visto" es por navegador (localStorage). La fila in-app es un broadcast
// único para todos, y la app asigna identidades demo rotativas por sesión, así
// que un leído por usuario en el server engañaría más de lo que ayudaría.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 15000;
const SEEN_KEY = "desal.inapp.seen";

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set(); // modo privado / storage bloqueado: como si nada estuviera visto
  }
}

function writeSeen(ids: Set<string>) {
  try {
    // Se recorta para que no crezca sin techo en una sesión larga.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // sin storage no se persiste el visto; la burbuja sigue funcionando
  }
}

// ── Store de módulo ─────────────────────────────────────────────────────────

/** Referencia estable: `useSyncExternalStore` compara por identidad. */
const VACIO: InboxItem[] = [];

let items: InboxItem[] = VACIO;
let seen: Set<string> | null = null;
let snapshot: { items: InboxItem[]; unseen: InboxItem[] } = { items: VACIO, unseen: VACIO };
let timer: number | null = null;
const suscriptores = new Set<() => void>();

function recomputar() {
  const s = seen ?? new Set<string>();
  snapshot = { items, unseen: items.filter((i) => !s.has(i.id)) };
  for (const fn of suscriptores) fn();
}

async function traer(): Promise<void> {
  try {
    const res = await fetch(apiUrl("/api/alerts/inbox"));
    if (!res.ok) return;
    const data = (await res.json()) as { items: InboxItem[] };
    items = data.items ?? VACIO;
    recomputar();
  } catch {
    // silencioso: un poll fallido no rompe la pantalla, el próximo reintenta
  }
}

function suscribir(fn: () => void): () => void {
  if (seen === null) seen = readSeen();
  suscriptores.add(fn);
  if (timer === null) {
    traer();
    timer = window.setInterval(traer, POLL_MS);
  }
  return () => {
    suscriptores.delete(fn);
    if (suscriptores.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const SNAPSHOT_SSR = { items: VACIO, unseen: VACIO };

// ── Hook ────────────────────────────────────────────────────────────────────

export type InAppAlerts = {
  items: InboxItem[];
  unseen: InboxItem[];
  markSeen: (ids?: string[]) => void;
  refresh: () => void;
};

export function useInAppAlertPoll(): InAppAlerts {
  const estado = useSyncExternalStore(
    suscribir,
    () => snapshot,
    () => SNAPSHOT_SSR,
  );

  const markSeen = useCallback((ids?: string[]) => {
    const s = seen ?? new Set<string>();
    for (const id of ids ?? items.map((i) => i.id)) s.add(id);
    seen = s;
    writeSeen(s);
    recomputar();
  }, []);

  const refresh = useCallback(() => {
    void traer();
  }, []);

  return { items: estado.items, unseen: estado.unseen, markSeen, refresh };
}
