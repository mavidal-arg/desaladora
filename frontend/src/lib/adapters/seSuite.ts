// seSuite.ts — SoftExpert SE Suite adapter (controlled docs, SOPs, NCs, inspections).
// sim mode reads the cached Postgres mirror via Prisma. Mirrors SE Suite REST shapes.
import { prisma } from "@/lib/prisma";
import {
  adapterMode,
  notWired,
  type Criticality,
  type SeDocument,
  type Procedure,
  type NonConformity,
  type InspectionRoute,
  type InspectionChecklistItem,
} from "./types";

export async function listDocuments(assetId?: string): Promise<SeDocument[]> {
  if (adapterMode() === "real") return notWired("seSuite", "listDocuments");
  const rows = await prisma.seDocument.findMany({
    where: assetId ? { equipmentId: assetId } : undefined,
    orderBy: { docDate: "desc" },
  });
  return rows.map((d) => ({
    id: d.id, code: d.code, assetId: d.equipmentId, title: d.title,
    docType: d.docType as SeDocument["docType"], revision: d.revision,
    updatedAt: d.docDate.toISOString(), url: d.url,
  }));
}

export async function getProcedure(docId: string): Promise<Procedure | null> {
  if (adapterMode() === "real") return notWired("seSuite", "getProcedure");
  const d = await prisma.seDocument.findUnique({ where: { id: docId } });
  if (!d) return null;
  return {
    id: d.id, title: d.title,
    steps: (d.steps ?? []) as string[],
    safetyNotes: (d.safetyNotes ?? []) as string[],
  };
}

export async function listNonConformities(assetId?: string): Promise<NonConformity[]> {
  if (adapterMode() === "real") return notWired("seSuite", "listNonConformities");
  const rows = await prisma.nonConformity.findMany({
    where: assetId ? { equipmentId: assetId } : undefined,
    orderBy: { raisedAt: "desc" },
  });
  return rows.map((n) => ({
    id: n.id, code: n.code, assetId: n.equipmentId, severity: n.severity as Criticality,
    description: n.description, status: n.status as NonConformity["status"], raisedAt: n.raisedAt.toISOString(),
    raisedBy: n.raisedBy, raisedByRole: n.raisedByRole,
  }));
}

export async function listInspectionRoutes(): Promise<InspectionRoute[]> {
  if (adapterMode() === "real") return notWired("seSuite", "listInspectionRoutes");
  const rows = await prisma.inspectionRoute.findMany({ orderBy: { nextInspectionAt: "asc" } });
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, category: r.category as InspectionRoute["category"],
    assetIds: (r.equipmentIds ?? []) as string[], frequency: r.frequency as InspectionRoute["frequency"],
    nextInspectionAt: r.nextInspectionAt.toISOString(), inspector: r.inspector,
    tasks: (r.tasks ?? []) as InspectionRoute["tasks"],
  }));
}

export async function getInspectionChecklist(routeId: string): Promise<InspectionChecklistItem[]> {
  if (adapterMode() === "real") return notWired("seSuite", "getInspectionChecklist");
  const r = await prisma.inspectionRoute.findUnique({ where: { id: routeId } });
  if (!r) return [];
  return (r.checkpoints ?? []) as unknown as InspectionChecklistItem[];
}
