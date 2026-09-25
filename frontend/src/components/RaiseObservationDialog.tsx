"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, TriangleAlert, X } from "lucide-react";
import { apiUrl, cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { esEquipCategory } from "@/lib/labels";
import type { Equipment } from "@/lib/adapters/types";

type Identity = { displayName: string; role: string } | null;

/** Persona del directorio (`/api/auth/directory`): sin clave, a propósito. */
type Persona = { id: string; username: string; displayName: string; role: string; department: string };

/**
 * Levantar una NC sin pasar por el QR de un activo. Pedido de Eduardo: hoy
 * la única puerta es `ArAssetView` (escanear el QR), lo que impide levantar
 * un hallazgo que no está asociado a un código. Mismo endpoint
 * (`POST /api/ar/observation`) y mismo candado de clave, con selector de
 * activo en vez de un código fijo por la URL.
 */
export function RaiseObservationDialog({ equipment, onClose, onCreated }: {
  equipment: Equipment[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [identity, setIdentity] = useState<Identity>(null);
  const [checkingIdentity, setCheckingIdentity] = useState(true);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [elegida, setElegida] = useState<Persona | null>(null);
  const [clave, setClave] = useState("");
  const [errorClave, setErrorClave] = useState("");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [intervention, setIntervention] = useState(false);
  const [busy, setBusy] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const claveRef = useRef<HTMLInputElement>(null);

  const canRaise = identity && can(identity.role, "raise_observation");

  // Igual que en el panel del QR: sólo cuenta la sesión acreditada con clave.
  useEffect(() => {
    fetch(apiUrl("/api/auth/me"))
      .then((r) => r.json())
      .then((d) => { if (d.user && d.via === "password") setIdentity(d.user); })
      .catch(() => {})
      .finally(() => setCheckingIdentity(false));
  }, []);

  useEffect(() => {
    if (identity) return;
    fetch(apiUrl("/api/auth/directory"))
      .then((r) => r.json())
      .then((d: { users?: Persona[] }) => {
        const aptos = (d.users ?? []).filter((u) => can(u.role, "raise_observation"));
        setPersonas([...aptos].sort((a, b) => (a.role === "Mantenedor" ? -1 : b.role === "Mantenedor" ? 1 : 0)));
      })
      .catch(() => setPersonas([]));
  }, [identity]);

  useEffect(() => { if (elegida) claveRef.current?.focus(); }, [elegida]);

  const identificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!elegida || !clave) return;
    setBusy(true);
    setErrorClave("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: elegida.username, password: clave }),
      });
      if (!res.ok) {
        setErrorClave(res.status === 401 ? "La clave no es correcta." : "No se pudo identificar.");
        setClave("");
        claveRef.current?.focus();
        return;
      }
      const me = await fetch(apiUrl("/api/auth/me")).then((r) => r.json());
      if (me.user) { setIdentity(me.user); toast.success(`Identificado: ${me.user.displayName}`); }
    } catch {
      setErrorClave("No se pudo conectar.");
    } finally { setBusy(false); }
  };

  const salir = async () => {
    setBusy(true);
    try {
      await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
      setIdentity(null);
      setElegida(null); setClave(""); setErrorClave("");
    } catch { toast.error("Error de red"); } finally { setBusy(false); }
  };

  const q = query.trim().toLowerCase();
  const matches = equipment
    .filter((e) => !q || e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
    .sort((a, b) => a.code.localeCompare(b.code));

  const submit = async () => {
    if (!selected) { toast.error("Elegí el activo"); return; }
    if (!description.trim()) { toast.error("Escribí la observación"); taRef.current?.focus(); return; }
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/ar/observation"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: selected.code, description, severity, intervention }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "No se pudo registrar"); return; }
      toast.success(`Levantamiento ${data.code} registrado`);
      onCreated();
      onClose();
    } catch { toast.error("Error de red"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mt-4 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-4">
          <div className="text-sm font-semibold">Nuevo levantamiento</div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {checkingIdentity ? (
            <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">Verificando identidad…</p>
          ) : !identity && !elegida ? (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--muted-foreground)]">Para dejar registro trazable, identificate:</p>
              {personas === null && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">Cargando personas…</p>}
              <div className="grid grid-cols-2 gap-2">
                {(personas ?? []).map((u) => (
                  <button key={u.id} onClick={() => { setElegida(u); setClave(""); setErrorClave(""); }}
                    className="rounded-lg border border-[var(--border)] p-2 text-left text-xs hover:border-[var(--accent)]/60">
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{u.role}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : !identity ? (
            <form onSubmit={identificar} className="space-y-3">
              <button type="button" onClick={() => { setElegida(null); setClave(""); setErrorClave(""); }}
                className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                ‹ Cambiar de persona
              </button>
              <div className="rounded-lg border border-[var(--border)] p-2">
                <div className="text-sm font-medium">{elegida!.displayName}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{elegida!.role} · {elegida!.department}</div>
              </div>
              {/* El gestor de claves necesita ver el usuario para asociar la clave. */}
              <input type="text" name="username" autoComplete="username" value={elegida!.username}
                readOnly tabIndex={-1} aria-hidden className="sr-only" />
              <label className="block text-[11px] text-[var(--muted-foreground)]">
                Clave
                <input ref={claveRef} type="password" autoComplete="current-password" value={clave}
                  onChange={(e) => setClave(e.target.value)} placeholder="Tu clave"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 font-mono text-sm text-[var(--foreground)]" />
              </label>
              {errorClave && <p className="text-[11px] text-red-500">{errorClave}</p>}
              <button type="submit" disabled={busy || !clave}
                className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-foreground)] active:opacity-90 disabled:opacity-50">
                {busy ? "Verificando…" : "Identificarme"}
              </button>
            </form>
          ) : !canRaise ? (
            <p className="py-4 text-center text-sm text-amber-500">Tu rol ({identity.role}) no puede levantar observaciones.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--muted)] px-3 py-2 text-[11px]">
                <span className="text-[var(--muted-foreground)]">
                  Registrando como <span className="font-medium text-[var(--foreground)]">{identity.displayName}</span>
                  <span className="text-[var(--muted-foreground)]"> · {identity.role}</span>
                </span>
                <button type="button" onClick={salir} disabled={busy}
                  className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] hover:border-[var(--accent)]/60 disabled:opacity-50">
                  No soy yo
                </button>
              </div>

              {selected ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-mono font-semibold">{selected.code}</span> · {selected.name}</span>
                  <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-[11px] text-[var(--accent)] hover:underline">cambiar</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    <input
                      value={query} onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar activo por código o nombre…" autoFocus
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-2 text-sm"
                    />
                  </label>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {matches.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">Sin resultados.</p>}
                    {matches.map((e) => (
                      <button key={e.id} onClick={() => setSelected(e)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-left text-xs hover:border-[var(--accent)]/60">
                        <span className="min-w-0 truncate"><span className="font-mono font-semibold">{e.code}</span> · {e.name}</span>
                        <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{esEquipCategory(e.category)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected && (
                <>
                  <textarea ref={taRef} value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="¿Qué observás? (fuga, ruido, vibración, fuera de servicio…)"
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
                    className={cn("w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white active:opacity-90 disabled:opacity-50")}>
                    {busy ? "Enviando…" : "Registrar levantamiento"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
