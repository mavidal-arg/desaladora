import { cookies } from "next/headers";
import { getUserById, type AppUser } from "./users";

const SESSION_COOKIE = "mes-session";

/**
 * Cómo se obtuvo la identidad de la sesión.
 *
 * `demo`     — elegida en el selector de la barra izquierda, SIN clave. La app
 *              abre así para que cualquiera pueda recorrer la muestra.
 * `password` — la persona puso su clave en /login o en el panel del QR.
 *
 * La distinción existe porque sin ella el pedido de clave del QR sería
 * decorativo: bastaría con tomar la identidad de un supervisor desde la barra y
 * firmar la observación con su nombre. Las sesiones sin `via` son anteriores a
 * este cambio y se leen como `password`, que es lo único que podían haber sido.
 */
export type SessionVia = "demo" | "password";

export interface Session {
  user: AppUser;
  via: SessionVia;
}

/**
 * Read the current session from the cookie (server-side).
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    const { userId, via } = JSON.parse(raw);
    const user = getUserById(userId);
    if (!user) return null;
    return { user, via: via === "demo" ? "demo" : "password" };
  } catch {
    return null;
  }
}

/**
 * Read the current user from the session cookie (server-side).
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  return (await getSession())?.user ?? null;
}

/**
 * Require that the current request is authenticated.
 * Optionally restrict to specific roles.
 * Throws an object with { status, message } on failure — catch in route handlers.
 */
export async function requireAuth(...roles: string[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw { status: 401, message: "Authentication required" };
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw { status: 403, message: `Requires role: ${roles.join(" or ")}` };
  }
  return user;
}


/**
 * Como `requireAuth`, pero además exige que la identidad se haya acreditado con
 * clave. Para lo que se firma con nombre y apellido —hoy, la observación que se
 * carga desde el QR de un activo— una identidad tomada del selector no alcanza.
 */
export async function requirePassword(...roles: string[]): Promise<AppUser> {
  const sesion = await getSession();
  if (!sesion) {
    throw { status: 401, message: "Authentication required" };
  }
  if (sesion.via !== "password") {
    throw {
      status: 401,
      message: "Esta acción queda registrada a tu nombre: ingresá tu clave para confirmarla.",
    };
  }
  if (roles.length > 0 && !roles.includes(sesion.user.role)) {
    throw { status: 403, message: `Requires role: ${roles.join(" or ")}` };
  }
  return sesion.user;
}
