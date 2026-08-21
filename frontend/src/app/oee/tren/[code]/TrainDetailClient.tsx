"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { OEEGauge, StateBadge } from "@/components/mes";
import { CHART } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { oeeBand, type TrainOee } from "@/lib/oee-types";
import type { TrainProcess } from "@/lib/oee";

const BAND_HEX = { ok: "#16a34a", warn: "#d97706", crit: "#dc2626" } as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Serie OEE de 7 días sintetizada de forma determinística alrededor del OEE actual. [inferencia] demo. */
function oeeTrend7(code: string, oee: number) {
  let h = 0; for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  const seed = Math.abs(h);
  return Array.from({ length: 7 }, (_, i) => {
    const wave = Math.sin((seed % 7) + i * 0.9) * 4 + Math.cos(seed + i) * 2;
    const day = new Date(); day.setDate(day.getDate() - (6 - i));
    return { day: day.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }), oee: Math.round(clamp(oee + wave - 2 + i * 0.4, 0, 100)) };
  });
}

function Param({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: "warn" | "crit" }) {
  const toneText = tone === "crit" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", toneText)}>
        {value}{unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function TrainDetailClient({ train, process, thresholds, windowDays }: {
  train: TrainOee; process: TrainProcess; thresholds: { target: number; acceptable: number; critical: number }; windowDays: number;
}) {
  const label = train.code.replace("A25-", "RO-");
  const band = oeeBand(train.oee, thresholds);
  const trend = oeeTrend7(train.code, train.oee);

  // Perfil operativo (radar, 0-100) — [conclusión] derivado de OEE + proceso.
  const recoveryScore = clamp((process.recovery / 46) * 100, 0, 100);
  const energyScore = clamp(100 - (process.dpTmp - 1.8) * 30, 40, 100);
  const pressureScore = clamp(100 - (process.feedPressureBar - 58) * 4, 40, 100);
  const radar = [
    { axis: "Disponibilidad", value: train.availability },
    { axis: "Rendimiento", value: train.performance },
    { axis: "Calidad", value: train.quality },
    { axis: "Recuperación", value: Math.round(recoveryScore) },
    { axis: "Energía", value: Math.round(energyScore) },
    { axis: "Presión", value: Math.round(pressureScore) },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/oee" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a OEE
      </Link>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gauge OEE */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">OEE actual — {label}</span>
            <StateBadge state={train.status} size="sm" />
          </div>
          <OEEGauge availability={train.availability} performance={train.performance} quality={train.quality} oee={train.oee} size={190} />
          <div className="mt-2 flex items-baseline justify-center gap-1">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: BAND_HEX[band] }}>{train.oee}</span>
            <span className="text-xs text-muted-foreground">% OEE · meta {thresholds.target}%</span>
          </div>
        </div>

        {/* Tendencia OEE 7 días */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-2 text-sm font-semibold">Tendencia OEE — 7 días</div>
          <div className="h-[210px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={34} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={thresholds.target} stroke={BAND_HEX.ok} strokeDasharray="4 4" />
                <ReferenceLine y={thresholds.critical} stroke={BAND_HEX.crit} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="oee" name="OEE %" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Líneas de referencia: meta {thresholds.target}% (verde) y crítico {thresholds.critical}% (rojo).</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Perfil operativo (radar) */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold">Perfil operativo</div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke={CHART.grid} />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: CHART.axis }} />
                <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.35} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Parámetros de proceso */}
        <div className="lg:col-span-2">
          <div className="mb-2 text-sm font-semibold">Parámetros de proceso</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Param label="Caudal permeado" value={train.actualM3h} unit="m³/h" />
            <Param label="Presión alimentación" value={process.feedPressureBar} unit="bar" />
            <Param label="Recuperación" value={process.recovery} unit="%" />
            <Param label="ΔP transmembrana" value={process.dpTmp} unit="bar" tone={process.dpTmp > 2.4 ? "warn" : undefined} />
            <Param label="Conductividad" value={process.permeateConductivity ?? "—"} unit="µS/cm" />
            <Param label="SDT permeado" value={process.permeateTds ?? "—"} unit="mg/l" />
            <Param label="pH permeado" value={process.permeatePh ?? "—"} />
            <Param label="Boro" value={process.permeateBoron ?? "—"} unit="mg/l" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Info del tren */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">Información del tren</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-[11px] uppercase text-muted-foreground">Código</dt><dd className="font-mono">{train.code}</dd></div>
            <div><dt className="text-[11px] uppercase text-muted-foreground">Nombre</dt><dd>{train.name}</dd></div>
            <div><dt className="text-[11px] uppercase text-muted-foreground">Capacidad nominal</dt><dd className="font-mono tabular-nums">{train.nominalM3h} m³/h</dd></div>
            <div><dt className="text-[11px] uppercase text-muted-foreground">Downtime ({windowDays}d)</dt><dd className="font-mono tabular-nums">{train.downtimeMin} min</dd></div>
            <div><dt className="text-[11px] uppercase text-muted-foreground">Calidad conforme</dt><dd className="font-mono tabular-nums">{train.qualityConforme}/{train.qualityTotal}</dd></div>
            <div><dt className="text-[11px] uppercase text-muted-foreground">Estado</dt><dd><StateBadge state={train.status} size="sm" /></dd></div>
          </dl>
        </div>

        {/* Acciones rápidas */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">Acciones rápidas</div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/oee" className="rounded-md border border-border px-3 py-2 text-center text-xs hover:border-[var(--accent)] hover:bg-muted/40">Ver paradas</Link>
            <Link href="/oee" className="rounded-md border border-border px-3 py-2 text-center text-xs hover:border-[var(--accent)] hover:bg-muted/40">Ver calidad</Link>
            <Link href="/twin" className="rounded-md border border-border px-3 py-2 text-center text-xs hover:border-[var(--accent)] hover:bg-muted/40">Gemelo Digital</Link>
            <Link href="/predictive" className="rounded-md border border-border px-3 py-2 text-center text-xs hover:border-[var(--accent)] hover:bg-muted/40">Predictivo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
