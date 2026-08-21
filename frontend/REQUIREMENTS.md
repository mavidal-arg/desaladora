# EAM "Entity-360" — Celulosa (Pulp & Paper) · App Brief

> Clon constructivo del EAM de supOS. La forma (vista-360 por equipo / ubicación
> técnica) se conserva; el "leve cambio de fondo" es el origen de los datos: en vez de
> nacer dentro de supOS, la vista se alimenta de **adapters de sistemas corporativos**
> (AVEVA PI System · SAP PM/MM · SoftExpert SE Suite) en **modo simulado** (`ADAPTER_MODE=sim`),
> con contrato estable para que conectar las fuentes reales sea reemplazar el adapter,
> no la app.

- **slug / subpath:** `eam-pulp` · `/eam-pulp-ops/`
- **Site code:** `PCEL01` (Planta de Celulosa — referencia tipo Arauco)
- **Stack:** Next.js 15 standalone + Prisma 7 + Postgres dedicada `eam_pulp` (todo en `public`)
- **Entidad raíz:** Ubicación técnica (functional location SAP) → Equipo → Dispositivo/Señal

---

## 1. App Overview

Una vista **Entity-360** para una planta de celulosa: al seleccionar una ubicación
técnica o un equipo se ve, en un solo lugar, su **jerarquía**, su **estado de proceso en
tiempo real** (PI), su **historial y plan de mantenimiento** (SAP PM), sus **repuestos y
herramientas** (SAP MM), y su **documentación e inspecciones reglamentarias** (SE Suite).
Es un CMMS/EAM **equipo-céntrico**: la entidad raíz es el Equipo dentro de su ubicación
técnica.

Todos los KPI (disponibilidad, MTBF, MTTR, salud de activo, OEE de planta, backlog) se
calculan **sobre los datos integrados de los adapters**, no se hardcodean. El demo cubre
un site (`PCEL01`) con 7 áreas de proceso, ~24 equipos, y soporta 4 roles: **Mantenedor,
Planificador, Supervisor, Lector**.

**Los 8 módulos** [basado en datos] — confirmados por sondeo directo del EAM real con `browser-probe`
el 2026-06-15 (artefactos: `/.tmp/eam-probe/walk/shots/*.png`, bundle `index-CbrJeHFv.js`).
Corrige el "7 módulos" previo, que era [inferencia]: el rail real es Dashboard · Equipment ·
Maintenance · Spare Parts · **Operations** · Inspection · **Predictive** · **Analytics** — "Tools"
vive dentro de Spare Parts y "Reports" dentro de Analytics.

| Módulo (rail) | Sub-tabs reales | Contenido [basado en datos] | Fuente (adapter) |
|---|---|---|---|
| **Dashboard** | — | KPI cards (Total Equipment, Running, Pending Orders, OEE, Health Score, Spare Parts) + alert cards (Emergency, Low Stock, Calibration Due, Corrosion, Seal Issues) + OEE 14-day trend + donuts (Status Mgmt, WO Status, Parts Consumption, Equipment Types) + Health gauge | Calculado (cross-fuente) |
| **Equipment** (Archives) | list/grid; detalle-360 | Tabla Code·Name·Category·Model·Location·Status; ficha-360 con 7 tabs (ver §2) | `sap` (maestro) + `pi` (condición) |
| **Maintenance** | Work Orders · Preventive Maintenance · Maintenance Plans | OT (Code·Priority·OrderType·Description·Equipment·AssignedTo·Status); planes | `sap` (PM) |
| **Spare Parts** (& Tools) | Inventory · Tools · Top Replacement | Part Code·Name·Specification·Category·Quantity·Safety Stock; pañol; top reemplazados | `sap` (MM) |
| **Operations** (& Monitoring) | Runtime Records · Corrosion Management · Sealing Management | Utilization rate, running hours 14d, gestión de corrosión y sellos | `pi` + `sap` |
| **Inspection** (& Compliance) | Equipment Patrol · Special Equipment · Measuring Devices | Patrol routes + tasks (checkpoints, inspector, Active/In Progress/Completed); equipos especiales; calibración | `seSuite` |
| **Predictive** (Maintenance) | — | Avg/Configured/Healthy/Warning/Critical; Health Distribution; Lowest Health ranking; Predicted Maintenance ("26 days/Declining"); Parameter Anomalies (bearing temp/vibration con Δ) | `pi` (condición) |
| **Analytics** (& Optimization) | OEE Analysis · Reports · Dashboard | OEE/Availability/Performance/Quality + filtros Week/Month/Quarter/Year; reportes | Cross-fuente |

