"use client";

// SceneCanvas — SSR-safe entry point for the 3D twin.
//
// R3F's <Canvas> touches `window` and CANNOT render on the server, so the actual
// scene is loaded via next/dynamic with { ssr: false }. This wrapper is the only
// thing the rest of the app imports. It also owns the explicit height the canvas
// needs (a 0-height parent renders the canvas 0×0 — the classic blank-3D bug).
//
// Usage (e.g. inside a "Modelo 3D" tab):
//   import { apiUrl } from "@/lib/utils";
//   <SceneCanvas modelUrl={apiUrl("/twin/ro_skid.glb")} signals={signals} />

import dynamic from "next/dynamic";
import type { SignalMap } from "@/lib/useSceneSignals";
import type { SceneConfig } from "@/lib/useSceneSignals";

const TwinScene = dynamic(() => import("./TwinScene").then((m) => m.TwinScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      Cargando modelo 3D…
    </div>
  ),
});

export function SceneCanvas({
  modelUrl,
  signals,
  config,
  height = 560,
  dracoUrl,
  className,
}: {
  modelUrl: string;
  signals: SignalMap;
  config?: SceneConfig;
  /** Canvas height in px (or any CSS length via style). */
  height?: number;
  /** Draco decoder folder; defaults to apiUrl("/draco/") inside TwinScene. */
  dracoUrl?: string;
  className?: string;
}) {
  return (
    <div
      style={{ height }}
      className={
        "relative w-full overflow-hidden rounded-xl border border-border bg-[#0b0d10] " +
        (className ?? "")
      }
    >
      <TwinScene modelUrl={modelUrl} signals={signals} config={config} dracoUrl={dracoUrl} />
    </div>
  );
}
