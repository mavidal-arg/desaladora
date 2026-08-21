"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { PLANT, type EquipmentDef, type PlantConfig } from "@/lib/plant-config";
import { useSignalSim, type LiveValue } from "@/lib/useSignalSim";
import { useTwinLive, type TwinLive } from "@/lib/useTwinLive";
import { scadaState, scadaFromHealth, SCADA_LEGEND, type ScadaStyle } from "@/lib/status-colors";
import { apiUrl, cn } from "@/lib/utils";

// Fondo = PFD de ILUKA (I1KA-C7525-DIA-001-00002). Relación de aspecto de la imagen
// renderizada (4967×3509) para que los anclajes en % coincidan con el dibujo.
const BG = { src: "/proceso/pid-bg.png", ratio: "4967 / 3509" };

// Anclajes de los tags SCADA sobre el PFD. x/y en % de la imagen. `align` desplaza
// la tarjeta respecto del punto para no tapar el equipo. [inferencia] coordenadas
// calibradas a ojo sobre el diagrama; ajuste fino iterando con capturas.
type Anchor = { code: string; x: number; y: number; align?: "left" | "right" | "center"; metric?: "tmp" | "sec" | "rf" };
const ANCHORS: Anchor[] = [
  { code: "A1",    x: 6,  y: 21, align: "right" },   // Torre de captación ← BORE FEED WATER
  { code: "A4-1",  x: 6,  y: 31, align: "right" },   // Bomba agua de mar 1
  { code: "A11-1", x: 25, y: 33, align: "left" },    // Bomba alim. UF 1 ← MF Feed Pump A
  { code: "A12-1", x: 30, y: 34, align: "left" },    // Skid UF 1 ← Media Filter 1
  { code: "A12-2", x: 30, y: 53, align: "left" },    // Skid UF 2 ← Media Filter 2
  { code: "A12-3", x: 30, y: 70, align: "left" },    // Skid UF 3 ← Media Filter 3
  { code: "A32",   x: 40, y: 46, align: "center" },  // Filtro cartucho RO ← Cartridge Filter
  { code: "A24-1", x: 44, y: 33, align: "left" },    // Bomba alta presión 1 ← RO Pass1 HP Pump
  { code: "A25-1", x: 51, y: 30, align: "center", metric: "tmp" }, // Rack RO 1 ← Pass1 Stage1
  { code: "A25-2", x: 51, y: 40, align: "center", metric: "tmp" }, // Rack RO 2 ← Pass1 Stage2
  { code: "A25-3", x: 51, y: 47, align: "center", metric: "tmp" }, // Rack RO 3 ← Pass1 Stage3
  { code: "A24-2", x: 62, y: 32, align: "right" },   // Bomba alta presión 2 ← RO Pass2 HP Pump
  { code: "A25-4", x: 68, y: 30, align: "center", metric: "tmp" }, // Rack RO 4 ← Pass2 Stage1
  { code: "A26",   x: 61, y: 53, align: "center" },  // Rack recuperador ERI
  { code: "A38",   x: 81, y: 30, align: "left" },    // Estanque agua remineralizada ← RO permeate
  { code: "A33",   x: 81, y: 62, align: "left" },    // Cámara de rechazo ← Evaporation pond
];

const MEMBRANE_KINDS = new Set(["ro_rack", "membrane", "uf_skid"]);

function fmt(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 2 : 1);
}

// Estado SCADA de un equipo: membranas en operación normal se colorean por salud
// (ensuciamiento); el resto por su estado operativo. Mantenimiento/espera/detención
// priorizan el estado (no la salud) para no reportar una alarma falsa.
function scadaFor(e: EquipmentDef): ScadaStyle {
  const abnormal = ["maintenance", "idle", "stopped", "down", "failed", "warning"].includes(e.status);
  if (MEMBRANE_KINDS.has(e.kind) && !abnormal) return scadaFromHealth(e.health);
  return scadaState(e.status);
}

