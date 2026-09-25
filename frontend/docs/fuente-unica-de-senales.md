# Fuente única de valores de señal + snapshot de observación de terreno

> Repo compartido por **Desaladora Coquimbo V2** (`/desaladora-coquimbo-v2-ops/`) y el
> clon **Aguas del Norte / Iquique** (`/aguas-del-norte-desaladora-iquique-ops/`).
> Este cambio está **gateado por un flag de build** y se activa **sólo en Iquique**
> por ahora. Coquimbo V2 queda con el comportamiento anterior hasta un rollout
> deliberado (ver ["Pasar a Coquimbo"](#pasar-a-coquimbo)).

## El problema

Escaneando el QR de un activo, el operador ve un "valor en vivo". Se observó que el
**mismo activo mostraba números distintos** según dónde se lo mirara:

- Gemelo Digital (`/twin`) — tiles, tabla de racks, escena 3D
- Listado de equipos → ficha Asset-360, pestaña **"Tiempo real"** (`/equipment`)
- Vista QR / terreno (`/ar/<code>`)

Además, al **levantar una observación de terreno** no quedaba registro de qué datos se
estaban viendo en ese momento.

### Causa raíz

No hay UNS ni fuente única de telemetría. `ADAPTER_MODE=sim`; el adapter `real` lanza
`notWired()`. La telemetría vivía en **tres planos que no se hablaban**:

| Plano | Qué es | Vistas que alimentaba |
|---|---|---|
| 1. Seed Prisma (`PiReading`) | valores deterministas sembrados, **congelados a 2026-06-15**, leídos por `pi.getCurrentValues` | Asset-360 "Tiempo real", tablas de `/twin`, `/oee`, `/proceso`, `/predictive` |
| 2. `Math.random()` en el browser | `useSignalSim` / `useTwinLive` / `useSceneSignals` — jitter sobre los nominales `base/amp/health` de `plant-config.ts`; **no leían el plano 1** | tiles + 3D de `/twin`, **QR `/ar`**, overlays de mímico |
| 3. Ingesta dormida | `/api/twin/ingest` + `tools/twin/*.py` + `UNS.json` + `flow.json` | nada (sin productor conectado) |

Consecuencias concretas: `useTwinLive` no tiene semilla → cambia en cada tick/reload;
`rf` salía ~3.4e13 en `useTwinLive` vs ~6e13 en el seed (**~2×**); el bloque "físico vs
proceso" del QR mostraba el `idealVsReal` del **tren líder**, no del rack escaneado;
cadencias distintas por vista (2,5 s / 10 s / fetch único).

`public/UNS.json` (site `DPCQ01`, 22 topics) es un **artefacto de integración estático** —
no lo lee ninguna línea de código de la app (ahora tiene un `_note` que lo aclara).

## La solución

Mismo patrón que `src/lib/asset-health.ts` (fuente única de *salud*): un solo módulo que
decide **"cuál es el valor actual de esta señal AHORA"**, y todas las vistas lo consumen.

### `src/lib/sim.ts` — núcleo determinista (sin dependencias)

```ts
simValueAt(signalId, nowMs, center, amp): number
```

Función **pura**: mismo `(signalId, nowMs, center, amp)` → mismo número en cualquier
proceso. **Sin `Math.random`.** Dos ondas de período distinto (≈47 s y ≈113 s) con fase
sembrada por el hash del `signalId`, sumadas y escaladas por `amp` alrededor de `center`.
El valor "respira" (se ve vivo en la demo) pero es idéntico entre vistas para el mismo
instante.

También expone `severityOf(value, min, max)` y `hashInt(s)`.

### `src/lib/live-signals.ts` — resolver

| Función | Devuelve |
|---|---|
| `getLiveSignals(code, {at?})` | `LiveSignal[]` — todas las señales del activo (instrumento + virtuales del gemelo), cada una con `value` (canónico ahora), `seedValue` (centro = último `PiReading`), `ts`, `min/max`, `kind`, `severity` |
| `getLiveValue(code, signal, {at?})` | un `number` |
| `getPlantLivePrimary({at?})` | `{ code → { value, unit, label, pct } }` de TODA la flota en una sola pasada a la DB (para el poll del mímico) |

- `center` = valor del `PiReading` más reciente → el último punto de la tendencia coincide
  con el tile.
- `amp` = el `amp` de `plant-config` para señales de instrumento; `center * fracción` para
  las virtuales del gemelo (`rf`, `rfNorm`, `sec`, `tmp`, `ndp`, `piOsmotic`, `beta`).
- Respeta el estado operativo: `stopped`/`maintenance` → `min ?? 0`; `idle` → `center * 0.5`.
- Lookup por `(equipmentId, signal)` (ya `@@unique`) → el prefijo de id de `PiSignal`
  (`sig_eq_*` de instrumento vs `eq_*` del gemelo) deja de importar.

**Enganche del adapter `real`:** cuando exista telemetría real (TimescaleDB / MQTT de
Tier0), sólo cambia la fuente del `center` dentro de este módulo. El resto de la app no se
entera.

### Endpoints de poll (siempre existen)

| Ruta | Devuelve | Lo pollea |
|---|---|---|
| `GET /api/live` | `getPlantLivePrimary()` — valor primario de la flota | mímico (`useSignalSim` en modo fuente única) |
| `GET /api/live/[code]` | `{ code, signals: LiveSignal[], updatedAt }` | Asset-360 "Tiempo real" |
| `GET /api/twin/live` | por rack RO, con el shape `TwinLive` que consume `useTwinLive` (`rf`/`tmp`/`sec` como `LiveValue` + `foulFrac`; `rf`/`rfNorm` en ×10¹³/m) | `/twin` (`useTwinLive`) |

Cadencia: **4 s** en todas las vistas.

### `src/lib/desal.ts` — `getTwinLive()` + `getTwinSummary()`

- **`getTwinLive(at?)`** (nuevo): métricas físicas vivas por rack RO (reusa
  `loadRackReadings` + `simValueAt`).
- **`getTwinSummary()`**: cuando el flag está ON, el escalar "ahora" de `metrics` pasa por
  `simValueAt`; la trayectoria de ensuciamiento (`health`, `cipDays`, `trend`) sigue
  leyendo la serie sembrada. Además cada `TwinRackRow` ahora lleva su **propio**
  `idealVsReal` (antes sólo se calculaba para el líder).

### Refactor de vistas — cada rama detrás de `if (LIVE_UNIFIED)`

El camino viejo queda **intacto** (es el de Coquimbo hasta el rollout).

| Archivo | Flag OFF (Coquimbo) | Flag ON (Iquique) |
|---|---|---|
| `src/lib/useTwinLive.ts` | `sampleTwin()` con `Math.random` | pollea `/api/twin/live` (mismo shape de retorno) |
| `src/lib/useSignalSim.ts` | `sample()` con `Math.random` | pollea `/api/live` |
| `src/lib/useSceneSignals.ts` | — | hereda del hook, sin cambios |
| `src/lib/ar.ts` `getAssetArView` | `pi.getCurrentValues` + jitter cliente | `getLiveSignals(code)`; bloque RO con el `idealVsReal` **del rack escaneado** |
| `src/app/ar/[code]/ArAssetView.tsx` | jitter de `useSignalSim` sobre la primaria + poll 10 s | sin jitter cliente; poll 4 s |
| `src/app/api/assets/[id]/route.ts` | `pi.getCurrentValues` | `getLiveSignals(code)` |
| `src/app/equipment/Asset360Modal.tsx` `RealtimeTab` | snapshot al abrir | pollea `/api/live/[code]` (4 s) |
| `src/app/twin/TwinClient.tsx`, `Model3DView.tsx` | `useTwinLive` (RNG) | heredan del hook |
| `src/components/mimic/{ScadaMimic,PlantSynoptic,ProcessView}.tsx` | `useSignalSim`+`useTwinLive` | heredan de los hooks |

> El branch vive **dentro de los 3 hooks** para minimizar puntos de cambio: los 6
> componentes de mímico/twin no se tocan.

### Otros

- Colisión de slug desambiguada en `src/lib/signal-labels.ts`: `tmp` = "TMP transmembrana"
  (del gemelo), `dpTmp` = "ΔP del tren" (instrumento). **Los slugs NO cambian** (romperían
  QR impresos y seed).
- `scripts/check-signals.ts` (`npx tsx scripts/check-signals.ts`): verifica que `simValueAt`
  es determinista y vivo, y que no hay slugs de `SIGNAL_LABELS` / `TWIN_SIGNALS` huérfanos.
- `public/UNS.json`: header `_note` que lo marca no-autoritativo.

## Snapshot + histórico de la observación de terreno

Antes `POST /api/ar/observation` guardaba sólo `{severity, description, raisedBy,
raisedByRole, raisedAt}`. Ahora:

### Schema (`prisma db push`, aditivo)

```prisma
model ObservationReading {
  id, nonConformityId, signal, label, value, unit,
  source,        // "app" = lo que mostraba la app · "field" = lo que leyó el operador
  capturedAt
}
```
+ `readings ObservationReading[]` en `NonConformity`. La tabla se crea en ambas DBs pero
queda inerte en Coquimbo hasta que su UI se active.

### Flujo

1. `ArAssetView` → panel de observación → sección plegable **"¿Qué marca el instrumento?"**
   (gateada por `LIVE_UNIFIED`): un input numérico por señal, placeholder = valor de la app.
2. `POST /api/ar/observation` acepta `readings?: {signal,value}[]`. Al crear la NC:
   - `getLiveSignals(code)` → filas `source:"app"` (**automático**).
   - lo que tipeó el operador → filas `source:"field"`.
   - Las filas `source:"field"` **NO** se escriben como `PiReading`.
3. Visualización:
   - `/inspection` → pestaña **"Observaciones de terreno"**: fila expandible con tabla
     `señal | app | terreno | Δ`.
   - `src/app/equipment/Asset360Modal.tsx` → SOP → No-conformidades: fila con el snapshot.

## El flag

`NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED` — se congela en el build (`NEXT_PUBLIC_*` se inlinea).

- `deploy/Dockerfile`: `ARG LIVE_SIGNALS_UNIFIED=0` + `ENV NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED`
  en las stages `build` **y** `runtime` (los ARG no cruzan stages).
- `deploy/compose.aguas-del-norte-desaladora-iquique.yaml`: `build.args.LIVE_SIGNALS_UNIFIED:
  "1"` + `NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED=1` en `environment`.
- `deploy/compose.yaml` (Coquimbo V2): **sin tocar** → default `0`.
- En código: `import { LIVE_UNIFIED } from "@/lib/flags"`.
- **NO** va en `frontend/.env*` (son symlinks a `~/privado/secretos/`).

## Deploy — sólo Iquique

```bash
cd /srv/tier0/apps/desaladora-coquimbo-v2/frontend
docker compose -f deploy/compose.aguas-del-norte-desaladora-iquique.yaml build
docker compose -f deploy/compose.aguas-del-norte-desaladora-iquique.yaml up -d --force-recreate
```

El `entrypoint.sh` corre `prisma db push` en cada arranque → crea `ObservationReading` en
`aguas_del_norte_desaladora_iquique`.

**Coquimbo V2 no se toca**: su contenedor sigue con la imagen anterior (no hay mounts de
código; un `restart` re-corre `db push` + seed con el schema **horneado viejo**). Sólo un
rebuild deliberado de `desaladora-coquimbo-v2-ops` lo movería.

### Verificación (browser-probe, cookie `mes-session` Supervisor)

- `/ar/A25-1`, `/twin` (rack A25-1) y Asset-360 de A25-1 "Tiempo real" **a la vez** → cada
  señal compartida coincide (± el paso del generador entre polls de 4 s); `rf`/`tmp`/`sec`
  ya no están 2× apart.
- `/ar/A25-2` (no líder) → bloque "físico vs proceso" con métricas de **A25-2**.
- Levantar observación en `/ar/A25-1` con 2 lecturas de campo → `NC-AR-…`;
  `ObservationReading` con filas `app` + `field`; visibles en `/inspection` y Asset-360.
- Un equipo `stopped` → las 3 vistas muestran ~0.
- Regresión: `/proceso`, `/overview`, `/oee`, `/predictive`, `/mimico` sin errores.

Estado al implementar (2026-09-09): `npx tsc --noEmit` limpio · `npm run lint` 23 problemas
(= baseline exacto, 0 nuevos) · `npm run build` OK con el flag en `0` y en `1` ·
`scripts/check-signals.ts` verde · `prisma validate` OK.

## Pasar a Coquimbo

Cuando Iquique valide:

1. `deploy/compose.yaml`: `build.args.LIVE_SIGNALS_UNIFIED: "1"` +
   `NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED=1` en `environment`.
2. Quitar las ramas `if (LIVE_UNIFIED)` dejando sólo el camino nuevo; **borrar**
   `src/lib/useTwinLive.ts` y el RNG de `useSignalSim` / `useSceneSignals`.
3. Rebuild + `--force-recreate` de `desaladora-coquimbo-v2-ops`.
4. Actualizar `workflows/twin_digital.md`.
