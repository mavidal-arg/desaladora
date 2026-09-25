import { prisma } from "@/lib/prisma";

export type SubscriptionPair = { level: string; channel: string };

export type AlertRecipientRow = {
  id: string;
  name: string;
  email: string | null;
  phoneWhatsapp: string | null;
  phoneVoice: string | null;
  active: boolean;
  subscriptions: SubscriptionPair[];
  updatedAt: string;
};

function toRow(r: {
  id: string; name: string; email: string | null; phoneWhatsapp: string | null; phoneVoice: string | null;
  active: boolean; updatedAt: Date; subscriptions: { level: string; channel: string }[];
}): AlertRecipientRow {
  return {
    id: r.id, name: r.name, email: r.email, phoneWhatsapp: r.phoneWhatsapp, phoneVoice: r.phoneVoice,
    active: r.active, updatedAt: r.updatedAt.toISOString(),
    subscriptions: r.subscriptions.map((s) => ({ level: s.level, channel: s.channel })),
  };
}

/** Todos los destinatarios (incluye inactivos, para poder reactivarlos desde la UI). */
export async function listAlertRecipients(): Promise<AlertRecipientRow[]> {
  const rows = await prisma.alertRecipient.findMany({
    orderBy: { name: "asc" },
    include: { subscriptions: true },
  });
  return rows.map(toRow);
}

type UpsertInput = {
  name: string;
  email?: string | null;
  phoneWhatsapp?: string | null;
  phoneVoice?: string | null;
  active?: boolean;
  subscriptions: SubscriptionPair[];
  createdBy?: string | null;
};

export async function createAlertRecipient(input: UpsertInput): Promise<AlertRecipientRow> {
  const row = await prisma.alertRecipient.create({
    data: {
      name: input.name, email: input.email ?? null, phoneWhatsapp: input.phoneWhatsapp ?? null,
      phoneVoice: input.phoneVoice ?? null, active: input.active ?? true, createdBy: input.createdBy ?? null,
      subscriptions: { create: input.subscriptions },
    },
    include: { subscriptions: true },
  });
  return toRow(row);
}

export async function updateAlertRecipient(id: string, input: UpsertInput): Promise<AlertRecipientRow> {
  const row = await prisma.alertRecipient.update({
    where: { id },
    data: {
      name: input.name, email: input.email ?? null, phoneWhatsapp: input.phoneWhatsapp ?? null,
      phoneVoice: input.phoneVoice ?? null, active: input.active ?? true,
      // Reemplaza el set completo de subscripciones — más simple que diffear
      // altas/bajas individuales y el volumen (máx 9 filas por destinatario) no lo justifica.
      subscriptions: { deleteMany: {}, create: input.subscriptions },
    },
    include: { subscriptions: true },
  });
  return toRow(row);
}

/** Soft-delete: `active=false`, mismo criterio que la whitelist de SIA — no se pierde el historial. */
export async function deactivateAlertRecipient(id: string): Promise<void> {
  await prisma.alertRecipient.update({ where: { id }, data: { active: false } });
}