---

## 2. Pages and Key Functions

- **Page A – Árbol de activos** (`/equipos`): navegación jerárquica (ubicaciones técnicas
  + equipos) vía `pi.getAssetTree()`, buscador por código/nombre, color por criticidad y
  estado (verde/ámbar/rojo). Selección → Ficha-360.
- **Page B – Ficha-360 del activo** *(pantalla central — modal/drawer al tocar el ojo de una fila)*.
  **[basado en datos]** del detalle real de `P-101 Feed Pump`. Header: código + status badge +
  nombre + `Category • Location`, y 4 mini-stats: **Total Runtime (128h) · Work Orders (1) ·
  Pending (0) · Completion (0%)**. Tabs reales (7), en este orden:
  - *Overview*: **Basic Information** (Model, Manufacturer, Serial Number, Install Date,
    Commission Date, Warranty Expiry) + **Specifications** (power, voltage, Flow Rate, Head…) — `sap`+nameplate.
  - *Maintenance*: OT del activo (Kanban del ciclo pending→assigned→approved→in_progress→completed) — `sap`, `KanbanBoard`.
  - *Plans*: planes de mantenimiento del activo (preventivo/runtime) — `sap`, `DataTable`.
  - *Monitoring*: salud + parámetros condición/anomalías del activo (health score, tendencia) — `pi`, `SPCChart`.
  - *Real-time*: valores actuales de las señales del equipo en vivo — `pi.getCurrentValues`, `SPCChart`/Line.
  - *Parts*: repuestos asociados (consumo, stock) — `sap`, `DataTable`.
  - *SOP*: documentos/procedimientos del activo — `seSuite`, `TimelineView`.
- **Page C – Dashboard de planta** (`/`): OEE (`OEEGauge`), top KPIs (Total Equipment,
  Health, Utilization, Availability, Downtime, MTBF/MTTR, Total Runtime), Lowest Health
  Equipment, Top Replaced Parts, backlog por área, equipos críticos — 6+ elementos visuales.
- **Page D – Centro de mantenimiento** (`/mantenimiento`): todas las OT/avisos cross-activo,
  `GanttChart` del plan preventivo, filtros por estado/área/tipo, crear/asignar/cerrar OT.
- **Page E – Inspección / Cumplimiento** (`/inspeccion`): cobertura de SOPs por equipo
  crítico, rondas activas, no-conformidades abiertas.
- **Page F – Repuestos** (`/repuestos`): catálogo, stock, consumo, top reemplazados.
- **Page G – Herramientas** (`/herramientas`): pañol/tool room, ubicación de almacén.
- **Page H – Reportes** (`/reportes`): Mantenimiento / Repuestos / Runtime / Inspección /
  Measurement History — `DataTable` con export.

---

## 3. Business Flow

```mermaid
flowchart TB
    subgraph Fuentes externas (adapters, modo sim)
      PI[AVEVA PI System\nproceso / históricos / condición]
      SAP[SAP PM·MM\nequipos · OT · avisos · repuestos · costos]
      SE[SoftExpert SE Suite\nSOPs · rondas · no-conformidades]
    end
    PI -->|getAssetTree / getCurrentValues / getTrend| T[Page A: Árbol de activos]
    SAP -->|getEquipment / getFunctionalLocation| T
    T -->|seleccionar equipo| F[Page B: Ficha-360]
    PI -->|valores live + tendencias| F
    SAP -->|OT · avisos · plan · costos · repuestos| F
    SE -->|SOPs · inspecciones · no-conformidades| F
    F -->|crear / asignar / cerrar OT| D[Page D: Centro de mantenimiento]
    SAP -->|plan preventivo| D
    F -->|salud + condición + historial| C[Page C: Dashboard de planta]
    D -->|backlog · estados OT| C
    SE -->|cobertura SOPs · NC| E[Page E: Inspección]
    F -->|todos los datos integrados| H[Page H: Reportes]
```

