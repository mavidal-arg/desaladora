import { prisma } from "@/lib/prisma";
import { notifyAlertEvent } from "@/lib/alert-notify";
import type { AlertRuleRow } from "@/lib/oee";

// ─────────────────────────────────────────────────────────────────────────────
// Puente observación de terreno → motor de alertas.
//
// Hasta acá la app tenía DOS subsistemas sin ningún contacto entre sí:
//
//   · hallazgos de terreno (NonConformity) — se guardaban y ahí morían. El
//     único aviso posible era el banner global del Shell, que sólo dispara con
//     severidad high/critical; en Iquique las 6 no-conformidades eran `medium`,
//     así que ese banner nunca se mostró una sola vez. Dos reportes reales de
//     planta ("ruido extraño en la bomba", "el variador no acusa corriente")
//     llevaban 14 y 7 días abiertos sin que nadie se enterara.
//
//   · alertas de proceso (AlertEvent → AlertNotification → canales) — con
//     evaluador, política por severidad, auditoría y reintentos, alimentado
//     exclusivamente por métricas de telemetría.
//
// Esto conecta el primero al segundo: una observación levantada desde el QR
// ahora nace también como AlertEvent y se despacha por los mismos canales, sin
// duplicar nada de la lógica de despacho.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severidad de hallazgo (4 valores, en inglés) → severidad de alerta (3, en
 * español). Los dos vocabularios ya existían y no se unifican acá: cambiarle
 * los valores a `NonConformity.severity` tocaría filtros, badges y queries de
 * media app.
 *
 * El colapso high/critical → `critico` no pierde información: `sourceId` apunta
 * a la NonConformity, que sigue siendo la fuente autoritativa de la severidad
 * original. La alerta es un aviso, no una copia del hallazgo.
 */
const LEVEL_BY_SEVERITY: Record<string, string> = {
  low: "info",
  medium: "advertencia",
  high: "critico",
  critical: "critico",
};

/** `ruleId` centinela de las alertas que no vienen del evaluador de umbrales. */
export const OBSERVATION_RULE_ID = "obs_terreno";

/**
 * Regla sintética, deliberadamente NO persistida. Si fuera una fila real de
 * `AlertRule` aparecería en el tab Reglas de /alertas y cualquiera con
 * `manage_alert_rules` podría editarla o borrarla, rompiendo el puente sin
 * darse cuenta. Es viable porque `AlertEvent.ruleId` es un string suelto: no
 * tiene foreign key contra `AlertRule` (verificado contra information_schema).
 */
function observationRule(level: string): AlertRuleRow {
  return {
    id: OBSERVATION_RULE_ID,
    name: "Observación de terreno",
    metric: "observacion",
    op: "eq",
    threshold: 0,
    level,
    enabled: true,
    trainCode: null,
  };
}

export type ObservationAlertInput = {
  nonConformityId: string;
  code: string;
  severity: string;
  description: string;
  equipmentCode: string;
  equipmentName: string;
};

/**
 * Crea el AlertEvent de una observación y lo despacha.
 *
 * El llamador debe envolverlo en try/catch: que falle el aviso nunca puede
 * costar la observación, que ya está guardada. Mismo criterio best-effort que
 * `dispatch_case_event` en icsh-assistant.
 */
export async function raiseObservationAlert(input: ObservationAlertInput): Promise<void> {
  const level = LEVEL_BY_SEVERITY[input.severity] ?? "advertencia";
  const message = `${input.equipmentName} (${input.equipmentCode}) — ${input.description}`;

  const event = await prisma.alertEvent.create({
    data: {
      ruleId: OBSERVATION_RULE_ID,
      trainCode: null,
      level,
      status: "activa",
      message,
      sourceType: "observation",
      sourceId: input.nonConformityId,
    },
  });

  await notifyAlertEvent(
    {
      id: event.id,
      ruleId: event.ruleId,
      trainCode: event.trainCode,
      level: event.level,
      message: event.message,
      ts: event.ts,
    },
    observationRule(level),
  );
}
