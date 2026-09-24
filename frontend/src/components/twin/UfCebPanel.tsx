"use client";

import { useState } from "react";
import { StateBadge } from "@/components/mes";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import { SortableTable } from "@/components/SortableTable";
import { InfoTip } from "@/components/ui/info-tip";
import { statusColor, CHART } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { UF_REGIME_LABELS, type UfSummary, type UfSkidRow } from "@/lib/twin-types";

// ─────────────────────────────────────────────────────────────────────────────
// Ultrafiltración — el ciclo de CEB.
//
// Panel hermano del de ósmosis inversa, con la MISMA forma para que se lea como
// un solo sistema, pero graficando el otro régimen de regeneración. Las dos
// diferencias que el panel tiene que dejar ver, porque son de proceso:
//
//   · la UF no va a CIP, va a CEB — retrolavado con reactivo inyectado en línea
//     a cada skid (ADV-129-00-DGM-PL-002 NOTA 5);
//   · el ciclo dura HORAS, no semanas. De ahí que acá se cuente en horas y en
//     el panel de RO en días.
//
// La variable de estado es la permeabilidad K = flux / TMP: cae mientras el skid
// filtra y el CEB la recupera. Ése es el diente de sierra del gráfico.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

const TREND_KEY: Record<UfSkidRow["trend"], string> = {
  stable: "stable",
  rising: "fuera_rango",
  critical: "falla",
};

