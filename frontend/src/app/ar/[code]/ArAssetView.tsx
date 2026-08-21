"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Radio, TriangleAlert, ClipboardPen, X, Gauge } from "lucide-react";
import { StateBadge } from "@/components/mes";
import { apiUrl, cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { users } from "@/lib/users";
import { PLANT } from "@/lib/plant-config";
import { useSignalSim } from "@/lib/useSignalSim";
import type { ArView, ArSignal, ArSeverity } from "@/lib/ar";

const SEV: Record<ArSeverity, { dot: string; text: string; label: string }> = {
  out: { dot: "#dc2626", text: "text-red-500", label: "Fuera de banda" },
  warn: { dot: "#d97706", text: "text-amber-500", label: "En el borde" },
  ok: { dot: "#16a34a", text: "text-emerald-500", label: "Normal" },
};
const healthColor = (h: number) => (h >= 80 ? "#16a34a" : h >= 60 ? "#d97706" : "#dc2626");
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("es-CL") : n);

type Identity = { displayName: string; role: string } | null;

export function ArAssetView({ initial, code }: { initial: ArView; code: string }) {
  const [view, setView] = useState<ArView>(initial);
  const [identity, setIdentity] = useState<Identity>(null);
  const [panel, setPanel] = useState(false);

  // Poll "en vivo" cada 10 s (verdad del server).
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(apiUrl(`/api/ar/${encodeURIComponent(code)}`));
        if (r.ok) setView(await r.json());
      } catch { /* red intermitente en terreno: mantener último */ }
    }, 10000);
    return () => clearInterval(t);
  }, [code]);

  // Identidad actual (para habilitar acciones).
  useEffect(() => {
    fetch(apiUrl("/api/auth/me")).then((r) => r.json()).then((d) => { if (d.user) setIdentity(d.user); }).catch(() => {});
  }, []);

  // Jitter de la señal primaria → sensación viva sobre la base del poll.
  const eqDefs = useMemo(() => PLANT.equipment.filter((e) => e.code === code), [code]);
  const live = useSignalSim(eqDefs);
  const primaryLive = live[code]?.value;

  const eq = view.equipment;
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-4 pb-28">
      {/* Identidad del activo */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-2xl font-bold tracking-tight">{eq.code}</div>
            <div className="mt-0.5 text-sm">{eq.name}</div>
          </div>
          <StateBadge state={eq.status} size="sm" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5">{eq.areaName}</span>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5">{eq.category}</span>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5">Criticidad: {eq.criticality}</span>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-[var(--muted-foreground)]"><span>Índice de salud</span><span className="font-mono" style={{ color: healthColor(eq.health) }}>{eq.health}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]"><div className="h-full rounded-full" style={{ width: `${eq.health}%`, background: healthColor(eq.health) }} /></div>
        </div>
        {eq.help && <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">{eq.help}</p>}
      </section>

      {/* Contraste físico vs proceso (racks RO) */}
      {view.ro && <RoContrast ro={view.ro} />}

      {/* Variables importantes */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <Radio className="h-3.5 w-3.5" /> Variables del proceso
        </div>
        {view.signals.map((s) => (
          <SignalCard key={s.signal} s={s} liveValue={s.primary ? primaryLive : undefined} />
        ))}
        {view.signals.length === 0 && <p className="px-1 text-sm text-[var(--muted-foreground)]">Este activo no tiene señales instrumentadas.</p>}
      </section>

      <p className="px-1 text-center text-[10px] text-[var(--muted-foreground)]">
        Contrastá estas lecturas con lo que observás en el equipo. Actualiza cada 10 s · datos de demostración simulados.
      </p>

      {/* Barra de acción fija */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--card)]/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          <button onClick={() => setPanel(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white active:opacity-90">
            <ClipboardPen className="h-4 w-4" /> Levantar observación de terreno
          </button>
        </div>
      </div>

      {panel && (
        <ObservationPanel code={code} assetName={eq.name} identity={identity}
          onIdentify={setIdentity} onClose={() => setPanel(false)} />
      )}
    </div>
  );
}

function SignalCard({ s, liveValue }: { s: ArSignal; liveValue?: number }) {
  const sev = SEV[s.severity];
  const shown = liveValue ?? s.value;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sev.dot }} />
            <span className="truncate text-sm font-medium">{s.label}</span>
            {s.primary && <span className="rounded bg-[var(--accent)]/15 px-1 text-[9px] font-medium text-[var(--accent)]">PRIMARIA</span>}
          </div>
          {s.desc && <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted-foreground)]">{s.desc}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("font-mono text-xl font-semibold tabular-nums", sev.text)}>
            {fmt(Math.round(shown * 100) / 100)}<span className="ml-0.5 text-xs font-normal text-[var(--muted-foreground)]">{s.unit}</span>
          </div>
          {s.primary && liveValue != null && <div className="text-[9px] text-[var(--muted-foreground)]">estimado en vivo</div>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>{s.min != null && s.max != null ? `Banda normal: ${fmt(s.min)}–${fmt(s.max)} ${s.unit}` : "Sin banda definida"}</span>
        <span className={sev.text}>{sev.label}</span>
      </div>
    </div>
  );
}