**El "leve cambio de fondo":** donde el EAM de supOS leería su UNS interno, cada tab de la
Ficha-360 llama a `pi.*` / `sap.*` / `seSuite.*`. La vista es idéntica; el origen es corporativo.

---

## 4. Roles and Permissions

- **Mantenedor** (Technician): ver árbol y Ficha-360, iniciar/pausar/cerrar OT asignadas,
  cargar lecturas de inspección y checklists, registrar consumo de repuestos.
- **Planificador** (Planner): todo lo del Mantenedor + crear/editar OT, asignar mantenedor,
  liberar OT, editar planes preventivos, gestionar stock de repuestos.
- **Supervisor**: acceso total — aprobar/cerrar no-conformidades, editar criticidad de
  equipos, ver costos, exportar reportes, gestionar herramientas.
- **Lector** (Viewer): solo lectura de todas las páginas; botones de acción **deshabilitados
  (no ocultos)** con Tooltip explicando el rol requerido.

Matriz de acciones (`src/lib/permissions.ts`): `view_*`, `create_wo`, `assign_wo`,
`transition_wo`, `close_wo`, `edit_plan`, `record_inspection`, `close_nc`, `edit_equipment`,
`manage_spares`, `manage_tools`, `export_report`, `view_costs`.

---

## 5. UNS Design

Puntos de integración entre la app y los sistemas externos. **Southbound** (`metric`/`state`):
PI/SAP → app (condición, estado, OT). **Northbound** (`action`/`info`): app → externo
(comandos de OT, avisos). Representativo por área/equipo (en el demo se siembran ~16 topics).

```json
{
  "version": "v1",
  "site": "PCEL01",
  "topics": [
    { "id": "rb_metric_drumPressure", "path": "v1/PCEL01/RecoveryBoiler/RB01/Metrics/drumPressure", "type": "metric", "label": "Recovery Boiler Drum Pressure", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "rb_metric_steamFlow", "path": "v1/PCEL01/RecoveryBoiler/RB01/Metrics/steamFlow", "type": "metric", "label": "Recovery Boiler Steam Flow", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "rb_state_status", "path": "v1/PCEL01/RecoveryBoiler/RB01/State/status", "type": "state", "label": "Recovery Boiler Status", "payloadSchema": { "value": "string", "updatedAt": "number", "ver": "number" } },
    { "id": "fl_pump_metric_dischargePressure", "path": "v1/PCEL01/FiberLine/PU-FL-101/Metrics/dischargePressure", "type": "metric", "label": "Fiber Line Pump Discharge Pressure", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "fl_pump_metric_motorCurrent", "path": "v1/PCEL01/FiberLine/PU-FL-101/Metrics/motorCurrent", "type": "metric", "label": "Fiber Line Pump Motor Current", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "fl_pump_metric_bearingVibration", "path": "v1/PCEL01/FiberLine/PU-FL-101/Metrics/bearingVibration", "type": "metric", "label": "Fiber Line Pump Bearing Vibration", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "fl_pump_state_status", "path": "v1/PCEL01/FiberLine/PU-FL-101/State/status", "type": "state", "label": "Fiber Line Pump Status", "payloadSchema": { "value": "string", "updatedAt": "number", "ver": "number" } },
    { "id": "pm1_metric_speed", "path": "v1/PCEL01/PaperMachine/PM1/Metrics/speed", "type": "metric", "label": "Paper Machine PM1 Speed", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "pm1_metric_dryerTemp", "path": "v1/PCEL01/PaperMachine/PM1/Metrics/dryerTemp", "type": "metric", "label": "Paper Machine PM1 Dryer Temp", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "tg_metric_activePower", "path": "v1/PCEL01/PowerPlant/TG01/Metrics/activePower", "type": "metric", "label": "Turbogenerator Active Power", "payloadSchema": { "value": "number", "unit": "string", "ts": "number" } },
    { "id": "eq_state_health", "path": "v1/PCEL01/Equipment/+/State/health", "type": "state", "label": "Equipment Health Index (per asset)", "payloadSchema": { "value": "number", "assetId": "string", "updatedAt": "number" } },
    { "id": "wo_state_status", "path": "v1/PCEL01/Maintenance/WorkOrder/State/status", "type": "state", "label": "Work Order Status", "payloadSchema": { "value": "string", "workOrderId": "string", "assetId": "string", "updatedAt": "number" } },
    { "id": "wo_action_create", "path": "v1/PCEL01/Maintenance/WorkOrder/Action/create", "type": "action", "label": "Create Work Order (app → SAP)", "payloadSchema": { "cmdId": "string", "assetId": "string", "type": "string", "requestedAt": "number" } },
    { "id": "wo_action_close", "path": "v1/PCEL01/Maintenance/WorkOrder/Action/close", "type": "action", "label": "Close Work Order (app → SAP)", "payloadSchema": { "cmdId": "string", "workOrderId": "string", "requestedAt": "number" } },
    { "id": "insp_info_nonConformity", "path": "v1/PCEL01/Inspection/Compliance/Info/nonConformity", "type": "info", "label": "Non-Conformity Raised (app → SE Suite)", "payloadSchema": { "eventId": "string", "assetId": "string", "severity": "string", "ts": "number" } },
    { "id": "spare_state_stock", "path": "v1/PCEL01/SpareParts/+/State/stock", "type": "state", "label": "Spare Part Stock Level (per part)", "payloadSchema": { "value": "number", "partCode": "string", "updatedAt": "number" } }
  ]
}
```

