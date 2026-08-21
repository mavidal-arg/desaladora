"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Model3DView — Modelo 3D preliminar del área RO (Ósmosis Inversa).
//
// Render isométrico extraído del IOM del proveedor (Proxa / Iluka P134,
// "Figure 7-8: Reverse Osmosis Containers") anotado con señales vivas por tren
// (A25-1/2/3). El overlay reusa `useTwinLive` — el MISMO hook que alimenta el
// overlay del mímico (PlantSynoptic) — y el código de color semántico de
// `statusColor`, de modo que la severidad por ensuciamiento (fouling) es
// consistente en toda la app (verde <10% · ámbar 10-15% · rojo ≥15% sobre base).
//
// Contrato (fijado en el plan A2): recibe `racks: TwinRackRow[]` (de
// TwinSummary.racks, que ya llega a TwinClient) y consume `useTwinLive`
// internamente para los valores animados (~2,5 s en demo).
//
// [inferencia] Las coordenadas de los hotspots (x/y en %) están posicionadas
// A OJO sobre el render — son aproximadas y quedan pendientes de ajuste fino.
// [inferencia] La "presión de alimentación" se deriva como TMP + ΔP de canal de
// alimentación (~2 bar); en real vendría de la señal virtual del motor.
// ─────────────────────────────────────────────────────────────────────────────

import type { JSX } from "react"; // React 19: JSX namespace ya no es global.
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { statusColor } from "@/lib/status-colors";
import { useTwinLive } from "@/lib/useTwinLive";
import type { TwinRackRow } from "@/lib/twin-types";
import { apiUrl, cn } from "@/lib/utils";

// Relación de aspecto nativa del asset (1200 × 578 px).
const IMG = { src: "/twin/ro-area-3d.png", w: 1200, h: 578 };

// ΔP de canal de alimentación usado para derivar la presión de alimentación
// a partir de la TMP. [inferencia] margen hidráulico de demo.
const FEED_CHANNEL_DP_BAR = 2.0;

// Hotspots por tren RO. x/y = % relativos al contenedor de la imagen.
// `align` fija la horizontal de la tarjeta para que no se salga del render ni
// se solape con la vecina. [inferencia] posiciones a ojo sobre el render.
type Align = "left" | "center" | "right";
const HOTSPOTS: { code: string; x: number; y: number; align: Align }[] = [
  { code: "A25-1", x: 17, y: 55, align: "left" },
  { code: "A25-2", x: 40, y: 48, align: "center" },
  { code: "A25-3", x: 62, y: 42, align: "center" },
  { code: "A25-4", x: 84, y: 36, align: "right" },
];

// Fracción de ensuciamiento derivada de la salud del equipo — MISMA fórmula que
// useTwinLive.foulFractionOf, para el fallback cuando aún no hay valor vivo.
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function foulFractionOf(health: number) {
  return clamp((90 - health) * 0.011, 0, 0.25);
}

// Clave semántica de severidad por fouling, consistente con PlantSynoptic.
function severityKey(foulFrac: number) {
  return foulFrac >= 0.15 ? "falla" : foulFrac >= 0.1 ? "fuera_rango" : "en_rango";
}

function fmt(v: number, dp = 1) {
  return v.toFixed(dp);
}

/** Valores presentados por un tren, combinando señal viva + resumen estático. */
type RackReadout = {
  code: string;
  name: string;
  tmp: number; // bar (vivo)
  feed: number; // bar (derivado)
  sec: number; // kWh/m³ (vivo)
  beta: number; // adimensional (resumen)
  foulFrac: number; // 0-0.25
  cipDays: number | null;
  sevKey: string;
};

function alignClasses(align: Align) {
  // La tarjeta se coloca ENCIMA del pin; align define su anclaje horizontal.
  if (align === "left") return "left-0 translate-x-0";
  if (align === "right") return "right-0 translate-x-0";
  return "left-1/2 -translate-x-1/2";
}

