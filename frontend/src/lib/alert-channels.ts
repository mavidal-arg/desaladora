import { prisma } from "@/lib/prisma";
import { CHANNELS, type Channel } from "@/lib/alert-notify";

export type AlertChannelRuleRow = {
  level: string;
  inapp: boolean;
  email: boolean;
  whatsapp: boolean;
  voice: boolean;
  updatedAt: string;
};

const LEVELS = ["critico", "advertencia", "info"] as const;

/** Las 3 filas de política (una por severidad), creando las que falten con todo apagado. */
export async function listAlertChannelRules(): Promise<AlertChannelRuleRow[]> {
  const existing = await prisma.alertChannelRule.findMany();
  const byLevel = new Map(existing.map((r) => [r.level, r]));
  const rows = await Promise.all(
    LEVELS.map(async (level) => {
      const row = byLevel.get(level) ?? await prisma.alertChannelRule.create({ data: { level } });
      return {
        level: row.level, inapp: row.inapp, email: row.email, whatsapp: row.whatsapp, voice: row.voice,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  );
  return rows;
}

export async function setAlertChannelRule(
  level: string,
  channel: Channel,
  enabled: boolean,
  updatedBy: string,
): Promise<AlertChannelRuleRow> {
  const row = await prisma.alertChannelRule.upsert({
    where: { level },
    update: { [channel]: enabled, updatedBy },
    create: { level, [channel]: enabled, updatedBy },
  });
  return { level: row.level, inapp: row.inapp, email: row.email, whatsapp: row.whatsapp, voice: row.voice, updatedAt: row.updatedAt.toISOString() };
}

export { CHANNELS };