---

## 6. Adapter Contracts (CONGELADO — S2 implementa estas firmas al pie de la letra)

Cada adapter vive en `src/lib/adapters/<name>.ts`, exporta funciones async con estas firmas
y un selector interno `ADAPTER_MODE` (`sim` lee Postgres vía Prisma; `real` queda como
`throw new Error("real mode not wired")` / `TODO`). El frontend **siempre** pasa por los
adapters (o por las API routes que los envuelven), **nunca** importa Prisma de dominio directo.

```ts
// src/lib/adapters/types.ts  — tipos de retorno compartidos (espejo de las APIs reales)
// Enums [basado en datos] del EAM real (badges observados en Equipment/Maintenance):
export type Criticality = "low" | "medium" | "high" | "critical";     // = WO priority badges
export type AssetStatus = "running" | "stopped" | "maintenance" | "idle";  // Running/Stopped/Under Maintenance/Idle

export interface AssetTreeNode {            // espejo de PI Asset Framework
  id: string; code: string; name: string;
  kind: "functionalLocation" | "equipment";
  criticality: Criticality; status: AssetStatus;
  children: AssetTreeNode[];
}
export interface SignalValue { signal: string; value: number; unit: string; ts: string; quality: "good" | "bad" | "uncertain"; }
export interface TrendPoint { ts: string; value: number; }
export interface FunctionalLocation { id: string; code: string; name: string; parentId: string | null; area: string; criticality: Criticality; }
// Equipment [basado en datos]: campos vistos en la lista (code/name/category/model/location/status)
// y en el detalle-360 Overview (manufacturer/serialNumber/install·commission·warranty + specs JSON).
export interface Equipment { id: string; code: string; name: string; functionalLocationId: string; category: string; location: string; manufacturer: string; model: string; serialNumber: string; installDate: string; commissionDate: string; warrantyExpiry: string; specs: Record<string, string>; criticality: Criticality; status: AssetStatus; healthIndex: number; runtimeHours: number; }
// WorkOrder [basado en datos]: orderType{Preventive,Corrective,Emergency,Predictive}, status{pending,assigned,approved,in_progress,completed}, priority=Criticality, assignee (e.g. "Zhang Wei").
export interface WorkOrder { id: string; code: string; assetId: string; orderType: "preventive" | "corrective" | "emergency" | "predictive"; status: "pending" | "assigned" | "approved" | "in_progress" | "completed"; priority: Criticality; assignee: string | null; description: string; openedAt: string; dueAt: string | null; closedAt: string | null; costEstimate: number | null; costActual: number | null; }
export interface Notification { id: string; code: string; assetId: string; kind: "M1_malfunction" | "M2_activity" | "M3_request"; description: string; createdAt: string; status: "open" | "in_process" | "completed"; }
export interface MaintenancePlan { id: string; assetId: string; strategy: "daily" | "monthly" | "runtime" | "predictive"; intervalLabel: string; nextDueAt: string; taskList: string[]; }
export interface CostBreakdown { assetId: string; labor: number; materials: number; external: number; total: number; currency: string; periodLabel: string; }
export interface SparePart { id: string; code: string; name: string; assetId: string | null; stock: number; minStock: number; unit: string; consumedLast30d: number; replacedCount: number; }
export interface Tool { id: string; code: string; name: string; toolRoom: string; storageLocation: string; available: boolean; }
export interface SeDocument { id: string; code: string; assetId: string | null; title: string; docType: "SOP" | "P&ID" | "safety" | "manual"; revision: string; updatedAt: string; url: string; }
export interface Procedure { id: string; title: string; steps: string[]; safetyNotes: string[]; }
export interface NonConformity { id: string; code: string; assetId: string; severity: Criticality; description: string; status: "open" | "in_review" | "closed"; raisedAt: string; }
export interface InspectionRoute { id: string; code: string; name: string; assetIds: string[]; frequency: "daily" | "weekly" | "monthly"; nextInspectionAt: string; inspector: string; }
export interface InspectionChecklistItem { id: string; routeId: string; item: string; body: string; expected: string; leakStatus: "none" | "minor" | "major" | null; }

// pi.ts        (AVEVA PI Web API + Asset Framework)
getAssetTree(): Promise<AssetTreeNode[]>
getCurrentValues(assetId: string): Promise<SignalValue[]>
getTrend(assetId: string, signal: string, from: string, to: string): Promise<TrendPoint[]>

// sap.ts       (SAP PM / MM via OData)
getFunctionalLocation(id: string): Promise<FunctionalLocation>
getEquipment(id: string): Promise<Equipment>
listEquipment(): Promise<Equipment[]>
listWorkOrders(assetId?: string): Promise<WorkOrder[]>
listNotifications(assetId?: string): Promise<Notification[]>
getMaintenancePlan(assetId: string): Promise<MaintenancePlan[]>
getCosts(assetId: string): Promise<CostBreakdown>
listSpareParts(assetId?: string): Promise<SparePart[]>
listTools(): Promise<Tool[]>

// seSuite.ts   (SoftExpert SE Suite REST)
listDocuments(assetId?: string): Promise<SeDocument[]>
getProcedure(docId: string): Promise<Procedure>
listNonConformities(assetId?: string): Promise<NonConformity[]>
listInspectionRoutes(): Promise<InspectionRoute[]>
getInspectionChecklist(routeId: string): Promise<InspectionChecklistItem[]>
```

