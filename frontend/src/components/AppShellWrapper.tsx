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
  const [check, setCheck] = useState<{ path: string; estado: Estado }>({
    path: pathname,
    estado: "verificando",
  });

  const publica = esPublica(pathname);
  const estado: Estado = user
    ? "identificado"
    : check.path === pathname
      ? check.estado
      : "verificando";

  useEffect(() => {
    // Con la sesión ya resuelta no se re-verifica en cada navegación: desmontaría
    // el Shell y haría parpadear el spinner en cada click del menú.
    if (user) return;

    let cancelado = false;
    const marcar = (e: Estado) => {
      if (!cancelado) setCheck({ path: pathname, estado: e });
    };

    if (!hayCookieDeSesion()) {
      marcar("anonimo");
      return;
    }

    fetch(apiUrl("/api/auth/me"))
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (cancelado) return;
        if (d?.user) {
          setUser(d.user as SessionUser);
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

  // La redirección vive en su propio efecto y NO en el render: navegar mientras
  // React renderiza es parte de lo que hacía el rebote tan rápido y silencioso.
  useEffect(() => {
    if (!publica && estado === "anonimo") router.push("/login");
  }, [publica, estado, router]);

  if (publica) return <>{children}</>;

  if (estado === "identificado" && user) {
    return (
      <Shell
        modules={defaultModules}
        user={user}
        onSwitchUser={() => {
          // Limpiar el estado ANTES de navegar: si no, el botón "atrás" del
          // navegador vuelve a pintar el Shell de una sesión que ya no existe.
          fetch(apiUrl("/api/auth/logout"), { method: "POST" }).then(() => {
            setUser(null);
            setCheck({ path: pathname, estado: "anonimo" });
            router.push("/login");
          });
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