function ScadaTag({ a, e, live, twinLive }: { a: Anchor; e: EquipmentDef; live?: LiveValue; twinLive?: TwinLive }) {
  const sc = scadaFor(e);
  // Valor de cabecera del tag: para racks RO preferimos la métrica física viva del gemelo.
  const headline: LiveValue | undefined =
    a.metric && twinLive ? twinLive[a.metric] : live ?? (twinLive?.tmp);
  const shift = a.align === "left" ? "translate(-100%, -50%)" : a.align === "right" ? "translate(0, -50%)" : "translate(-50%, -50%)";

  return (
    <div className="absolute" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
      {/* punto de anclaje sobre el equipo */}
      <span
        className={cn("absolute -left-1 -top-1 block size-2 rounded-full ring-2 ring-white/70", sc.dot, sc.blink && "animate-pulse")}
        aria-hidden
      />
      <Tooltip>
        <TooltipTrigger
          type="button"
          style={{ transform: shift }}
          className={cn(
            "flex items-center gap-1.5 rounded-md border bg-[var(--card)]/95 px-1.5 py-1 text-left shadow-md ring-1 ring-inset backdrop-blur-sm transition",
            "hover:z-10 hover:shadow-lg focus:outline-none focus-visible:ring-2",
            sc.ring,
            sc.blink && "animate-pulse",
          )}
        >
          <span className={cn("size-2 shrink-0 rounded-full", sc.dot)} aria-hidden />
          <span className="min-w-0">
            <span className="block font-mono text-[10px] font-semibold leading-none">{e.code}</span>
            {headline && (
              <span className="mt-0.5 block font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
                {fmt(headline.value)}<span className="ml-0.5 text-[8px]">{headline.unit}</span>
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-mono text-xs font-semibold">{e.code} · {e.name}</p>
          <p className={cn("text-[11px] font-medium", sc.text)}>{sc.label} · salud {e.health}%</p>
          {twinLive && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              TMP {fmt(twinLive.tmp.value)} {twinLive.tmp.unit} · SEC {fmt(twinLive.sec.value)} {twinLive.sec.unit} · Rf {fmt(twinLive.rf.value)} {twinLive.rf.unit}
            </p>
          )}
          {e.help && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{e.help}</p>}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ProcessView({ config = PLANT }: { config?: PlantConfig }) {
  const live = useSignalSim(config.equipment, 2500);
  const twinLive = useTwinLive(config.equipment, 2500, true);
  const byCode = new Map(config.equipment.map((e) => [e.code, e]));

  // Conteo por estado SCADA para la leyenda.
  const counts = config.equipment.reduce<Record<string, number>>((acc, e) => {
    const k = scadaFor(e).key; acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {});

  return (
    <TooltipProvider delay={120}>
      <div className="space-y-4 p-4 sm:p-6">
        {/* Encabezado + leyenda SCADA */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Vista de proceso — P&amp;ID en vivo</h2>
            <p className="text-sm text-muted-foreground">
              {config.plant.product} · {config.plant.capacity} · diagrama de proceso ILUKA con datos vivos simulados
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {SCADA_LEGEND.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("inline-block size-2 rounded-full", s.dot, s.blink && "animate-pulse")} /> {s.label}
                {counts[s.key] ? <span className="font-mono tabular-nums">({counts[s.key]})</span> : null}
              </span>
            ))}
          </div>
        </div>

        {/* Diagrama con overlays. Scroll horizontal en pantallas chicas. */}
        <div className="overflow-auto rounded-xl border border-border bg-white">
          <div className="relative mx-auto w-full min-w-[1100px]" style={{ aspectRatio: BG.ratio }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiUrl(BG.src)} alt="PFD — Planta Desaladora (ILUKA)" className="absolute inset-0 h-full w-full object-fill" />
            {ANCHORS.map((a) => {
              const e = byCode.get(a.code);
              if (!e) return null;
              return <ScadaTag key={a.code} a={a} e={e} live={live[a.code]} twinLive={twinLive[a.code]} />;
            })}
          </div>
        </div>

        {/* Nota de fase */}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" />
          Operación en <b className="font-medium">Fase {config.flags.phase} ({config.flags.phaseLs} l/s)</b>
          {config.flags.eri ? " · con recuperación de energía (ERI)" : ""} — fondo: PFD ILUKA I1KA-C7525-DIA-001-00002 · datos de demostración simulados (refresco ~2,5 s).
        </p>
      </div>
    </TooltipProvider>
  );
}
