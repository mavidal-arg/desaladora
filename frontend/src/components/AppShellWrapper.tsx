"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Shell, defaultModules } from "./Shell";
import { apiUrl } from "@/lib/utils";

interface SessionUser {
  displayName: string;
  role: string;
}

type Estado = "verificando" | "anonimo" | "identificado";

/**
 * Rutas que se sirven SIN sesión: el login y el visor AR público por QR.
 * Ojo: "/ar/" con slash para NO capturar /ar-codes (admin, ese sí va con Shell).
 */
function esPublica(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/ar/");
}

/** Lee el `userId` de la cookie de sesión. El valor es JSON url-encodeado. */
function hayCookieDeSesion(): boolean {
  try {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("mes-session="));
    if (!cookie) return false;
    // slice(1).join("=") y no [1]: el valor podría contener "=" y partirlo al medio.
    const val = JSON.parse(decodeURIComponent(cookie.split("=").slice(1).join("=")));
    return Boolean(val?.userId);
  } catch {
    return false;
  }
}

/**
 * Portero de sesión del layout raíz.
 *
 * EL BUG QUE ESTO ARREGLA: antes el estado era el par `user` + `checked`, y
 * `checked` nunca volvía a `false`. Al entrar desde /login, el render posterior
 * al cambio de ruta veía `checked === true` (heredado de la pantalla anterior) y
 * `user === null`, así que rebotaba al login ANTES de que /api/auth/me alcanzara
 * a contestar. Sólo se entraba refrescando, porque F5 montaba todo de cero.
 *
 * La defensa está en `estado`, que se DERIVA en el render: si la ruta cambió y
 * todavía no corrió el chequeo de esa ruta, vale "verificando" — nunca el
 * resultado viejo. Así el efecto de redirección no puede leer un "anonimo"
 * heredado de la pantalla anterior.
 */
export function AppShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  // Cómo se obtuvo la identidad: "demo" (elegida sin clave) o "password".
  const [via, setVia] = useState<"demo" | "password" | null>(null);
  // Identidad de plataforma (Tier0), independiente del usuario de la demo.
  const [esAdmin, setEsAdmin] = useState(false);
  const [nombrePlataforma, setNombrePlataforma] = useState<string | null>(null);
  const [check, setCheck] = useState<{ path: string; estado: Estado }>({
    path: pathname,
    estado: "verificando",
  });

  const publica = esPublica(pathname);
  // Un admin de Tier0 alcanza para pintar el Shell aunque no haya sesión de demo.
  // Si no, Administración —que es función del plano de PLATAFORMA— quedaría
  // atrapada detrás del login de personajes ficticios de la planta, y el
  // operador se comería un rebote a /login teniendo credencial válida.
  const estado: Estado = user || esAdmin
    ? "identificado"
    : check.path === pathname
      ? check.estado
      : "verificando";

  useEffect(() => {
    // Con la sesión ya resuelta no se re-verifica en cada navegación: desmontaría
    // el Shell y haría parpadear el spinner en cada click del menú.
    if (user || esAdmin) return;

    let cancelado = false;
    const marcar = (e: Estado) => {
      if (!cancelado) setCheck({ path: pathname, estado: e });
    };

    // La identidad de plataforma se consulta SIEMPRE y antes que nada: es la que
    // puede habilitar el Shell por sí sola. Va primero que el corte por cookie
    // de demo justamente porque un operador puede no tener ninguna.
    const plataforma = fetch(apiUrl("/api/platform/me"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const admin = Boolean(d?.admin);
        if (!cancelado && admin) {
          setEsAdmin(true);
          setNombrePlataforma(d?.displayName ?? null);
        }
        return admin;
      })
      .catch(() => false);

    if (!hayCookieDeSesion()) {
      // Sin sesión de demo, el veredicto lo da la plataforma.
      plataforma.then((admin) => { if (!admin) marcar("anonimo"); });
      return;
    }

    fetch(apiUrl("/api/auth/me"))
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (cancelado) return;
        if (d?.user) {
          setUser(d.user as SessionUser);
          setVia(d.via === "demo" ? "demo" : "password");
          setCheck({ path: pathname, estado: "identificado" });
        } else {
          marcar("anonimo");
        }
      })
      .catch(() => marcar("anonimo"));

    return () => {
      cancelado = true;
    };
  }, [pathname, user]);

  // Anónimo YA NO REBOTA AL LOGIN. Esta app es una muestra de capacidades: tiene
  // que abrir sin clave para quien recibe el link. En vez de navegar a /login,
  // toma una identidad del plantel (`/api/auth/assume` sin body → un Supervisor)
  // y sigue de largo. La sesión queda marcada `via: "demo"`, que alcanza para
  // recorrer y operar la demo pero NO para firmar una observación desde el QR de
  // un activo — eso lo corta el servidor en `requirePassword`.
  //
  // Vive en su propio efecto y no en el render por lo mismo que la redirección
  // que reemplaza: tocar la sesión mientras React renderiza es parte de lo que
  // hacía el rebote tan rápido y silencioso.
  useEffect(() => {
    if (publica || estado !== "anonimo" || esAdmin) return;
    let cancelado = false;
    fetch(apiUrl("/api/auth/assume"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelado || !d?.user) return;
        setUser(d.user as SessionUser);
        setVia("demo");
        setCheck({ path: pathname, estado: "identificado" });
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [publica, estado, esAdmin, pathname]);

  if (publica) return <>{children}</>;

  if (estado === "identificado" && (user || esAdmin)) {
    return (
      <Shell
        modules={defaultModules}
        user={user}
        via={via}
        esAdminPlataforma={esAdmin}
        nombrePlataforma={nombrePlataforma}
        onElegirPersona={async (userId) => {
          // Cambio en el lugar, sin pasar por /login ni por el logout: la
          // identidad de la demo se elige, no se acredita. `router.refresh()`
          // vuelve a pedir los server components para que lo que dependa del rol
          // —permisos, columnas, acciones habilitadas— se pinte con el nuevo.
          const r = await fetch(apiUrl("/api/auth/assume"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          if (!r.ok) return;
          const d = await r.json();
          setUser(d.user as SessionUser);
          setVia("demo");
          router.refresh();
        }}
      >
        {children}
      </Shell>
    );
  }

  // "verificando" y "anonimo" (mientras el efecto de arriba redirige).
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--accent)]" />
    </div>
  );
}
