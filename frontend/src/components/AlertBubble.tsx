"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X, Pencil, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn, apiUrl } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { AlertLevelBadge } from "@/components/AlertLevelBadge";
import { useInAppAlertPoll } from "@/lib/useInAppAlertPoll";
import type { InboxItem } from "@/lib/alert-inbox";

// ─────────────────────────────────────────────────────────────────────────────
// Burbuja de alertas in-app — se monta en el Shell, así que se ve en CUALQUIER
// pantalla.
//
// Reemplaza al silencio que había antes: una observación de terreno se
// guardaba y nadie se enteraba. El banner global existía pero sólo dispara con
// severidad high/critical, y en la práctica todas las observaciones nacían
// `medium`, así que nunca aparecía.
//
// Todo lo que se puede hacer desde acá reusa endpoints que ya existían:
//   · editar / tratar un hallazgo → PATCH /api/nonconformities/[id]
//   · reconocer / resolver una alerta de métrica → PATCH /api/oee/alerts
// El permiso lo decide el servidor (403); acá sólo se esconde lo que de todas
// formas iba a ser rechazado.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Abierto", in_review: "En revisión", closed: "Cerrado",
};
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function cuando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/**
 * `placement` define hacia dónde se abre el panel, porque la campanita vive en
 * dos lugares distintos del Shell: la barra superior (sólo mobile) y el riel
 * lateral de navegación (tablet/desktop, que en mobile no existe). Desde el
 * riel el panel tiene que salir hacia la derecha o se iría fuera de pantalla.
 */