---

## 7. Data Model (Prisma — espejo del seed, todo en schema `public`)

~12 modelos, cada uno con `createdAt`/`updatedAt`. El seed (S2) los puebla con la jerarquía
de §8 + ~2 semanas de `PiReading` por señal (deterministas) + OT en distintos estados +
SOPs + NC + repuestos/herramientas. IDs deterministas para upsert idempotente.

`Site`, `FunctionalLocation` (self-FK → árbol), `Equipment`, `PiSignal`, `PiReading`,
`WorkOrder`, `Notification`, `MaintenancePlan`, `SparePart`, `Tool`, `SeDocument`,
`NonConformity`, `InspectionRoute`, `InspectionChecklistItem`. (Algunos checklists/items
pueden colapsarse en JSON si se supera el límite de 10-14 tablas.)

---

## 8. Jerarquía de planta y equipos (seed determinista)

**Site `PCEL01` → 7 ubicaciones técnicas (áreas):**

| Área (FL) | Código | Criticidad | Equipos representativos |
|---|---|---|---|
| Línea de Fibra | `FL` | high | `PU-FL-101` bomba pasta, `MO-FL-101` motor refinador, `AG-FL-201` agitador torre, `HX-FL-301` intercambiador |
| Caldera de Recuperación | `RB` | critical | `RB01` caldera, `FAN-RB-101` ventilador TIA, `PU-RB-201` bomba licor, `MO-RB-101` motor soplador |
| Evaporadores | `EVAP` | high | `EV-101` efecto I, `PU-EV-101` bomba condensado, `HX-EV-201` precalentador |
| Caustificación / Horno de Cal | `CAUS` | medium | `KILN-01` horno de cal, `PU-CA-101` bomba lechada, `VLV-CA-101` válvula control |
| Planta de Energía / Turbogen | `TG` | critical | `TG01` turbogenerador, `PU-TG-101` bomba agua alim., `HX-TG-201` condensador |
| Máquina de Papel PM1 | `PM1` | high | `PM1` máquina, `MO-PM-101` motor sección prensa, `FAN-PM-201` ventilador campana secado |
| Servicios / Aire-Agua | `UTIL` | low | `COMP-01` compresor, `PU-UT-101` bomba agua, `VLV-UT-101` válvula |

