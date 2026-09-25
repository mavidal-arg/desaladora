# Exposición y seguridad — desaladora-coquimbo-v2

> Generado por `wat/tools/tier0/auditar_exposicion.py`. **No editar a mano.**
> La parte declarada (para qué está abierta, qué riesgo se aceptó) se edita
> en `exposicion.json`; el resto se mide y se reescribe en cada corrida.

## Lo declarado

- **Intención**: `demo-publica`
- **Para qué**: Muestra de capacidades de Tier0 para clientes industriales: el link se comparte en una reunión comercial y queda accesible sin darle usuario de la plataforma a nadie. Que conteste 200 sin login es la función, no un descuido.
- **Responsable**: mariano
- **Datos**: simulados (ADAPTER_MODE=sim, base propia por clon)
- **Riesgo para la plataforma**: medio
- **Última revisión declarada**: 2026-09-03

### Por qué está así

Clon de trabajo de la V1 y molde de la fábrica de apps: de este repo salen todos los clones por cliente. Mismo hueco que la V1 en `POST /api/twin/ingest`, sin token seteado. Se publica por Kong (`publicar_app.py`), no por una location de nginx.

### Qué la volvería insegura

- Cargarle datos reales de un cliente: hoy todo lo que muestra es simulado o semilla.
- Agregarle un endpoint de escritura sin guardia de servidor (`requireAuth`).
- Apuntarla a una base compartida con otra app, o a un rol con permisos fuera de su schema.
- Que un clon nuevo herede la apertura sin que nadie decida abrirlo.
- Que `TWIN_INGEST_TOKEN` siga sin setear mientras la app esté abierta.

## Lo medido — 2026-09-11T00:36:32+00:00

### Instancias alcanzables

| ruta | intención | camino | portero | HTTP |
|---|---|---|---|---|
| `/aguas-del-norte-desaladora-iquique-ops` | pendiente-de-decision | kong | ninguno | 200 |
| `/desaladora-coquimbo-v2-ops` | demo-publica | kong | ninguno | 200 |

Salvedades por instancia:

- **`aguas-del-norte-desaladora-iquique`** → `pendiente-de-decision`: Clon con la identidad a medio pisar: muestra nombres y textos que no terminan de corresponder al cliente del cartel. Abierta al público, una demo que se contradice a sí misma es peor que no tenerla. Decidir con Mariano: terminar la identidad o cerrarla.

### Container

- **Nombre**: `aguas-del-norte-desaladora-iquique-ops` (corriendo)
- **Imagen**: `aguas-del-norte-desaladora-iquique-ops:latest` · digest `sha256:d57fe28c5d21`
- **Creada**: 2026-08-28T15:07:05

### Datos

- **Base**: `aguas_del_norte_desaladora_iquique` en `postgresql`
- **Rol**: `misa_engine`
- **ADAPTER_MODE**: `sim`

### Endpoints servidos por Node-RED

- Lectura: **21**
- Escritura: **20**

  - `POST /api/ar/observation`
  - `POST /api/auth/assume`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `DELETE /api/oee/alert-rules`
  - `PATCH /api/oee/alert-rules`
  - `POST /api/oee/alert-rules`
  - `DELETE /api/oee/alerts`
  - `PATCH /api/oee/alerts`
  - `DELETE /api/oee/downtime`
  - `PATCH /api/oee/downtime`
  - `POST /api/oee/downtime`
  - `DELETE /api/oee/quality`
  - `PATCH /api/oee/quality`
  - `POST /api/oee/quality`
  - `DELETE /api/oee/shifts`
  - `POST /api/oee/shifts`
  - `PATCH /api/twin/alert-contact`
  - `POST /api/twin/evaluate-alerts`
  - `POST /api/twin/ingest`

## Hallazgos

Ninguno: lo medido coincide con lo declarado.