export function AlertBubble({
  user,
  placement = "header",
  variant = "icon",
}: {
  user?: { displayName: string; role: string } | null;
  placement?: "header" | "sidebar";
  /**
   * El Shell tiene DOS sidebars según el ancho: el riel de íconos y el panel
   * expandido con etiquetas. "row" es la fila con texto del panel expandido —
   * sin esto la campanita sólo aparecía en el riel, que es justo el estado que
   * NO se ve en un escritorio.
   */
  variant?: "icon" | "row";
}) {
  const { items, unseen, markSeen, refresh } = useInAppAlertPoll();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const avisadas = useRef<Set<string>>(new Set());
  const panel = useRef<HTMLDivElement>(null);

  const puedeTratar = can(user?.role ?? "", "close_nc");
  const puedeReconocer = can(user?.role ?? "", "ack_alert");

  // Un toast por alerta nueva, una sola vez por sesión de página.
  useEffect(() => {
    for (const it of unseen) {
      if (avisadas.current.has(it.id)) continue;
      avisadas.current.add(it.id);
      const titulo = it.sourceType === "observation" ? "Observación de terreno" : "Alerta de proceso";
      const mostrar = it.level === "critico" ? toast.error : it.level === "advertencia" ? toast.warning : toast.info;
      mostrar(titulo, {
        description: it.message,
        action: { label: "Ver", onClick: () => setAbierto(true) },
      });
    }
  }, [unseen]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const enviar = async (url: string, body: unknown): Promise<boolean> => {
    const res = await fetch(apiUrl(url), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(d.error ?? "No se pudo aplicar el cambio");
      return false;
    }
    await refresh();
    return true;
  };

  const tratar = async (it: InboxItem, toStatus: string) => {
    if (!it.finding) return;
    const nota = window.prompt(`Nota de tratamiento para ${it.finding.code} (opcional):`) ?? undefined;
    const outcome = toStatus === "closed" ? "resolved" : undefined;
    if (await enviar(`/api/nonconformities/${it.finding.id}`, {
      action: "status_change", toStatus, treatmentOutcome: outcome, note: nota,
    })) toast.success(`${it.finding.code} → ${STATUS_LABEL[toStatus] ?? toStatus}`);
  };

  const guardarEdicion = async (it: InboxItem, description: string, severity: string) => {
    if (!it.finding) return;
    if (await enviar(`/api/nonconformities/${it.finding.id}`, { action: "edit", description, severity })) {
      toast.success(`${it.finding.code} actualizado`);
      setEditando(null);
    }
  };

  const reconocer = async (it: InboxItem) => {
    if (await enviar("/api/oee/alerts", { id: it.alertEventId, action: "ack" })) toast.success("Alerta reconocida");
  };

  const sinVer = unseen.length;

  return (
    <div className="relative" ref={panel}>
      <button
        onClick={() => {
          const proximo = !abierto;
          setAbierto(proximo);
          if (proximo) markSeen();
        }}
        aria-label={sinVer > 0 ? `${sinVer} alertas sin ver` : "Alertas"}
        aria-expanded={abierto}
        className={cn(
          "eam-focus relative transition-colors",
          variant === "row"
            ? "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            : "rounded-md p-1.5 text-[var(--foreground)] hover:bg-[var(--muted)]",
        )}
      >
        <Bell className={variant === "row" ? "h-3.5 w-3.5 shrink-0" : "h-5 w-5"} />
        {variant === "row" && <span>Alertas</span>}
        {sinVer > 0 && (
          <span
            className={cn(
              "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white",
              variant === "row" ? "ml-auto" : "absolute -right-0.5 -top-0.5",
            )}
          >
            {sinVer > 9 ? "9+" : sinVer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className={cn(
            "absolute z-50 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg",
            placement === "sidebar" ? "bottom-0 left-full ml-2" : "right-0 mt-2",
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-semibold text-[var(--foreground)]">Alertas</span>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="eam-focus rounded p-0.5 hover:bg-[var(--muted)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">Sin alertas todavía.</p>
          )}

          <ul className="divide-y divide-[var(--border)]">
            {items.map((it) => (
              <li key={it.id} className={cn("px-3 py-2.5", !unseen.some((u) => u.id === it.id) ? "" : "bg-[var(--muted)]/40")}>
                <div className="flex items-start gap-2">
                  <AlertLevelBadge level={it.level} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[var(--foreground)]">
                      {it.sourceType === "observation" ? "Observación de terreno" : "Alerta de proceso"}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-[var(--muted-foreground)]">{it.message}</p>

                    {it.finding && (
                      <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                        {it.finding.code} · gravedad {SEVERITY_LABEL[it.finding.severity] ?? it.finding.severity} ·{" "}
                        {STATUS_LABEL[it.finding.status] ?? it.finding.status}
                        {it.finding.raisedBy ? ` · ${it.finding.raisedBy}` : ""}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{cuando(it.createdAt)}</p>

                    {editando === it.id && it.finding ? (
                      <EditarHallazgo
                        inicial={{ description: it.finding.description, severity: it.finding.severity }}
                        onCancelar={() => setEditando(null)}
                        onGuardar={(d, s) => guardarEdicion(it, d, s)}
                      />
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {it.finding && puedeTratar && it.finding.status !== "closed" && (
                          <>
                            <Accion icon={Pencil} label="Editar" onClick={() => setEditando(it.id)} />
                            {it.finding.status === "open" && (
                              <Accion icon={ChevronRight} label="En revisión" onClick={() => tratar(it, "in_review")} />
                            )}
                            <Accion icon={Check} label="Cerrar" onClick={() => tratar(it, "closed")} />
                          </>
                        )}
                        {!it.finding && puedeReconocer && it.status === "activa" && (
                          <Accion icon={Check} label="Reconocer" onClick={() => reconocer(it)} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Accion({
  icon: Icon, label, onClick,
}: { icon: typeof Check; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="eam-focus inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function EditarHallazgo({
  inicial, onCancelar, onGuardar,
}: {
  inicial: { description: string; severity: string };
  onCancelar: () => void;
  onGuardar: (description: string, severity: string) => void;
}) {
  const [description, setDescription] = useState(inicial.description);
  const [severity, setSeverity] = useState(inicial.severity);
  return (
    <div className="mt-2 space-y-1.5">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        aria-label="Descripción del hallazgo"
        className="eam-focus w-full rounded border border-[var(--border)] bg-[var(--background)] p-1.5 text-xs text-[var(--foreground)]"
      />
      <div className="flex items-center gap-1.5">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          aria-label="Gravedad"
          className="eam-focus rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--foreground)]"
        >
          {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
        </select>
        <Accion icon={Check} label="Guardar" onClick={() => onGuardar(description.trim(), severity)} />
        <Accion icon={X} label="Cancelar" onClick={onCancelar} />
      </div>
    </div>
  );
}
