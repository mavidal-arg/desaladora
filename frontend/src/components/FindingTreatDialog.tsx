"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/utils";
import { StateBadge } from "@/components/mes";
import type { NonConformity, Criticality } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────────
// Panel de tratamiento de un hallazgo — editar/corregir + transicionar estado +
// ver el log de acciones. Compartido por /hallazgos y la pestaña SOP de
// Asset360Modal, para no duplicar el formulario en dos lugares.
// ─────────────────────────────────────────────────────────────────────────────

const FINDING_TYPES = ["corrosion", "fuga_sello", "vibracion", "otro"] as const;
const FINDING_TYPE_LABELS: Record<string, string> = {
  corrosion: "Corrosión", fuga_sello: "Fuga / sello", vibracion: "Vibración anormal", otro: "Otro",
};
const SEVERITIES: Criticality[] = ["low", "medium", "high", "critical"];
const SEV_LABEL: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
const ACTION_LABEL: Record<string, string> = {
  created: "Levantado", edited: "Editado", status_changed: "Cambio de estado", note: "Nota",
};

type ActionRow = {
  id: string; action: string; fromStatus: string | null; toStatus: string | null;
  note: string | null; actor: string; actorRole: string | null; createdAt: string;
};

const inputCls = "rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]";

export function FindingTreatDialog({ nc, canTreat, onClose, onTreated }: {
  nc: NonConformity;
  canTreat: boolean;
  onClose: () => void;
  onTreated: (updated: NonConformity) => void;
}) {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [description, setDescription] = useState(nc.description);
  const [severity, setSeverity] = useState<Criticality>(nc.severity);
  const [findingType, setFindingType] = useState(nc.findingType);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadActions = () => {
    fetch(apiUrl(`/api/nonconformities/${nc.id}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.actions) setActions(d.actions); });
  };
  useEffect(loadActions, [nc.id]);

  const send = async (body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/nonconformities/${nc.id}`), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo tratar el hallazgo"); return; }
      toast.success("Hallazgo actualizado");
      onTreated(data as NonConformity);
      setNote("");
      loadActions();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = () => send({ action: "edit", description, severity, findingType, note: note || undefined });
  const changeStatus = (toStatus: "open" | "in_review" | "closed", treatmentOutcome?: "resolved" | "false_positive") =>
    send({ action: "status_change", toStatus, treatmentOutcome, note: note || undefined });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mt-4 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">{nc.code}</span>
              <StateBadge state={nc.severity} size="sm" />
              <StateBadge state={nc.status} size="sm" />
              {nc.treatmentOutcome && <StateBadge state={nc.treatmentOutcome} size="sm" />}
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {nc.raisedBy ? `Levantado por ${nc.raisedBy}${nc.raisedByRole ? ` · ${nc.raisedByRole}` : ""}` : "Levantado por el sistema"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">
          {canTreat ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Descripción
                <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                  Severidad
                  <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value as Criticality)}>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                  Categoría
                  <select className={inputCls} value={findingType} onChange={(e) => setFindingType(e.target.value)}>
                    {FINDING_TYPES.map((t) => <option key={t} value={t}>{FINDING_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)]">
                Nota de tratamiento
                <textarea className={inputCls} rows={2} placeholder="Qué se hizo / por qué se corrige…" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={saveEdit} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-60">
                  Guardar edición
                </button>
                {nc.status !== "in_review" && (
                  <button disabled={busy} onClick={() => changeStatus("in_review")} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-60">
                    Poner en revisión
                  </button>
                )}
                {nc.status !== "open" && (
                  <button disabled={busy} onClick={() => changeStatus("open")} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-60">
                    Reabrir
                  </button>
                )}
                {nc.status !== "closed" && (
                  <>
                    <button disabled={busy} onClick={() => changeStatus("closed", "resolved")} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                      Cerrar · resuelto
                    </button>
                    <button disabled={busy} onClick={() => changeStatus("closed", "false_positive")} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-60">
                      Cerrar · falso positivo
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
              Tu rol no puede tratar hallazgos — sólo lectura del log.
            </p>
          )}

          <div>
            <h4 className="mb-1.5 text-xs font-semibold">Log de acciones ({actions.length})</h4>
            {actions.length === 0 ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">Sin acciones registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {actions.map((a) => (
                  <li key={a.id} className="rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                      <span className="shrink-0 text-[var(--muted-foreground)]">{new Date(a.createdAt).toLocaleString("es-CL")}</span>
                    </div>
                    <div className="text-[var(--muted-foreground)]">
                      {a.actor}{a.actorRole ? ` · ${a.actorRole}` : ""}
                      {a.fromStatus && a.toStatus ? ` · ${a.fromStatus} → ${a.toStatus}` : ""}
                      {a.note ? ` · "${a.note}"` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
