"use client";

// DataAnchor — a floating live-value label pinned to a 3D point (an anchor node).
// Uses drei <Html> to project a DOM label onto the 3D position. Severity color is
// resolved from scene thresholds; unit/label come from the signal dictionary.

import { Html } from "@react-three/drei";
import { signalMeta, severityTone, type LiveValue, type SceneConfig } from "@/lib/useSceneSignals";

const TONE_STYLE: Record<string, { dot: string; ring: string }> = {
  ok: { dot: "#22c55e", ring: "rgba(34,197,94,0.35)" },
  warn: { dot: "#f59e0b", ring: "rgba(245,158,11,0.35)" },
  crit: { dot: "#ef4444", ring: "rgba(239,68,68,0.4)" },
  idle: { dot: "#94a3b8", ring: "rgba(148,163,184,0.3)" },
};

function fmt(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

export function DataAnchor({
  position,
  assetCode,
  signal,
  live,
  config,
}: {
  position: [number, number, number];
  assetCode: string;
  signal: string;
  live?: LiveValue;
  config?: SceneConfig;
}) {
  const meta = signalMeta(signal);
  const tone = severityTone(signal, live?.value, config);
  const c = TONE_STYLE[tone] ?? TONE_STYLE.idle;

  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <div
        className="pointer-events-none select-none whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] leading-tight shadow-lg"
        style={{
          background: "rgba(10,12,15,0.86)",
          borderColor: c.ring,
          color: "#e5e7eb",
          transform: "translateY(-6px)",
        }}
      >
        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c.dot }} />
        <span className="text-white/60">{assetCode}</span>{" "}
        <span className="text-white/80">{meta.label}</span>{" "}
        <span className="font-semibold" style={{ color: c.dot }}>
          {fmt(live?.value)}
          <span className="ml-0.5 text-[9px] font-normal text-white/50">{live?.unit ?? meta.unit}</span>
        </span>
      </div>
    </Html>
  );
}
