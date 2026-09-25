# Retirado el 2026-08-27 — el alta pasó a la consola de Tier0

Estos tres archivos implementaban la pestaña «Duplicar para un cliente»:

| Archivo | Qué hacía |
|---|---|
| `route.ts` | `POST /api/clone` — validaba y devolvía el paquete de 5 archivos |
| `clone-package.ts` | armaba `identidad.json`, `.env`, `compose.yaml`, `nginx.conf`, `PROCEDIMIENTO.md` |
| `clone.sh` | ejecutaba en el host 5 de los 8 pasos del alta |

**Por qué se fueron.** Era maquinaria de operador de Tier0 dentro de un
entregable que va al cliente: quien recibía la app se llevaba la capacidad de
crear contenedores en el servidor. Y al vivir dentro de una app, había que
copiarla y pegarla en cada app nueva.

**Dónde vive ahora.** `tools/tier0/provision_app.py` hace los 8 pasos —incluidos
los tres que quedaban a mano: elegir puerto libre, publicar la URL (ahora por
Kong, sin tocar nginx ni root) y registrar el tile en supOS. La UI es
`tier0-appfactory-ops`.

**Qué queda en la app.** Administración conserva Planta e Identidad —la
configuración propia de esta instancia— más un botón «Exportar identidad» que
produce el mismo JSON que consume el tool.

Se conservan como referencia de los pasos ya validados (sobre todo el orden de
`clone.sh`: la identidad se escribe DESPUÉS del healthcheck). Borrables una vez
que el alta por la consola tenga varias corridas encima.

---

# Retirado el 2026-08-28 — la app se publica FUERA del login de Tier0

| Archivo | Qué hacía |
|---|---|
| `proxy.ts` | middleware de Next 16: exigía la cookie `supos_community_token` en `matcher: ["/api/assets/:path*"]` |

**Por qué se fue.** Esta app y su clon `redabast-chile-spa-region-de-atacama-ops`
pasaron a estar whitelisteadas en el plugin `supos-auth-checker` de Kong para
poder mostrárselas a un cliente sin darle un usuario de la plataforma. Sin
sesión de Tier0 no hay cookie de supOS, así que el middleware devolvía
`401 {"error":"Requiere sesión de Tier0 (supOS)"}` en los tres GET de lectura
—`/api/assets`, `/api/assets/[id]`, `/api/assets/[id]/trend`— y **Equipos y la
Ficha-360 quedaban vacíos** justo en la demo.

Era el último resto del plano de plataforma dentro de la app: `requireAdmin()`
ya no lo usa ningún handler desde que Administración se fue a la fábrica, y el
propio archivo lo decía en su cabecera — *"si borrás este archivo, la app sigue
siendo segura"*: era UX (mandar al login en vez de mostrar un 403), no control
de acceso.

**Quién cuida la puerta ahora.** El login propio de la app (`/login`, cookie
`mes-session`, roster en `src/lib/users.ts`). Es un portero de cliente
—`AppShellWrapper`—, así que los `/api/*` contestan sin sesión: con
`ADAPTER_MODE=sim` son datos simulados. **Si esta app llega a mostrar datos
reales de un cliente, esto deja de alcanzar** y hay que sacarla de la whitelist
o ponerle un gate server-side de verdad.

**Dónde se prende y se apaga.** `tools/tier0/publicar_app.py`, y el detalle en
`workflows/provision_tier0_app.md` (sección «Apps públicas»).
