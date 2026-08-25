"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { useBrand } from "@/components/BrandProvider";
import { iniciales, esImagen } from "@/lib/brand";

/**
 * Acceso en un solo gesto: se elige a la persona y recién entonces se pide la
 * clave.
 *
 * Antes había DOS caminos en paralelo para lo mismo — un formulario libre arriba
 * y tarjetas que entraban de un click abajo — y era el formulario libre el que
 * le daba de comer al autocompletado del navegador (rellenaba `tier0`, que es
 * una credencial de Tier0 y no de esta app, y fallaba con un rojo que nadie
 * mira). La lista ES el login, no un atajo.
 *
 * Las personas llegan de `/api/auth/directory`, que no devuelve claves: la lista
 * ya no se arma importando `@/lib/users` en el cliente.
 */

type Persona = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  department: string;
};

const COLOR_ROL: Record<string, string> = {
  Supervisor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Planificador: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Mantenedor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Lector: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function Pill({ rol }: { rol: string }) {
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
        COLOR_ROL[rol] ?? "border-gray-600 text-gray-400"
      }`}
    >
      {rol}
    </span>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { app, branding } = useBrand();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [elegida, setElegida] = useState<Persona | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const claveRef = useRef<HTMLInputElement>(null);

  // La pantalla de acceso siempre va en oscuro, sea cual sea el tema guardado.
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/auth/directory"))
      .then((r) => r.json())
      .then((d) => setPersonas(d.users ?? []))
      .catch(() => setPersonas([]));
  }, []);

  // Sin hover en el teléfono y sin campo visible hasta acá: el foco tiene que
  // ir solo al campo, o el gesto queda a medias.
  useEffect(() => {
    if (elegida) claveRef.current?.focus();
  }, [elegida]);

  function elegir(p: Persona) {
    setElegida(p);
    setPassword("");
    setError("");
  }

  function volver() {
    setElegida(null);
    setPassword("");
    setError("");
  }

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    if (!elegida || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: elegida.username, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "La clave no es correcta." : "No se pudo ingresar.");
        setPassword("");
        claveRef.current?.focus();
        return;
      }
      // Restaura la preferencia de tema de la persona antes de entrar.
      const guardado = localStorage.getItem("suzano-theme");
      if (guardado) {
        document.documentElement.classList.toggle("dark", guardado === "dark");
      }
      router.push("/overview");
    } catch {
      setError("No se pudo conectar. Probá de nuevo.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  const supervisores = (personas ?? []).filter((u) => u.role === "Supervisor");
  const resto = (personas ?? []).filter((u) => u.role !== "Supervisor");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,51,102,0.15)_0%,_transparent_50%)]" />

      <div className="relative w-full max-w-md space-y-7 px-6 py-10">
        {/* Marca — sale de la identidad configurada, no está escrita a mano */}
        <div className="flex flex-col items-center text-center">
          {esImagen(branding.logo) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo}
              alt={app.client}
              className="mb-4 h-16 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {iniciales(app.client) || app.shortName.slice(0, 2)}
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-white">{app.name}</h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gray-400">
            {app.tagline}
          </p>
        </div>

        {personas === null && (
          <p className="text-center text-xs text-gray-500">Cargando personas…</p>
        )}

        {/* ── Paso 1: elegir a la persona ── */}
        {personas !== null && !elegida && (
          <div className="space-y-3">
            <p className="text-center text-xs text-gray-400">
              Elegí tu usuario para ingresar
            </p>

            {supervisores.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => elegir(u)}
                className="flex w-full items-center gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left transition-all hover:border-amber-400/60 hover:bg-amber-500/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/30 text-sm font-bold text-amber-300">
                  {iniciales(u.displayName)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-200">{u.displayName}</p>
                  <p className="text-[10px] text-amber-400/70">
                    Acceso total — todos los módulos
                  </p>
                </div>
                <Pill rol={u.role} />
              </button>
            ))}

            <div className="grid grid-cols-2 gap-3">
              {resto.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => elegir(u)}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-gray-700/50 bg-gray-900/30 p-3 text-left transition-all hover:border-[var(--accent)]/60 hover:bg-gray-800/50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#003366] text-xs font-semibold text-white">
                    {iniciales(u.displayName)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-200">{u.displayName}</p>
                    <div className="mt-0.5">
                      <Pill rol={u.role} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Paso 2: la clave de esa persona ── */}
        {elegida && (
          <form onSubmit={ingresar} className="space-y-4">
            <button
              type="button"
              onClick={volver}
              className="inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-3.5" /> Cambiar de usuario
            </button>

            <div className="flex items-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/40 p-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                {iniciales(elegida.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {elegida.displayName}
                </p>
                <p className="truncate text-[11px] text-gray-400">{elegida.department}</p>
              </div>
              <Pill rol={elegida.role} />
            </div>

            {/* El gestor de claves necesita ver el usuario para asociar la clave
                guardada; si no, vuelve a ofrecer credenciales de otro sitio. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={elegida.username}
              readOnly
              tabIndex={-1}
              aria-hidden
              className="sr-only"
            />

            <div className="space-y-2">
              <label htmlFor="clave" className="block text-xs text-gray-300">
                Clave
              </label>
              <input
                id="clave"
                ref={claveRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresá tu clave"
                className="w-full rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-gray-500 focus:border-[var(--accent)]"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        )}

        <p className="text-center text-[10px] text-gray-600">{app.footer}</p>
      </div>
    </div>
  );
}