**Catálogo de señales PI por tipo de equipo** (poblado en `PiSignal` + `PiReading`):

| Tipo equipo | Señales (signal · unidad) |
|---|---|
| Bomba (PU) | `suctionPressure` bar · `dischargePressure` bar · `flow` m³/h · `motorCurrent` A · `bearingVibration` mm/s · `bearingTemp` °C · `sealTemp` °C |
| Motor (MO) | `motorCurrent` A · `windingTemp` °C · `vibration` mm/s · `speed` rpm |
| Válvula (VLV) | `position` % · `actuatorPressure` bar |
| Intercambiador (HX) | `inletTemp` °C · `outletTemp` °C · `deltaT` °C · `flow` m³/h |
| Ventilador (FAN) | `speed` rpm · `vibration` mm/s · `motorCurrent` A · `airflow` Nm³/h |
| Caldera (RB) | `drumPressure` bar · `steamFlow` t/h · `firingTemp` °C · `o2` % |
| Turbogen (TG) | `activePower` MW · `bearingVibration` mm/s · `bearingTemp` °C · `speed` rpm |
| Horno cal (KILN) | `temperature` °C · `o2` % · `feedRate` t/h |
| Máquina papel (PM) | `speed` m/min · `dryerTemp` °C · `basisWeight` g/m² · `moisture` % |

**Mezcla de OT (seed):** ~12-16 OT cubriendo los 4 tipos (corrective/preventive/runtime/
predictive) y los 5 estados (created/assigned/in_progress/paused/closed), con costos y
fechas en las últimas 2 semanas. Avisos (M1/M2/M3), planes preventivos (daily/monthly/
runtime/predictive), ~10 repuestos con stock/consumo, ~6 herramientas, ~8 SOPs/P&IDs,
~4 no-conformidades, ~3 rondas de inspección con checklist.

---

## 9. Notas de construcción (de AGENTS.md / onboard_tier0_app.md)

- No tocar `prisma.ts`, `auth.ts`, `globals.css`, `generated/prisma/`. Sólo agregar a `globals.css`.
- DB: sólo `prisma db push` (nunca `migrate`). Seed idempotente (`upsert`, IDs deterministas)
  porque el `entrypoint.sh` re-seedea en cada restart.
- Clientes: `apiUrl("/api/...")`. Nunca `"use client"` + `export const dynamic` en el mismo archivo.
- Recharts siempre en `<ResponsiveContainer>` con altura explícita (tabs ocultas → usar `hidden` CSS, no `display:none`).
- `npm run build` una sola vez al final (S5). Prisma corre 2 veces (push+generate en S2, seed en S2).
- Deploy: DB `eam_pulp`, puerto `127.0.0.1:18096`, nginx `location /eam-pulp-ops/` antes del
  catch-all, tile supOS `parent_id=4 sort=MAX+1` (resync sequence si `duplicate key`).
