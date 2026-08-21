"use client";

import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { AreaChart, Area, LineChart, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { SPCChart, OEEGauge, StateBadge } from "@/components/mes";
import { SortableTable } from "@/components/SortableTable";
import { TabBar } from "@/components/TabBar";
import { Model3DView } from "@/components/twin/Model3DView";
import { SceneCanvas } from "@/components/twin/SceneCanvas";
import { useSceneSignals, RO_SCENE_CONFIG } from "@/lib/useSceneSignals";
import { useTwinLive, type TwinLive } from "@/lib/useTwinLive";
import { PLANT } from "@/lib/plant-config";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { statusColor, CHART, CATEGORY_PALETTE } from "@/lib/status-colors";
import { cn, apiUrl } from "@/lib/utils";
import type { TwinSummary, TwinRackRow } from "@/lib/twin-types";

const ACCENT = "var(--accent)";
// Largo del buffer rodante de la física viva (nº de muestras a ~2,5 s).
const BUF_LEN = 40;

// Tendencia cualitativa del rack → clave semántica del código de colores único.
const TREND_KEY: Record<TwinRackRow["trend"], string> = {
  stable: "stable",
  rising: "fuera_rango",
  critical: "falla",
};
const TREND_LABEL: Record<TwinRackRow["trend"], string> = {
  stable: "Estable",
  rising: "En ascenso",
  critical: "Crítica",
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
// Rf viene en 1/m crudo (contrato C2, p.ej. 8.8e13); se muestra en unidades de ×10¹³/m.
const rf13 = (v: number, d = 2) => (Number.isFinite(v) ? (v / 1e13).toFixed(d) : "—");

// Ícono de ayuda con tooltip explicativo (mismo patrón que el de SEC).
function InfoTip({ text, label = "Explicación" }: { text: string; label?: string }) {
  return (
    <TooltipProvider delay={120}>
      <Tooltip>
        <TooltipTrigger type="button" className="text-muted-foreground hover:text-[var(--accent)]" aria-label={label}>
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-[11px] leading-snug">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Kpi({ label, value, unit, hint, accent, tone, info }: {
  label: string; value: string | number; unit?: string; hint?: string; accent?: boolean; tone?: "warn" | "crit"; info?: string;
}) {
  const toneText = tone === "crit" ? "text-red-500" : tone === "warn" ? "text-amber-500" : accent ? "text-[var(--accent)]" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}{info && <InfoTip text={info} label={`Qué es ${label}`} />}</div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", toneText)}>
        {value}{unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Barra de progreso semántica (0-100) con color por banda de salud. */
function HealthBar({ value }: { value: number }) {
  const c = value >= 85 ? statusColor("en_rango") : value >= 72 ? statusColor("fuera_rango") : statusColor("falla");
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", c.dot)} style={{ width: `${clamp(value, 0, 100)}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(value)}%</span>
    </div>
  );
}

/** Tarjeta comparativa Ideal (primeros principios) vs Real medido. */
function IdealVsRealCard({ label, unit, ideal, real, deviationPct }: {
  label: string; unit: string; ideal: number; real: number; deviationPct: number;
}) {
  const mag = Math.abs(deviationPct);
  const tone = mag >= 12 ? "falla" : mag >= 5 ? "fuera_rango" : "en_rango";
  const c = statusColor(tone);
  // Ancho relativo de la barra "real" respecto del "ideal" (cap 160%).
  const realW = clamp(ideal !== 0 ? (real / ideal) * 100 : 100, 0, 160);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums", c.bg, c.text)}>
          {deviationPct >= 0 ? "+" : ""}{fmt(deviationPct, 1)}%
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div>
          <div className="mb-0.5 flex items-baseline justify-between text-[10px] text-muted-foreground">
            <span>Ideal</span><span className="font-mono tabular-nums">{fmt(ideal)} {unit}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--muted-foreground)]/50" style={{ width: "100%" }} />
          </div>
        </div>
        <div>
          <div className="mb-0.5 flex items-baseline justify-between text-[10px] text-muted-foreground">
            <span>Real</span><span className={cn("font-mono tabular-nums", c.text)}>{fmt(real)} {unit}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", c.dot)} style={{ width: `${realW / 1.6}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tab "Modelo 3D": 3D navegable (react-three-fiber) con toggle a la imagen anotada. */
function Model3DTab({ racks }: { racks: TwinRackRow[] }) {
  const [view, setView] = useState<"3D" | "img">("3D");
  const signals = useSceneSignals(); // física viva (useTwinLive) → anchors del GLB
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Modelo 3D — Área de Ósmosis Inversa</h2>
          <p className="text-[11px] text-muted-foreground">
            Trenes A25-1/2/3/4 · arrastrá para rotar, rueda para zoom · señales vivas ~2,5 s (demo)
          </p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-border text-[11px]">
          {(["3D", "img"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={cn(
                "px-2 py-1 font-mono transition-colors",
                view === k ? "bg-[var(--accent)] text-black" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {k === "3D" ? "3D navegable" : "Imagen"}
            </button>
          ))}
        </div>
      </div>
      {view === "3D" ? (
        <SceneCanvas
          modelUrl={apiUrl("/twin/ro_skid.glb")}
          signals={signals}
          config={RO_SCENE_CONFIG}
          height={560}
        />
      ) : (
        <Model3DView racks={racks} />
      )}
      <p className="text-[11px] text-muted-foreground">
        Versión preliminar — geometría procedural del skid RO (modelo esquemático); en real cargaría el
        CAD de planta. Las etiquetas flotan sobre cada tren con TMP/SEC vivos y color por severidad.
      </p>
    </div>
  );
}

export function TwinClient({ data }: { data: TwinSummary }) {
  const { racks, idealVsReal, cip, thresholds } = data;
  const [spcMetric, setSpcMetric] = useState<"rf" | "tmp">("rf");
  const [secMode, setSecMode] = useState<"agg" | "trains">("agg");
  const [tab, setTab] = useState<"Modelo Físico" | "Modelo 3D">("Modelo Físico");

  const rackCodes = racks.map((r) => r.code);
  const [spcTrain, setSpcTrain] = useState<string>(() => cip.nextTrainCode ?? rackCodes[0] ?? "");
  // Tren mostrado en el bloque "Métricas físicas" (por defecto, el líder) + panel comparativo.
  const [selectedTrain, setSelectedTrain] = useState<string>(() => cip.nextTrainCode ?? rackCodes[0] ?? "");
  const [compareOpen, setCompareOpen] = useState(false);

  // ── Física viva (useTwinLive, ~2,5 s) + buffer rodante para animar SEC/SPC ──
  // Sólo corre el intervalo en la pestaña "Modelo Físico".
  const liveMap = useTwinLive(PLANT.equipment, 2500, tab === "Modelo Físico");
  const [buf, setBuf] = useState<{ t: string; live: Record<string, TwinLive> }[]>([]);
  useEffect(() => {
    if (Object.keys(liveMap).length === 0) return;
    const t = new Date().toLocaleTimeString("es-CL", { hour12: false });
    // Suscribe la fuente viva (useTwinLive) a un buffer rodante para animar SEC/SPC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuf((prev) => [...prev.slice(-(BUF_LEN - 1)), { t, live: liveMap }]);
  }, [liveMap]);

  // Estado actual del SEC del tren líder (reusa el item ya calculado en idealVsReal).
  const secIVR = idealVsReal.find((d) => d.label === "SEC");
  const secMag = secIVR ? Math.abs(secIVR.deviationPct) : 0;
  const secTone = secMag >= 12 ? "falla" : secMag >= 5 ? "fuera_rango" : "en_rango";
  const secBand = statusColor(secTone);

  // Tren líder = el que dispara el próximo CIP; si no, el de menor salud.
  const lead =
    racks.find((r) => r.code === cip.nextTrainCode) ??
    [...racks].sort((a, b) => a.health - b.health)[0] ??
    null;
  // Tren mostrado en el bloque de métricas físicas (selector; por defecto = líder).
  const selected = racks.find((r) => r.code === selectedTrain) ?? lead;
  const m = selected?.metrics;
  // Métricas vivas del tren seleccionado (rf/tmp/sec del hook; el resto se deriva o queda estático).
  const selLive = selected ? liveMap[selected.code] : undefined;
  const liveRf = selLive ? selLive.rf.value * 1e13 : m?.rf ?? 0;
  const liveTmp = selLive?.tmp.value ?? m?.tmp ?? 0;
  const liveSec = selLive?.sec.value ?? m?.sec ?? 0;
  const liveNdp = liveTmp - (m?.piOsmotic ?? 0);

  // Salud compuesta del tren seleccionado (para el donut). [conclusión] derivada de las métricas físicas.
  const integrity = selected?.health ?? 0;
  const energyScore = m ? clamp(Math.round(100 - Math.max(0, liveSec - 2.9) * 80), 40, 100) : 0;
  const rejectionScore = m ? clamp(Math.round(100 - Math.max(0, m.beta - 1) * 200), 50, 100) : 0;

  // Ideal vs Real recomputado para el tren seleccionado: el "real" de SEC/TMP toma el
  // valor vivo del rack; el ideal/base (membrana limpia) se mantiene y Recovery queda a
  // nivel planta. Con selected = líder reproduce el comportamiento previo.
  const ivrSelected = idealVsReal.map((d) => {
    let real = d.real;
    if (d.label === "SEC") real = liveSec;
    else if (d.label === "TMP") real = liveTmp;
    const deviationPct = d.ideal ? ((real - d.ideal) / d.ideal) * 100 : d.deviationPct;
    return { ...d, real, deviationPct };
  });

  // ── Serie SEC viva: promedio de planta (todos los trenes) + valor por tren ──
  const secSeries = buf.map((b) => {
    const codes = Object.keys(b.live);
    const agg = codes.length ? codes.reduce((a, c) => a + b.live[c].sec.value, 0) / codes.length : 0;
    const row: Record<string, number | string> = { t: b.t, agg: Math.round(agg * 100) / 100 };
    codes.forEach((c) => { row[c] = b.live[c].sec.value; });
    return row;
  });
  const secNow = secSeries.length ? Number(secSeries[secSeries.length - 1].agg) : liveSec;

  // ── Serie SPC viva del tren seleccionado (Rf o TMP) con CL=base y UCL=base*(1+rise%) ──
  const series = buf
    .map((b) => ({ x: b.t, value: b.live[spcTrain] ? (spcMetric === "rf" ? b.live[spcTrain].rf.value : b.live[spcTrain].tmp.value) : 0 }))
    .filter((p) => p.value > 0);
  const rise = 1 + thresholds.rfRisePct / 100;
  const base = spcMetric === "rf" ? 3.0 : 54; // membrana/operación limpia de referencia
  const ucl = base * rise;
  const lcl = spcMetric === "rf" ? base * 0.96 : base * 0.9;
  const cl = base;
  const spcUnit = spcMetric === "rf" ? "×10¹³/m" : "bar";

  const cipTone = cip.days == null ? "stable" : cip.days <= 14 ? "falla" : cip.days <= 30 ? "fuera_rango" : "en_rango";

  // Valores vivos por rack (para la tabla ordenable) + rango de tendencia.
  const rackLive = (r: TwinRackRow) => {
    const lr = liveMap[r.code];
    const rRf = lr ? lr.rf.value * 1e13 : r.metrics.rf;
    const rSec = lr?.sec.value ?? r.metrics.sec;
    const rTmp = lr?.tmp.value ?? r.metrics.tmp;
    const rfDelta = r.rfBase ? (rRf / r.rfBase - 1) * 100 : 0;
    return { rRf, rSec, rTmp, rfDelta };
  };
  const trendRank: Record<TwinRackRow["trend"], number> = { stable: 0, rising: 1, critical: 2 };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <TabBar tabs={["Modelo Físico", "Modelo 3D"]} active={tab} onChange={(t) => setTab(t as typeof tab)} />

      {tab === "Modelo 3D" ? (
        <Model3DTab racks={racks} />
      ) : (
      <div className="space-y-4">
      {/* ── Tiles físicos del tren líder ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">Métricas físicas — tren <span className="font-mono text-[var(--accent)]">{selected?.code ?? "—"}</span>
            <InfoTip label="Qué es el tren líder" text="Tren líder = el rack de ósmosis inversa que primero alcanzará el umbral de limpieza (el de menor 'días para CIP'). Es el más avanzado en ensuciamiento; su serie alimenta el gráfico de ensuciamiento y marca cuándo será la próxima limpieza química (CIP) de la planta." />
          </h2>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-[var(--accent)]" /> en vivo ~2,5 s · modelo van &apos;t Hoff / ASTM D4516
          </span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Tren:</span>
          <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
            {rackCodes.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedTrain(c)}
                className={cn("px-2 py-1 font-mono transition-colors", selectedTrain === c ? "bg-[var(--accent)] text-black" : "text-muted-foreground hover:bg-muted")}
                aria-pressed={selectedTrain === c}
              >
                {c}{c === lead?.code ? " ★" : ""}
              </button>
            ))}
          </div>
          {selected?.code === lead?.code && <span className="text-[10px] text-muted-foreground">★ tren líder (próximo CIP)</span>}
          <button
            onClick={() => setCompareOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]"
            aria-expanded={compareOpen}
          >
            {compareOpen ? "Ocultar comparación" : "Comparar los 4 trenes"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Kpi label="π osmótica Δπ" value={fmt(m?.piOsmotic ?? 0, 1)} unit="bar" hint="van 't Hoff" />
          <Kpi label="TMP" value={fmt(liveTmp, 1)} unit="bar" hint="transmembrana" info="Presión transmembrana: caída de presión a través de la membrana. Sube a medida que la membrana se ensucia, así que es un indicador directo de cuán sucia está." />
          <Kpi label="NDP" value={fmt(liveNdp, 1)} unit="bar" hint="TMP − Δπ" />
          <Kpi label="Rf fouling" value={rf13(liveRf)} unit="×10¹³/m" tone={lead?.trend === "critical" ? "crit" : lead?.trend === "rising" ? "warn" : undefined} accent />
          <Kpi label="Rf norm." value={rf13(m?.rfNorm ?? 0)} unit="×10¹³/m" hint="a 25 °C ref" />
          <Kpi label="SEC" value={fmt(liveSec, 2)} unit="kWh/m³" hint="neto con ERI" accent info="Consumo específico de energía: electricidad neta por m³ de permeado (kWh/m³), ya descontada la recuperación del ERI. Es el KPI energético central de la desaladora; sube con el ensuciamiento." />
          <Kpi label="β polarización" value={fmt(m?.beta ?? 0, 3)} tone={m && m.beta > 1.15 ? "warn" : undefined} hint="alerta > 1,15" />
        </div>
      </div>

      {/* ── Comparar los 4 trenes (colapsable) ── */}
      {compareOpen && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Comparar los 4 trenes — métricas físicas vivas</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {racks.map((r) => {
              const { rRf, rSec, rTmp } = rackLive(r);
              const ndp = rTmp - r.metrics.piOsmotic;
              const isLead = r.code === lead?.code;
              const isSel = r.code === selectedTrain;
              return (
                <button
                  key={r.code}
                  onClick={() => setSelectedTrain(r.code)}
                  className={cn("rounded-lg border p-2.5 text-left transition", isSel ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40" : "border-border hover:border-[var(--accent)]/40")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{r.code}{isLead ? " ★" : ""}</span>
                    <StateBadge state={r.status} size="sm" />
                  </div>
                  <div className="mt-1"><HealthBar value={r.health} /></div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums">
                    <div className="flex justify-between"><dt className="text-muted-foreground">TMP</dt><dd>{fmt(rTmp, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">SEC</dt><dd>{fmt(rSec)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Rf</dt><dd>{rf13(rRf)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Rf n.</dt><dd>{rf13(r.metrics.rfNorm)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">NDP</dt><dd>{fmt(ndp, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Δπ</dt><dd>{fmt(r.metrics.piOsmotic, 1)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">β</dt><dd>{fmt(r.metrics.beta, 3)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">CIP</dt><dd>{r.cipDays ?? "—"} d</dd></div>
                  </dl>
                  <div className="mt-1.5"><StateBadge state={TREND_KEY[r.trend]} label={TREND_LABEL[r.trend]} size="sm" /></div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Valores vivos (~2,5 s). ★ = tren líder (próximo CIP). Clic en un tren para verlo en detalle arriba. Unidades: TMP/Δπ/NDP bar · SEC kWh/m³ · Rf ×10¹³/m.</p>
        </div>
      )}

      {/* ── Ideal vs Real + salud compuesta ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Ideal (primeros principios) vs Real medido</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ivrSelected.map((d) => <IdealVsRealCard key={d.label} {...d} />)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">El desvío mide cuánto se aparta la operación real del comportamiento de membrana/bomba nueva. Verde &lt; 5% · ámbar 5–12% · rojo &ge; 12%.</p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-3 lg:w-[220px]">
          <div className="mb-1 flex items-center gap-1.5 self-start text-sm font-semibold">Salud compuesta
            <InfoTip label="Cómo se calcula la salud compuesta" text="Combina 3 ejes físicos del activo (0–100): A = integridad de la membrana (índice de salud), P = eficiencia energética (cuánto sube el SEC sobre su ideal), Q = rechazo de sales (polarización β). No es el OEE de producción: mide la salud del activo, no cuánto produce." />
          </div>
          <OEEGauge availability={integrity} performance={energyScore} quality={rejectionScore} size={180} />
          <div className="mt-1 text-center text-[10px] text-muted-foreground">
            A = integridad membrana · P = eficiencia energética · Q = rechazo de sales — tren {selected?.code ?? "—"}
          </div>
        </div>
      </div>

      {/* ── Tendencia de ensuciamiento (SPC) + Días para CIP ── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              Tendencia de ensuciamiento vs límite de control (CIP) — Tren <span className="font-mono text-[var(--accent)]">{spcTrain || "—"}</span>
              <InfoTip label="Ensuciamiento vs límite de control" text="Rf = resistencia por ensuciamiento de la membrana; el TMP sube junto con él. La línea central (CL) es la membrana limpia (base) y la UCL es base + 15%. Cuando Rf o TMP cruzan la UCL se programa el CIP (limpieza química). Los puntos fuera de control se marcan en rojo." />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={spcTrain}
                onChange={(e) => setSpcTrain(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground"
                aria-label="Seleccionar tren RO"
              >
                {rackCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
                {(["rf", "tmp"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSpcMetric(k)}
                    className={cn("px-2 py-1 font-mono transition-colors", spcMetric === k ? "bg-[var(--accent)] text-black" : "text-muted-foreground hover:bg-muted")}
                  >
                    {k === "rf" ? "Rf" : "TMP"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SPCChart
            data={series}
            ucl={ucl}
            lcl={lcl}
            cl={cl}
            label={`Tren ${spcTrain} · ${spcMetric === "rf" ? "Rf (fouling)" : "TMP"} — ${spcUnit} · UCL = base + ${thresholds.rfRisePct}% · en vivo`}
            height={260}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Serie viva del tren {spcTrain} (~2,5 s). CL = membrana limpia (base). Cuando la serie cruza la UCL (base +{thresholds.rfRisePct}%) se dispara el CIP. Los puntos fuera de control se marcan en rojo.</p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Card grande: próximo CIP */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Días para próximo CIP</span>
              <StateBadge state={cipTone} label={cip.days == null ? "Sin degradación" : cip.days <= 14 ? "Inminente" : cip.days <= 30 ? "Próximo" : "Holgado"} size="sm" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn("font-mono text-4xl font-bold tabular-nums", statusColor(cipTone).text)}>
                {cip.days ?? "—"}
              </span>
              <span className="text-sm text-muted-foreground">días</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Tren {cip.nextTrainCode ?? "—"} · disparo por {cip.trigger === "sec_threshold" ? "energía (SEC)" : cip.trigger === "rf_threshold" ? "ensuciamiento (Rf)" : "—"}
            </div>
            {cip.lastEvent && (
              <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Último CIP: <span className="font-mono">{cip.lastEvent.day}</span> en {cip.lastEvent.trainCode} · Rf {rf13(cip.lastEvent.rfBefore)} → {rf13(cip.lastEvent.rfAfter)} ×10¹³/m
              </div>
            )}
          </div>

          {/* Mini-cards CIP por rack */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {racks.map((r) => {
              const t = r.cipDays == null ? "stable" : r.cipDays <= 14 ? "falla" : r.cipDays <= 30 ? "fuera_rango" : "en_rango";
              return (
                <div key={r.code} className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="font-mono text-[11px] font-semibold">{r.code}</div>
                  <div className={cn("mt-0.5 font-mono text-lg font-bold tabular-nums", statusColor(t).text)}>{r.cipDays ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">días CIP</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Serie de energía específica (contexto) + explicación SEC ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Consumo específico de energía (SEC) — planta · todos los trenes</span>
            <TooltipProvider delay={120}>
              <Tooltip>
                <TooltipTrigger type="button" className="text-muted-foreground hover:text-[var(--accent)]" aria-label="Qué es SEC">
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs font-semibold">SEC — Specific Energy Consumption</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Energía neta consumida por cada m³ de permeado producido (kWh/m³), ya descontada la recuperación de energía del ERI. Es el KPI energético central de una desaladora de ósmosis inversa (SWRO): resume cuánta electricidad cuesta producir agua.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[var(--accent)]">
              {fmt(secNow, 2)} kWh/m³ · planta
            </span>
            <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
              {([["agg", "Planta"], ["trains", "Por tren"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setSecMode(k)}
                  className={cn("px-2 py-1 font-mono transition-colors", secMode === k ? "bg-[var(--accent)] text-black" : "text-muted-foreground hover:bg-muted")}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {secMode === "agg" ? (
              <AreaChart data={secSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: CHART.axis }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={44} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="agg" name="SEC planta (kWh/m³)" stroke={ACCENT} strokeWidth={2} fill="url(#gSec)" isAnimationActive={false} />
              </AreaChart>
            ) : (
              <LineChart data={secSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: CHART.axis }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={44} />
                <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {rackCodes.map((c, i) => (
                  <Line key={c} type="monotone" dataKey={c} name={c} stroke={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} strokeWidth={1.75} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        {secIVR && (
          <div className="mt-2 grid gap-3 border-t border-border pt-2 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estado actual</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                <span className="font-mono tabular-nums text-muted-foreground">base {fmt(secIVR.ideal)}</span>
                <span className="text-muted-foreground">→ real</span>
                <span className={cn("font-mono font-semibold tabular-nums", secBand.text)}>{fmt(secIVR.real)}</span>
                <span className="text-muted-foreground">kWh/m³</span>
                <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums", secBand.bg, secBand.text)}>
                  {secIVR.deviationPct >= 0 ? "+" : ""}{fmt(secIVR.deviationPct, 1)}%
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Banda: verde &lt; 5% · ámbar 5–12% · rojo &ge; 12% sobre la base.</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recomendación</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                SEC objetivo ≈ base + {thresholds.secRiseKwhM3} kWh/m³. Por encima de ese umbral se dispara la alerta energética: revisar ensuciamiento de membranas / eficiencia de bombas y ERI.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabla de racks ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">Trenes de ósmosis inversa — estado del gemelo</div>
        <SortableTable
          rows={racks}
          getRowKey={(r) => r.code}
          minWidth={720}
          columns={[
            { key: "train", header: "Tren", sortAccessor: (r) => r.code, render: (r) => (
              <div><div className="font-mono text-xs font-semibold">{r.code}</div><div className="text-[11px] text-muted-foreground">{r.name}</div></div>
            ) },
            { key: "health", header: "Salud compuesta", sortAccessor: (r) => r.health, render: (r) => <HealthBar value={r.health} /> },
            { key: "rf", header: <span>Rf actual · base <span className="text-[10px] font-normal text-muted-foreground">×10¹³/m</span></span>, sortAccessor: (r) => rackLive(r).rRf, render: (r) => {
              const { rRf, rfDelta } = rackLive(r);
              return (
                <span className="font-mono tabular-nums">{rf13(rRf)} <span className="text-muted-foreground">· {rf13(r.rfBase)}</span>
                  <span className={cn("ml-1 text-[10px]", rfDelta >= thresholds.rfRisePct ? "text-red-500" : rfDelta >= thresholds.rfRisePct * 0.66 ? "text-amber-500" : "text-muted-foreground")}>(+{fmt(rfDelta, 0)}%)</span>
                </span>
              );
            } },
            { key: "sec", header: "SEC", align: "right", sortAccessor: (r) => rackLive(r).rSec, render: (r) => <span className="font-mono tabular-nums">{fmt(rackLive(r).rSec)}<span className="ml-0.5 text-[10px] text-muted-foreground">kWh/m³</span></span> },
            { key: "tmp", header: "TMP", align: "right", sortAccessor: (r) => rackLive(r).rTmp, render: (r) => <span className="font-mono tabular-nums">{fmt(rackLive(r).rTmp, 1)}<span className="ml-0.5 text-[10px] text-muted-foreground">bar</span></span> },
            { key: "trend", header: "Tendencia", sortAccessor: (r) => trendRank[r.trend], render: (r) => <StateBadge state={TREND_KEY[r.trend]} label={TREND_LABEL[r.trend]} size="sm" /> },
            { key: "cip", header: "Días CIP", align: "right", sortAccessor: (r) => r.cipDays ?? null, render: (r) => <span className="font-mono font-semibold tabular-nums">{r.cipDays ?? "—"}</span> },
            { key: "status", header: "Estado", sortAccessor: (r) => r.status, render: (r) => <StateBadge state={r.status} size="sm" /> },
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          La salud compuesta combina ensuciamiento (Rf normalizado), presión transmembrana y consumo energético. Al cruzar el umbral de Rf (+{thresholds.rfRisePct}%) o de SEC (+{thresholds.secRiseKwhM3} kWh/m³) se programa el CIP.
        </p>
      </div>

      </div>
      )}
    </div>
  );
}
