/**
 * Identidad de plataforma: resuelve el usuario contra la sesión supOS de Tier0.
 *
 * Port de `icsh-assistant/case_store/supos_auth.py`, que nació del hallazgo C-1
 * de la auditoría 2026-08-18: confiar en un header que manda el cliente (ahí era
 * `X-User`) deja que el cliente elija su propio rol. Acá el secreto es una cookie
 * que el usuario no elige, y la validación es server-side.
 *
 * Por qué la app consulta y no le alcanza con `auth_request` de nginx:
 * `auth_request_set` sólo puede leer *headers* de la subrequest, y
 * `/inter-api/supos/auth/userinfo` devuelve la identidad en el **body JSON** —
 * la respuesta sólo trae Content-Type, Set-Cookie y Traceparent. Así que el gate
 * del borde dice "hay sesión" y nada más; quién es y con qué rol lo tiene que
 * preguntar la app.
 *
 * Este es el plano de OPERACIÓN. Los usuarios de planta de `users.ts`
 * (María Sosa y compañía) son el plano de DEMO y no llegan acá: son personas
 * ficticias del escenario, no cuentas del servidor.
 *
 * Falla SIEMPRE cerrado: timeout, error de red, no-200 o payload inesperado
 * devuelven null y el llamador deniega.
 */
import { cookies } from "next/headers";

const COOKIE = "supos_community_token";

// Se apunta al contenedor directo, igual que el plugin de Kong, para no depender
// del gateway. `uns` y esta app comparten tier0_edge_network.
const USERINFO_URL =
  process.env.SUPOS_USERINFO_URL ?? "http://uns:8080/inter-api/supos/auth/userinfo";
const TIMEOUT_MS = Number(process.env.SUPOS_USERINFO_TIMEOUT_MS ?? 3000);
const TTL_OK_MS = Number(process.env.SUPOS_USERINFO_CACHE_TTL_MS ?? 60_000);
const TTL_FAIL_MS = 5_000;

export type SupOSIdentity = {
  userId: string;
  displayName: string;
  superAdmin: boolean;
  roles: string[];
};

type Entrada = { expira: number; identidad: SupOSIdentity | null };
const cache = new Map<string, Entrada>();

/** El shape cambió entre versiones de supOS: no hay `username`, hay `sub`. */
const CAMPOS_ID = ["username", "userName", "preferredUsername", "sub", "account", "email"];

function elegirId(data: Record<string, unknown>): string | null {
  const fijado = process.env.SUPOS_USER_FIELD;
  for (const campo of fijado ? [fijado] : CAMPOS_ID) {
    const v = data[campo];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function leerCache(token: string): { hit: boolean; identidad: SupOSIdentity | null } {
  const e = cache.get(token);
  if (!e) return { hit: false, identidad: null };
  if (Date.now() >= e.expira) {
    cache.delete(token);
    return { hit: false, identidad: null };
  }
  return { hit: true, identidad: e.identidad };
}

function guardarCache(token: string, identidad: SupOSIdentity | null): void {
  // Los negativos duran menos: una sesión recién nacida no debería quedar
  // rechazada un minuto entero.
  cache.set(token, {
    expira: Date.now() + (identidad ? TTL_OK_MS : TTL_FAIL_MS),
    identidad,
  });
  if (cache.size > 512) {
    const ahora = Date.now();
    for (const [k, v] of cache) if (v.expira <= ahora) cache.delete(k);
  }
}

/** Limpia el cache (tests, o rotación manual de sesiones). */
export function resetSupOSCache(): void {
  cache.clear();
}

/** Valida la cookie de sesión supOS y devuelve la identidad, o null. */
export async function getSupOSIdentity(): Promise<SupOSIdentity | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const { hit, identidad } = leerCache(token);
  if (hit) return identidad;

  let resp: Response;
  try {
    resp = await fetch(USERINFO_URL, {
      headers: { Cookie: `${COOKIE}=${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Problema de infra, no de la sesión: se deniega pero NO se cachea, para no
    // dejar afuera a todo el mundo por un hipo de red.
    console.warn("[supos-auth] userinfo inalcanzable:", (e as Error).message);
    return null;
  }

  if (!resp.ok) {
    guardarCache(token, null);
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = ((await resp.json())?.data ?? {}) as Record<string, unknown>;
  } catch {
    console.warn("[supos-auth] userinfo devolvió un payload no-JSON");
    guardarCache(token, null);
    return null;
  }

  const userId = elegirId(data);
  if (!userId) {
    console.warn(
      "[supos-auth] userinfo sin campo de usuario reconocible. Claves:",
      Object.keys(data).slice(0, 12).join(", "),
      "— fijar SUPOS_USER_FIELD.",
    );
    guardarCache(token, null);
    return null;
  }

  const roleList = Array.isArray(data.roleList) ? data.roleList : [];
  const identidadNueva: SupOSIdentity = {
    userId,
    displayName:
      (typeof data.firstName === "string" && data.firstName) ||
      (typeof data.preferredUsername === "string" && data.preferredUsername) ||
      userId,
    superAdmin: data.superAdmin === true,
    roles: roleList
      .map((r) => (r as { roleName?: unknown })?.roleName)
      .filter((n): n is string => typeof n === "string"),
  };
  guardarCache(token, identidadNueva);
  return identidadNueva;
}

/** ¿Esta identidad puede administrar la app? */
export function esAdministrador(id: SupOSIdentity | null): boolean {
  if (!id) return false;
  return id.superAdmin || id.roles.some((r) => r.toLowerCase() === "admin");
}

/**
 * Exige un administrador de plataforma. Tira { status, message } como
 * `requireAuth` de auth.ts, para que los route handlers no cambien de forma.
 */
export async function requireAdmin(): Promise<SupOSIdentity> {
  const id = await getSupOSIdentity();
  if (!id) {
    throw { status: 401, message: "Requiere sesión de Tier0 (supOS)" };
  }
  if (!esAdministrador(id)) {
    throw { status: 403, message: "Requiere rol de administrador en Tier0" };
  }
  return id;
}