function RoContrast({ ro }: { ro: NonNullable<ArView["ro"]> }) {
  const { rack, idealVsReal, oee } = ro;
  const trendLabel: Record<string, string> = { stable: "Estable", rising: "En aumento", critical: "Crítico" };
  return (
    <section className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-[var(--accent)]" /> Físico vs proceso — Tren RO</div>
      {/* Ideal vs real */}
      <div className="mt-3 space-y-2">
        {idealVsReal.map((r) => {
          const bad = Math.abs(r.deviationPct) >= 8;
          return (
            <div key={r.label} className="flex items-center justify-between rounded-lg bg-[var(--card)] px-3 py-2 text-sm">
              <span className="text-[var(--muted-foreground)]">{r.label}</span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-[11px] text-[var(--muted-foreground)]">ideal {r.ideal}</span>
                <span className="font-semibold">{r.real} {r.unit}</span>
                <span className={cn("w-12 text-right text-[11px]", bad ? "text-red-500" : "text-emerald-500")}>{r.deviationPct > 0 ? "+" : ""}{r.deviationPct}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* OEE + salud + CIP */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[var(--card)] py-2"><div className="font-mono text-lg font-semibold">{oee?.oee ?? "—"}%</div><div className="text-[10px] text-[var(--muted-foreground)]">OEE tren</div></div>
        <div className="rounded-lg bg-[var(--card)] py-2"><div className="font-mono text-lg font-semibold" style={{ color: healthColor(rack.health) }}>{rack.health}%</div><div className="text-[10px] text-[var(--muted-foreground)]">Salud membrana</div></div>
        <div className="rounded-lg bg-[var(--card)] py-2"><div className="font-mono text-lg font-semibold">{rack.cipDays ?? "—"}</div><div className="text-[10px] text-[var(--muted-foreground)]">Días a CIP</div></div>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
        Ensuciamiento: <span className={cn(rack.trend === "critical" ? "text-red-500" : rack.trend === "rising" ? "text-amber-500" : "text-emerald-500")}>{trendLabel[rack.trend] ?? rack.trend}</span>
        {oee && <> · Disp {oee.availability}% · Rend {oee.performance}% · Cal {oee.quality}%</>}
      </div>
    </section>
  );
}

// ── Panel de observación (identificación + formulario) ───────────────────────
function ObservationPanel({ code, assetName, identity, onIdentify, onClose }: {
  code: string; assetName: string; identity: Identity;
  onIdentify: (i: Identity) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [intervention, setIntervention] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const canRaise = identity && can(identity.role, "raise_observation");

  const login = async (username: string, password: string) => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      if (!res.ok) { toast.error("No se pudo identificar"); return; }
      const me = await fetch(apiUrl("/api/auth/me")).then((r) => r.json());
      if (me.user) { onIdentify(me.user); toast.success(`Identificado: ${me.user.displayName}`); }
    } catch { toast.error("Error de red"); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!description.trim()) { toast.error("Escribí la observación"); taRef.current?.focus(); return; }
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/ar/observation"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, description, severity, intervention }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo registrar"); return; }
      toast.success(`Observación ${data.code} registrada`);
      onClose();
    } catch { toast.error("Error de red"); } finally { setBusy(false); }
  };

  // Operadores de terreno primero (Mantenedor), luego el resto que puede levantar.
  const candidates = users.filter((u) => ["Mantenedor", "Planificador", "Supervisor"].includes(u.role))
    .sort((a, b) => (a.role === "Mantenedor" ? -1 : 1));

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Observación de terreno</div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--muted)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-3 rounded-lg bg-[var(--muted)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
          Activo <span className="font-mono text-[var(--foreground)]">{code}</span> · {assetName}
        </div>

        {!identity ? (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--muted-foreground)]">Para dejar registro trazable, identificate:</p>
            <div className="grid grid-cols-2 gap-2">
              {candidates.map((u) => (
                <button key={u.id} disabled={busy} onClick={() => login(u.username, u.password)}
                  className="rounded-lg border border-[var(--border)] p-2 text-left text-xs hover:border-[var(--accent)]/60 disabled:opacity-50">
                  <div className="font-medium">{u.displayName}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{u.role}</div>
                </button>
              ))}
            </div>
          </div>
        ) : !canRaise ? (
          <p className="py-4 text-center text-sm text-amber-500">Tu rol ({identity.role}) no puede levantar observaciones.</p>
        ) : (
          <div className="space-y-3">
            <div className="text-[11px] text-[var(--muted-foreground)]">Registrando como <span className="font-medium text-[var(--foreground)]">{identity.displayName}</span></div>
            <textarea ref={taRef} value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="¿Qué observás en el equipo? (fuga, ruido, vibración, fuera de servicio…)"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm" />
            <div className="flex items-center gap-3">
              <label className="flex flex-1 flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">Severidad
                <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm">
                  <option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option>
                </select>
              </label>
              <label className="flex flex-1 items-center gap-2 pt-4 text-xs">
                <input type="checkbox" checked={intervention} onChange={(e) => setIntervention(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                <span className="flex items-center gap-1"><TriangleAlert className="h-3.5 w-3.5 text-amber-500" /> Requiere intervención</span>
              </label>
            </div>
            {intervention && <p className="text-[11px] text-amber-500">Se marcará severidad alta y quedará para que Planificación evalúe una OT.</p>}
            <button onClick={submit} disabled={busy}
              className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white active:opacity-90 disabled:opacity-50">
              {busy ? "Enviando…" : "Registrar observación"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
