"use client";

import { Info } from "lucide-react";
import { PLANT, type EquipmentDef, type PlantConfig } from "@/lib/plant-config";
import { useSignalSim, type LiveValue } from "@/lib/useSignalSim";
import { useTwinLive, type TwinLive } from "@/lib/useTwinLive";
import { scadaState, scadaFromHealth, SCADA_LEGEND, type ScadaStyle } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { ScadaSymbol } from "./symbols";
import { FLUID_HEX, FLUID_LABEL, type Fluid, type ScadaNode, type ScadaSection } from "./mimic-model";

const MEMBRANE_KINDS = new Set(["ro_rack", "membrane", "uf_skid"]);

// Estado SCADA de un equipo (misma regla que ProcessView): membranas en operación
// normal por salud; el resto por estado; mantenimiento/espera/detención priorizan estado.
function scadaFor(e: EquipmentDef): ScadaStyle {
  const abnormal = ["maintenance", "idle", "stopped", "down", "failed", "warning"].includes(e.status);
  if (MEMBRANE_KINDS.has(e.kind) && !abnormal) return scadaFromHealth(e.health);
  return scadaState(e.status);
}

const fmt = (v: number) => (Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 2 : 1));
const d = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

// Valor vivo a mostrar en el badge del nodo.
function nodeValue(node: ScadaNode, e: EquipmentDef, live?: LiveValue, tw?: TwinLive): LiveValue | undefined {
  if (node.valueSignal && tw && (node.valueSignal === "tmp" || node.valueSignal === "sec" || node.valueSignal === "rf")) {
    return tw[node.valueSignal];
  }
  return live;
}

export function ScadaMimic({ config = PLANT, section }: { config?: PlantConfig; section: ScadaSection }) {
  const live = useSignalSim(config.equipment, 2500);
  const twin = useTwinLive(config.equipment, 2500, true);
  const byCode = new Map(config.equipment.map((e) => [e.code, e]));

  const isRunning = (g?: string | string[]) => {
    if (!g) return false;
    const arr = Array.isArray(g) ? g : [g];
    return arr.some((c) => byCode.get(c)?.status === "running");
  };

  // Conteo por estado SCADA sobre los nodos de la sección (leyenda).
  const counts = section.nodes.reduce<Record<string, number>>((acc, n) => {
    const e = byCode.get(n.code); if (!e) return acc;
    const k = scadaFor(e).key; acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {});

  const fluids: Fluid[] = ["feed", "permeate", "brine"];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Encabezado + leyendas */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.subtitle && <p className="text-sm text-muted-foreground">{section.subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {SCADA_LEGEND.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("inline-block size-2 rounded-full", s.dot, s.blink && "animate-pulse")} /> {s.label}
                {counts[s.key] ? <span className="font-mono tabular-nums">({counts[s.key]})</span> : null}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {fluids.map((f) => (
              <span key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: FLUID_HEX[f] }} /> {FLUID_LABEL[f]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Lienzo SCADA */}
      <div className="overflow-x-auto rounded-xl border border-border bg-[var(--background)]">
        <svg viewBox={section.viewBox} className="min-w-[900px] w-full" role="img" aria-label={section.title} style={{ background: "var(--background)" }}>
          <defs>
            {/* grilla tipo blueprint */}
            <pattern id="scada-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--border)" strokeWidth="0.6" opacity="0.35" />
            </pattern>
            {fluids.concat(["chemical", "cip"]).map((f) => (
              <marker key={f} id={`arrow-${f}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L6,3 L0,6 Z" fill={FLUID_HEX[f as Fluid]} />
              </marker>
            ))}
          </defs>

          <rect x="0" y="0" width="1000" height="560" fill="url(#scada-grid)" />

          {/* Cañerías: base tenue + overlay animado si el aguas-arriba está en marcha */}
          {section.pipes.map((p, i) => {
            const path = d(p.points);
            const flowing = isRunning(p.gate);
            const col = FLUID_HEX[p.fluid];
            const len = p.points.reduce((a, pt, j) => j === 0 ? 0 : a + Math.hypot(pt[0] - p.points[j - 1][0], pt[1] - p.points[j - 1][1]), 0);
            return (
              <g key={i}>
                <path d={path} fill="none" stroke={col} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round"
                  opacity={flowing ? 0.28 : 0.16} strokeDasharray={p.dashed ? "2 5" : undefined}
                  markerEnd={p.arrow ? `url(#arrow-${p.fluid})` : undefined} />
                {flowing && (
                  <path d={path} fill="none" stroke={col} strokeWidth={p.dashed ? 2.5 : 3} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="9 13">
                    <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="0.9s" repeatCount="indefinite" />
                  </path>
                )}
                {/* longitud usada sólo para evitar warnings de lint si se necesitara */}
                {len < 0 && <title>{len}</title>}
              </g>
            );
          })}

          {/* Puertos de borde (entradas/salidas) */}
          {section.io?.map((io, i) => (
            <text key={i} x={io.x} y={io.y - (io.dir === "out" ? 26 : 12)} textAnchor={io.dir === "out" ? "end" : "start"}
              fill={FLUID_HEX[io.fluid]} fontSize="11" fontWeight={600} fontFamily="var(--font-mono, monospace)" opacity={0.9}>{io.label}</text>
          ))}

          {/* Nodos: símbolo + estado + código + valor vivo */}
          {section.nodes.map((n) => {
            const e = byCode.get(n.code);
            if (!e) return null;
            const sc = scadaFor(e);
            const v = nodeValue(n, e, live[n.code], twin[n.code]);
            const w = n.w ?? 44, h = n.h ?? 44;
            // posición de la etiqueta+valor
            const lp = n.labelPos ?? "bottom";
            const off = { top: [0, -h / 2 - 8], bottom: [0, h / 2 + 16], left: [-w / 2 - 8, 4], right: [w / 2 + 8, 4] }[lp] as [number, number];
            const anchor = lp === "left" ? "end" : lp === "right" ? "start" : "middle";
            return (
              <g key={n.code} transform={`translate(${n.x} ${n.y})`}>
                <title>{e.code} · {e.name} — {sc.label} · salud {e.health}%{v ? ` · ${v.label} ${fmt(v.value)} ${v.unit}` : ""}</title>
                <g className={sc.blink ? "animate-pulse" : undefined}>
                  <ScadaSymbol kind={n.symbol} hex={sc.hex} w={w} h={h} />
                </g>
                {/* etiqueta código + valor */}
                <g transform={`translate(${off[0]} ${off[1]})`} textAnchor={anchor}>
                  <text fill="var(--foreground)" fontSize="12" fontWeight={600} fontFamily="var(--font-mono, monospace)">{n.label ?? n.code}</text>
                  {v && (
                    <text y="13" fill={sc.hex} fontSize="11.5" fontFamily="var(--font-mono, monospace)">
                      {fmt(v.value)} {v.unit}
                    </text>
                  )}
                </g>
                {/* punto de estado */}
                <circle cx={w / 2 - 3} cy={-h / 2 + 3} r={4} fill={sc.hex} stroke="var(--background)" strokeWidth={1.5} className={sc.blink ? "animate-pulse" : undefined} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Nota */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        Mímico SCADA a medida (sección piloto). El flujo se anima cuando el equipo aguas-arriba está en marcha; los valores refrescan ~2,5 s (demo). Colores de estado: marcha/detención/anomalía/alarma. Las demás secciones de la planta se agregan tras la evaluación.
      </p>
    </div>
  );
}