// Tarjeta compacta anclada sobre el pin (siempre visible, para el demo).
function HotspotCard({ r }: { r: RackReadout }) {
  const sev = statusColor(r.sevKey);
  return (
    <div
      className={cn(
        "pointer-events-auto w-[150px] rounded-md border bg-background/90 p-2 shadow-md backdrop-blur-sm",
        sev.ring,
        "ring-1 ring-inset",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
          <span className={cn("inline-block size-1.5 rounded-full", sev.dot)} aria-hidden />
          {r.code}
        </span>
        <span className={cn("text-[9px] font-semibold uppercase tracking-wide", sev.text)}>{sev.label}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 font-mono tabular-nums">
        <Kv k="TMP" v={fmt(r.tmp)} u="bar" />
        <Kv k="P.alim" v={fmt(r.feed)} u="bar" />
        <Kv k="SEC" v={fmt(r.sec, 2)} u="kWh/m³" />
        <Kv k="β" v={fmt(r.beta, 2)} u="" />
      </div>
      <div className="mt-1.5 border-t border-dashed border-border pt-1 text-[9px] text-muted-foreground">
        {r.cipDays != null ? `CIP estimado ~${r.cipDays} d` : "Sin CIP proyectado"}
      </div>
    </div>
  );
}

function Kv({ k, v, u }: { k: string; v: string; u: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[8px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-[11px] font-semibold leading-tight">
        {v}
        {u ? <span className="ml-0.5 text-[8px] font-normal text-muted-foreground">{u}</span> : null}
      </div>
    </div>
  );
}

// Pin + tarjeta, posicionado en % sobre el render.
function Hotspot({ r, x, y, align }: { r: RackReadout; x: number; y: number; align: Align }) {
  const sev = statusColor(r.sevKey);
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      {/* Tarjeta encima del pin */}
      <div className={cn("absolute bottom-[18px] z-10", alignClasses(align))}>
        <HotspotCard r={r} />
      </div>
      {/* Conector */}
      <span className="absolute bottom-1.5 left-1/2 h-3 w-px -translate-x-1/2 bg-foreground/40" aria-hidden />
      {/* Pin pulsante — color por severidad de fouling */}
      <span className="absolute -translate-x-1/2 -translate-y-1/2">
        <span className={cn("absolute inline-flex size-4 animate-ping rounded-full opacity-60", sev.dot)} aria-hidden />
        <span className={cn("relative inline-flex size-3.5 rounded-full ring-2 ring-background", sev.dot)} aria-hidden />
      </span>
    </div>
  );
}

export function Model3DView({ racks }: { racks: TwinRackRow[] }): JSX.Element {
  // Señales vivas por tren RO (mismo hook e intervalo que el overlay del mímico).
  const live = useTwinLive();

  const byCode = new Map(racks.map((r) => [r.code, r]));
  const readouts: RackReadout[] = HOTSPOTS.map(({ code }) => {
    const rack = byCode.get(code);
    const lv = live[code];
    const tmp = lv?.tmp.value ?? rack?.metrics.tmp ?? 0;
    const sec = lv?.sec.value ?? rack?.metrics.sec ?? 0;
    const beta = rack?.metrics.beta ?? 0;
    const foulFrac = lv?.foulFrac ?? (rack ? foulFractionOf(rack.health) : 0);
    return {
      code,
      name: rack?.name ?? code,
      tmp,
      feed: tmp + FEED_CHANNEL_DP_BAR, // [inferencia] P.alim ≈ TMP + ΔP canal
      sec,
      beta,
      foulFrac,
      cipDays: rack?.cipDays ?? null,
      sevKey: severityKey(foulFrac),
    };
  });
  const roByCode = new Map(readouts.map((r) => [r.code, r]));

  return (
    <TooltipProvider delay={120}>
      <div className="space-y-3">
        {/* Encabezado + leyenda de severidad */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-semibold">
              Modelo 3D — Área de Ósmosis Inversa
              <Tooltip>
                <TooltipTrigger type="button" className="text-muted-foreground hover:text-[var(--accent)]" aria-label="Acerca del modelo 3D">
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-[11px] leading-snug">
                    Render isométrico del contenedor de trenes RO (IOM del proveedor) anotado con las
                    señales físicas vivas de cada tren. El color del pin sigue el ensuciamiento (fouling):
                    verde en rango, ámbar en advertencia, rojo cerca del umbral de CIP.
                  </p>
                </TooltipContent>
              </Tooltip>
            </h3>
            <p className="text-sm text-muted-foreground">
              Trenes A25-1/2/3/4 · señales vivas simuladas (refresco ~2,5 s)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(["en_rango", "fuera_rango", "falla"] as const).map((k) => {
              const v = statusColor(k);
              return (
                <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("inline-block size-2 rounded-full", v.dot)} /> {v.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Render con overlay de hotspots */}
        <div
          className="relative w-full max-w-full overflow-hidden rounded-xl border border-border bg-muted"
          style={{ aspectRatio: `${IMG.w} / ${IMG.h}` }}
        >
          {/* Plano de fondo — prefijamos basePath con apiUrl para el proxy de Tier0. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={apiUrl(IMG.src)}
            alt="Render isométrico 3D del área de ósmosis inversa (contenedores de trenes RO)"
            className="absolute inset-0 size-full object-cover"
            width={IMG.w}
            height={IMG.h}
            draggable={false}
          />
          {readouts.map((r) => {
            const hs = HOTSPOTS.find((h) => h.code === r.code)!;
            return <Hotspot key={r.code} r={r} x={hs.x} y={hs.y} align={hs.align} />;
          })}
        </div>

        {/* Lecturas en vivo por tren — strip responsive (garantiza legibilidad en móvil) */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {HOTSPOTS.map(({ code }) => {
            const r = roByCode.get(code)!;
            const sev = statusColor(r.sevKey);
            return (
              <div key={code} className={cn("rounded-lg border bg-card p-2.5 ring-1 ring-inset", sev.ring)}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                    <span className={cn("inline-block size-2 rounded-full", sev.dot)} aria-hidden />
                    {code}
                  </span>
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wide", sev.text)}>{sev.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.name}</p>
                <div className="mt-2 grid grid-cols-4 gap-1 font-mono tabular-nums">
                  <Kv k="TMP" v={fmt(r.tmp)} u="bar" />
                  <Kv k="P.alim" v={fmt(r.feed)} u="bar" />
                  <Kv k="SEC" v={fmt(r.sec, 2)} u="kWh/m³" />
                  <Kv k="β" v={fmt(r.beta, 2)} u="" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Nota de fase preliminar */}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Versión preliminar — render del IOM anotado con señales vivas; en real leería las señales
          virtuales del motor. Coordenadas de los hotspots aproximadas (ajuste fino pendiente).
        </p>
      </div>
    </TooltipProvider>
  );
}
