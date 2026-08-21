"use client";

import {
  Cylinder, Axe, MoveHorizontal, Triangle, Container, FlaskConical, FlaskRound,
  Droplets, Filter, Atom, ScrollText, CloudFog, Flame, Zap, Cog, Fan, Info, ChevronRight,
  Waves, Rows3, Grid3x3, Recycle, Droplet, Combine,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { PLANT, type EquipmentDef, type AreaDef, type EquipmentKind, type PlantConfig } from "@/lib/plant-config";
import { useSignalSim, type LiveValue } from "@/lib/useSignalSim";
import { useTwinLive, type TwinLive } from "@/lib/useTwinLive";
import { statusColor } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

// ─── Iconografía por tipo de equipo ──────────────────────────────────────────
const ICON: Record<EquipmentKind, LucideIcon> = {
  debarker: Cylinder, chipper: Axe, conveyor: MoveHorizontal, pile: Triangle, silo: Container,
  impregnation: FlaskConical, digester: FlaskRound, tank: Container, washer: Droplets, screen: Filter,
  o2reactor: Atom, dryer: ScrollText, evaporator: CloudFog, recovery_boiler: Flame, power_boiler: Flame,
  lime_kiln: Cylinder, causticizer: FlaskConical, turbogen: Zap, pump: Cog, fan: Fan,
  motor: Cog, agitator: Fan,
  // desal
  intake_tower: Waves, band_filter: Filter, uf_skid: Rows3, cartridge_filter: Filter,
  ro_rack: Grid3x3, membrane: Grid3x3, eri: Recycle, calcite_contactor: FlaskConical,
  dosing: Droplet, mixer: Combine, outfall: Waves,
};

// Estados operativos mostrados en la leyenda (colores desde la fuente única).
const LEGEND_STATES = ["running", "idle", "maintenance", "stopped"] as const;

function fmt(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 2 : 1);
}

// Mini-métrica del overlay del gemelo (Rf / TMP / SEC) para la card del rack RO.
function TwinMetric({ v, tone }: { v: LiveValue; tone: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{v.label}</span>
        <span className="font-mono text-[10px] font-semibold tabular-nums">{fmt(v.value)}<span className="ml-0.5 text-[8px] font-normal text-muted-foreground">{v.unit}</span></span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${v.pct}%` }} />
      </div>
    </div>
  );
}

function EquipmentNode({ e, live, twinLive, onSelect }: { e: EquipmentDef; live?: LiveValue; twinLive?: TwinLive; onSelect?: (code: string) => void }) {
  const Icon = ICON[e.kind];
  const st = statusColor(e.status);
  const primary = e.signals.find((s) => s.signal === e.primarySignal) ?? e.signals[0];
  // Color del overlay por severidad de fouling (fracción sobre umbral 15%).
  const twinTone = twinLive
    ? statusColor(twinLive.foulFrac >= 0.15 ? "falla" : twinLive.foulFrac >= 0.1 ? "fuera_rango" : "en_rango").dot
    : "";
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={() => onSelect?.(e.code)}
        className={cn(
          "group block w-full text-left rounded-lg border border-border bg-card p-2.5 ring-1 ring-inset transition",
          "hover:border-[var(--primary)] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
          st.ring,
        )}
      >
          <div className="flex items-center gap-2">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-muted", st.text)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={cn("inline-block size-1.5 rounded-full", st.dot)} aria-hidden />
                <span className="truncate font-mono text-[11px] font-semibold">{e.code}</span>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{e.name}</span>
            </span>
          </div>
          {live && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{live.label}</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {fmt(live.value)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{live.unit}</span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all duration-700", st.dot)} style={{ width: `${live.pct}%` }} />
              </div>
            </div>
          )}
          {twinLive && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 border-t border-dashed border-border pt-2">
              <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--accent)]">Gemelo · física viva</span>
              <TwinMetric v={twinLive.rf} tone={twinTone} />
              <TwinMetric v={twinLive.tmp} tone={twinTone} />
              <TwinMetric v={twinLive.sec} tone={twinTone} />
            </div>
          )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-mono text-xs font-semibold">{e.code} · {e.name}</p>
        <p className={cn("text-[11px]", st.text)}>{st.label} · salud {e.health}%</p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{e.help}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Señal: {primary.label} ({primary.unit}){primary.min != null ? ` · rango ${primary.min}–${primary.max}` : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function AreaColumn({ area, equipment, live, twinLive, onSelect }: { area: AreaDef; equipment: EquipmentDef[]; live: Record<string, LiveValue>; twinLive?: Record<string, TwinLive>; onSelect?: (code: string) => void }) {
  const eq = equipment.filter((e) => e.areaCode === area.code);
  return (
    <div className="flex w-[190px] shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-1 rounded-md bg-muted/60 px-2 py-1.5">
        <span className="truncate text-xs font-semibold">{area.short}</span>
        <Tooltip>
          <TooltipTrigger type="button" className="text-muted-foreground hover:text-[var(--primary)]" aria-label={`Ayuda: ${area.name}`}>
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs font-semibold">{area.name}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{area.help}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-2">
        {eq.map((e) => <EquipmentNode key={e.code} e={e} live={live[e.code]} twinLive={twinLive?.[e.code]} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

export function PlantSynoptic({ config = PLANT, onSelect, twin = false }: { config?: PlantConfig; onSelect?: (code: string) => void; twin?: boolean }) {
  const live = useSignalSim(config.equipment, 2500);
  // Overlay del gemelo: sólo activa el intervalo cuando `twin` está pedido,
  // para no cargar /overview (que usa este mismo componente sin overlay).
  const twinLive = useTwinLive(config.equipment, 2500, twin);

  const counts = config.equipment.reduce<Record<string, number>>((a, e) => { a[e.status] = (a[e.status] ?? 0) + 1; return a; }, {});

  return (
    <TooltipProvider delay={120}>
      <div className="space-y-4">
        {/* Encabezado + leyenda */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Vista general de planta</h2>
            <p className="text-sm text-muted-foreground">
              {config.plant.product} · {config.plant.capacity} · datos de demostración simulados
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGEND_STATES.map((k) => {
              const v = statusColor(k);
              return (
                <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("inline-block size-2 rounded-full", v.dot)} /> {v.label}
                  {counts[k] ? <span className="font-mono tabular-nums">({counts[k]})</span> : null}
                </span>
              );
            })}
          </div>
        </div>

        {/* Bandas de proceso (data-driven desde config) */}
        <div className="space-y-3">
          {config.bands.map((band) => {
            const areas = config.areas.filter((a) => a.loop === band.loop);
            if (areas.length === 0) return null;
            return (
              <section key={band.loop} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold">{band.title}</h3>
                  <span className="text-xs text-muted-foreground">{band.sub}</span>
                </div>
                <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                  {areas.map((area, i) => (
                    <div key={area.code} className="flex items-stretch">
                      <AreaColumn area={area} equipment={config.equipment} live={live} twinLive={twin ? twinLive : undefined} onSelect={onSelect} />
                      {i < areas.length - 1 && (
                        <div className="flex w-6 items-center justify-center text-muted-foreground/50" aria-hidden>
                          <ChevronRight className="size-5" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Nota de fase operativa */}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" />
          Operación en <b className="font-medium">Fase {config.flags.phase} ({config.flags.phaseLs} l/s)</b>
          {config.flags.eri ? " · con recuperación de energía (ERI)" : ""}
          {config.flags.note ? ` · ${config.flags.note}` : ""} — datos de demostración simulados.
        </p>
      </div>
    </TooltipProvider>
  );
}
