import { NextRequest, NextResponse } from "next/server";

/**
 * (Next 16 renombró `middleware` a `proxy`; misma funcionalidad.)
 *
 * Corte temprano de las rutas que exigen sesión de plataforma.
 *
 * QUÉ HACE Y QUÉ NO: acá sólo se mira si EXISTE la cookie de sesión de Tier0.
 * No se valida contra supOS. El middleware corre en el runtime edge, donde una
 * llamada de red por request sería cara y frágil; y una cookie presente no
 * prueba nada, porque el atacante la elige.
 *
 * El control REAL es `requireAdmin()` de `lib/supos-auth.ts`, que valida la
 * cookie server-side contra `uns:8080` y falla cerrado. Está en cada handler
 * que muta. Esto de acá es UX: evita renderizar y manda al login en vez de
 * mostrar un 403.
 *
 * Dicho de otra forma: si borrás este archivo, la app sigue siendo segura. Si
 * borrás `requireAdmin()`, no.
 */
const COOKIE = "supos_community_token";

export function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) {
    return NextResponse.next();
  }

  // Las APIs contestan JSON; el browser se va al login de la plataforma.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Requiere sesión de Tier0 (supOS)" },
      { status: 401 },
    );
  }
  const destino = new URL("/tier0-login", req.nextUrl.origin);
  destino.searchParams.set("redirectUri", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(destino);
}

// Los patrones NO llevan el basePath: Next lo saca antes de matchear.
//
// `/admin` y `/api/plant-config` se fueron: la configuración de la planta la
// edita la fábrica de apps, no la app. Queda `/api/assets` porque sus GET los
// usa el explorador de equipos y el gate de plataforma sigue siendo el correcto
// para cualquier escritura futura.
export const config = {
  matcher: ["/api/assets/:path*"],
};