function Kpi({ label, value, unit, hint, accent, info }: {
  label: string; value: string | number; unit?: string; hint?: string; accent?: boolean; info?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
        {info && <InfoTip srLabel={`Qué es ${label}`}>{info}</InfoTip>}
      </div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", accent && "text-[var(--accent)]")}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function UfCebPanel({ data }: { data: UfSummary }) {
  const { skids, trend, ceb, thresholds } = data;
  const [selected, setSelected] = useState<string>(() => ceb.nextSkidCode ?? skids[0]?.code ?? "");
  const lead = skids.find((s) => s.code === ceb.nextSkidCode) ?? skids[0];
  const sel = skids.find((s) => s.code === selected) ?? lead;

  // Límite de control del CEB: la permeabilidad cae hasta este valor y ahí se
  // retrolava. CL = membrana recién retrolavada (base del ciclo).
  const cl = sel?.kBase ?? 0;
  const lcl = cl * (1 - thresholds.permDropPct / 100);

  const tone = ceb.hours == null ? "stable" : ceb.hours <= 2 ? "falla" : ceb.hours <= 4 ? "fuera_rango" : "en_rango";
  const cyclesTotal = skids.reduce((s, k) => s + k.cebCycles, 0);

  return (
      <div className="space-y-4">
        {/* Qué es el CEB, y por qué no es un CIP */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Régimen de regeneración: CEB</span>
            <InfoTip srLabel="Diferencia entre CEB y CIP" side="bottom">
              <p className="text-xs font-semibold">CEB, CIP y preservación</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                No son alternativos: son cosas distintas, y el plano de ingeniería las separa por clase de
                servicio (ADV-129-00-DGM-PL-002).
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-muted-foreground">
                <li>
                  <strong className="text-[var(--foreground)]">CEB</strong> — clase B, dosificación
                  periódica. Retrolavado con reactivo inyectado <em>en línea a cada skid</em> (NOTA 5), con
                  la bomba A19 y el estanque BW/CEB de 283 m³. Reactivos: NaOCl, NaOH, H₂SO₄. Dura minutos y
                  quita el ensuciamiento <em>reversible</em>. Es el régimen que esta app opera para la UF.
                </li>
                <li>
                  <strong className="text-[var(--foreground)]">CIP de UF</strong> — clase C, limpieza
                  química. Baño en batch recirculado desde el estanque A21 (13 m³, llenado con permeado RO,
                  NOTA 6), con el skid aislado. Dura horas y recupera el ensuciamiento{" "}
                  <em>irreversible</em>. Está instalado en la planta pero{" "}
                  <strong className="text-[var(--foreground)]">no se modela en esta versión</strong>.
                </li>
                <li>
                  <strong className="text-[var(--foreground)]">Preservación</strong> — clase D, condición
                  especial. Metabisulfito de sodio + agua de desplazamiento cuando un skid queda fuera de
                  servicio. No limpia: conserva.
                </li>
              </ul>
            </InfoTip>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            La ultrafiltración opera a <strong>flux constante</strong>: lo que sube durante el ciclo es la
            presión transmembrana, y con ella cae la permeabilidad K = flux / TMP. Cuando K queda{" "}
            {thresholds.permDropPct}% por debajo de la base se ejecuta el CEB y el ciclo vuelve a empezar —
            el diente de sierra del gráfico. A diferencia del CIP de los trenes RO, que se cuenta en
            semanas, <strong>este ciclo se cuenta en horas</strong>.
          </p>
        </div>

        {/* KPIs del skid seleccionado */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi
            label="Permeabilidad"
            value={fmt(sel?.k ?? null)}
            unit="LMH/bar"
            accent
            hint={`base ${fmt(sel?.kBase ?? null)}`}
            info={
              <p className="text-[11px] leading-snug">
                K = flux / TMP. <strong>Sin normalizar a 20 °C</strong>: la corrección por temperatura exige
                un transmisor por skid y este modelo sólo instrumenta la temperatura de captación —
                aplicarla a los tres skids sería fabricar una precisión que el dato no tiene.
              </p>
            }
          />
          <Kpi label="TMP" value={fmt(sel?.tmp ?? null, 2)} unit="bar" hint="presión transmembrana" />
          <Kpi label="Flux" value={fmt(sel?.flux ?? null)} unit="LMH" hint="operación a flux constante" />
          <Kpi label="Turbidez salida" value={fmt(sel?.turbidity ?? null, 3)} unit="NTU" hint="integridad de fibra" />
          <Kpi label="Ciclos CEB" value={cyclesTotal} hint={`en la serie · ${skids.length} skids`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Diente de sierra + límite de control */}
          <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">
                  Permeabilidad vs límite de control (CEB) — Skid{" "}
                  <span className="font-mono text-[var(--accent)]">{sel?.code ?? "—"}</span>
                </span>
                <InfoTip srLabel="Cómo se lee el diente de sierra" side="bottom">
                  <p className="text-xs font-semibold">El ciclo de CEB, visto</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Cada tramo descendente es un ciclo de filtración: el módulo se ensucia y la
                    permeabilidad baja. Cada salto hacia arriba es un <strong>CEB</strong> que la recupera.
                    La línea central (CL) es la membrana recién retrolavada; la inferior (LCL) es el umbral
                    de −{thresholds.permDropPct}% que dispara el próximo retrolavado.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                    Si los dientes se vuelven más cortos ciclo a ciclo, el CEB está dejando de alcanzar: es
                    la señal de que se acumula ensuciamiento irreversible.
                  </p>
                </InfoTip>
              </div>
              <div className="flex gap-1">
                {skids.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setSelected(s.code)}
                    className={cn(
                      "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                      s.code === selected
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-border text-muted-foreground hover:text-[var(--foreground)]",
                    )}
                  >
                    {s.code}
                  </button>
                ))}
              </div>
            </div>
            {trend.length ? (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 8, right: 46, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: CHART.axis }} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis
                      domain={[Math.floor(lcl * 0.96), Math.ceil(cl * 1.04)]}
                      tick={{ fontSize: 10, fill: CHART.axis }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      unit=""
                    />
                    <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={cl} stroke="#71717a" strokeDasharray="4 2" label={{ value: "CL", position: "right", fontSize: 10, fill: "#a1a1aa" }} />
                    <ReferenceLine y={lcl} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "LCL", position: "right", fontSize: 10, fill: "#ef4444" }} />
                    {/* `linear` y no `monotone`: la recuperación del CEB es un salto,
                        y suavizarla borraría justamente lo que hay que ver. */}
                    <Line type="linear" dataKey="k" name="Permeabilidad (LMH/bar)" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin serie de permeabilidad.</p>
            )}
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Serie horaria de las últimas {trend.length} h. CL = permeabilidad de membrana recién
              retrolavada; LCL = umbral de CEB (−{thresholds.permDropPct}%).
            </p>
          </div>

          {/* Próximo CEB */}
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Horas para próximo CEB
                </span>
                <StateBadge
                  state={tone}
                  label={ceb.hours == null ? "Sin degradación" : ceb.hours <= 2 ? "Inminente" : ceb.hours <= 4 ? "Próximo" : "Holgado"}
                  size="sm"
                />
              </div>
              <div className="mt-1 font-mono text-4xl font-semibold tabular-nums text-[var(--accent)]">
                {ceb.hours ?? "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">h</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Skid {ceb.nextSkidCode ?? "—"} · disparo por caída de permeabilidad
                {ceb.avgCycleH != null && <> · ciclo medio {ceb.avgCycleH} h</>}
              </p>
              {ceb.lastEvent && (
                <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] leading-snug text-muted-foreground">
                  Último CEB: <span className="font-mono">{ceb.lastEvent.at.slice(0, 16).replace("T", " ")}</span>{" "}
                  en {ceb.lastEvent.skidCode} · K {ceb.lastEvent.kBefore} → {ceb.lastEvent.kAfter} LMH/bar ·
                  reactivo {ceb.lastEvent.chemical}
                </p>
              )}
            </div>

            {/* Mini-cards por skid */}
            <div className="grid grid-cols-3 gap-2">
              {skids.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setSelected(s.code)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-colors",
                    s.code === selected ? "border-[var(--accent)]" : "border-border hover:border-[var(--accent)]/40",
                  )}
                >
                  <div className="font-mono text-[11px] font-semibold">{s.code}</div>
                  <div className="font-mono text-lg font-semibold tabular-nums" style={{ color: statusColor(TREND_KEY[s.trend]).text }}>
                    {s.cebHours ?? "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">horas CEB</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla de skids */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">Skids de ultrafiltración</div>
          <SortableTable
            rows={skids}
            getRowKey={(s) => s.code}
            minWidth={640}
            initialSort={{ key: "ceb", dir: "asc" }}
            emptyText="Sin skids de ultrafiltración."
            columns={[
              { key: "code", header: "Código", sortAccessor: (s) => s.code, render: (s) => <span className="font-mono font-semibold">{s.code}</span> },
              { key: "name", header: "Equipo", sortAccessor: (s) => s.name, render: (s) => s.name },
              { key: "regime", header: "Régimen", sortAccessor: (s) => s.regime, render: (s) => (
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {UF_REGIME_LABELS[s.regime]}
                </span>
              ) },
              { key: "k", header: "K (LMH/bar)", align: "right", sortAccessor: (s) => s.k ?? null, render: (s) => <span className="font-mono tabular-nums">{fmt(s.k)}</span> },
              { key: "tmp", header: "TMP (bar)", align: "right", sortAccessor: (s) => s.tmp ?? null, render: (s) => <span className="font-mono tabular-nums">{fmt(s.tmp, 2)}</span> },
              { key: "turb", header: "Turbidez (NTU)", align: "right", sortAccessor: (s) => s.turbidity ?? null, render: (s) => <span className="font-mono tabular-nums">{fmt(s.turbidity, 3)}</span> },
              { key: "health", header: "Salud", align: "right", sortAccessor: (s) => s.health, render: (s) => <span className="font-mono tabular-nums">{s.health}%</span> },
              { key: "ceb", header: "Horas CEB", align: "right", sortAccessor: (s) => s.cebHours ?? null, render: (s) => (
                <span className="font-mono font-semibold tabular-nums" style={{ color: statusColor(TREND_KEY[s.trend]).text }}>
                  {s.cebHours ?? "—"}
                </span>
              ) },
              { key: "status", header: "Estado", sortAccessor: (s) => s.status, render: (s) => <StateBadge state={s.status} /> },
            ]}
          />
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            El intervalo de CEB y el umbral de −{thresholds.permDropPct}% son un{" "}
            <strong>supuesto de demo</strong>: los planos ADV son diagramas de flujo y balance de masas, no
            filosofía de operación, y no traen períodos de ciclo. Hay que validarlos con Aguas del Valle
            antes de congelarlos.
          </p>
        </div>
      </div>
  );
}
