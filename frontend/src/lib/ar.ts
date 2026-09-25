import { pi, sap } from "@/lib/adapters";
import { eqId, type SignalDef } from "@/lib/plant-config";
import { getPlantConfig } from "@/lib/plant-config-store";
import { signalLabel, signalDesc } from "@/lib/signal-labels";
import { RO_TRAINS } from "@/lib/oee-types";
import { getTwinSummary } from "@/lib/desal";
import { getAssetHealth } from "@/lib/asset-health";
import { getLiveSignals } from "@/lib/live-signals";
import { LIVE_UNIFIED } from "@/lib/flags";
import { getOeeSummary } from "@/lib/oee";
import type { TwinRackRow, TwinIdealVsReal } from "@/lib/twin-types";
import type { TrainOee } from "@/lib/oee-types";

// ─────────────────────────────────────────────────────────────────────────────
// AR por QR — agregación server-side de la "vista de activo" que se abre al
// escanear el QR del equipo. Compone lo existente y expone un shape REDUCIDO y
// SEGURO (sin costos, documentos, repuestos ni asignados) porque la ruta /ar es
// pública de solo-lectura.
//   valor actual (pi.getCurrentValues) + banda normal (min/max de plant-config)
//   + severidad, y para racks RO el contraste ideal-vs-real + salud + OEE.
// ─────────────────────────────────────────────────────────────────────────────

export type ArSeverity = "ok" | "warn" | "out";

export type ArSignal = {
  signal: string;
  label: string;
  desc?: string;
  unit: string;
  value: number;
  ts: string;
  quality: string;
  min?: number;
  max?: number;
  primary: boolean;
  severity: ArSeverity;
};

export type ArView = {
  equipment: {
    code: string; name: string; area: string; areaName: string;
    category: string; criticality: string; status: string; health: number;
    help?: string;
  };
  signals: ArSignal[];
  ro?: { rack: TwinRackRow; idealVsReal: TwinIdealVsReal[]; oee?: TrainOee };
  updatedAt: string;
};

/** Severidad de una lectura contra su banda [min,max] de plant-config. */
function severityOf(value: number, def?: SignalDef): ArSeverity {
  if (!def || def.min == null || def.max == null) return "ok";
  const { min, max } = def;
  if (value < min || value > max) return "out";
  const margin = (max - min) * 0.05;
  if (value <= min + margin || value >= max - margin) return "warn";
  return "ok";
}

/**
 * Vista de activo para AR dado su `code` físico (el que codifica el QR).
 * Devuelve `null` si el activo no existe (⇒ 404 amable en la página).
 */
export async function getAssetArView(code: string): Promise<ArView | null> {
  const id = eqId(code);
  const eq = await sap.getEquipment(id);
  if (!eq) return null;

  // De la config vigente, no de la constante compilada: si el cliente renombró
  // un área o cambió la instrumentación de un equipo, el QR tiene que mostrar
  // eso y no lo que traía el template.
  const planta = await getPlantConfig();
  const cfg = planta.equipment.find((e) => e.code === code);
  const defBySignal = new Map<string, SignalDef>((cfg?.signals ?? []).map((s) => [s.signal, s]));
  const area = cfg?.areaCode ?? "—";
  const areaName = planta.areas.find((a) => a.code === area)?.name ?? area;

  // La salud sale de la fuente única, no de la columna del catálogo: el QR de un
  // rack RO tiene que mostrar lo mismo que el Panel principal.
  //
  // Con la fuente única activa el valor sale de `getLiveSignals` (determinista,
  // el MISMO que ve el gemelo y la ficha); si no, del adapter PI (seed sinusoidal
  // + jitter cliente en `ArAssetView`).
  const [current, live, health] = await Promise.all([
    LIVE_UNIFIED ? Promise.resolve([]) : pi.getCurrentValues(id),
    LIVE_UNIFIED ? getLiveSignals(code) : Promise.resolve([]),
    getAssetHealth(),
  ]);

  // Mostrar solo las señales instrumentadas reales (las definidas en plant-config).
  // En racks RO esto excluye las señales virtuales del twin (rf/rfNorm/ndp/…),
  // que ya se resumen en el bloque "físico vs proceso".
  const signals: ArSignal[] = LIVE_UNIFIED
    ? live
        .filter((s) => (defBySignal.size ? defBySignal.has(s.signal) : s.kind === "instrument"))
        .map((s) => ({
          signal: s.signal,
          label: s.label,
          desc: s.desc,
          unit: s.unit,
          value: s.value,
          ts: s.ts,
          quality: "good",
          min: s.min,
          max: s.max,
          primary: s.signal === cfg?.primarySignal,
          severity: s.severity,
        }))
    : (defBySignal.size ? current.filter((v) => defBySignal.has(v.signal)) : current).map((v) => {
        const def = defBySignal.get(v.signal);
        return {
          signal: v.signal,
          label: signalLabel(v.signal) !== v.signal ? signalLabel(v.signal) : def?.label ?? v.signal,
          desc: signalDesc(v.signal),
          unit: v.unit || def?.unit || "",
          value: v.value,
          ts: new Date(v.ts).toISOString(),
          quality: v.quality ?? "good",
          min: def?.min,
          max: def?.max,
          primary: v.signal === cfg?.primarySignal,
          severity: severityOf(v.value, def),
        };
      });
  // Señal primaria primero, luego las que están fuera de banda, luego el resto.
  const sevRank = { out: 0, warn: 1, ok: 2 } as const;
  signals.sort((a, b) =>
    Number(b.primary) - Number(a.primary) || sevRank[a.severity] - sevRank[b.severity]);

  const view: ArView = {
    equipment: {
      code: eq.code, name: eq.name, area, areaName,
      category: eq.category, criticality: eq.criticality,
      status: eq.status, health: health.get(eq.code) ?? Math.round(eq.healthIndex),
      help: cfg?.help,
    },
    signals,
    updatedAt: new Date().toISOString(),
  };

  // Contraste físico-vs-proceso extendido para los trenes RO (racks A25-x).
  if ((RO_TRAINS as readonly string[]).includes(code)) {
    const [twin, oee] = await Promise.all([getTwinSummary(), getOeeSummary()]);
    const rack = twin.racks.find((r) => r.code === code);
    if (rack) {
      view.ro = {
        // El contraste es del rack ESCANEADO, no del tren líder: antes el QR de
        // A25-2 mostraba el ideal-vs-real de A25-1 porque `idealVsReal` sólo se
        // calculaba para el líder.
        rack,
        idealVsReal: rack.idealVsReal ?? twin.idealVsReal,
        oee: oee.trains.find((t) => t.code === code),
      };
    }
  }

  return view;
}
