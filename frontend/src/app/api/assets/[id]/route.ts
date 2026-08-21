import { NextResponse } from "next/server";
import { pi, sap, seSuite } from "@/lib/adapters";

// GET /api/assets/[id] → aggregated Entity-360 payload for the asset card.
// One round trip feeds all 7 tabs (Overview · Maintenance · Plans · Monitoring ·
// Real-time · Parts · SOP). Each block comes from its source adapter.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const equipment = await sap.getEquipment(id);
  if (!equipment) {
    return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
  }

  const [currentValues, workOrders, plans, parts, documents, nonConformities, costs, predictive] =
    await Promise.all([
      pi.getCurrentValues(id),
      sap.listWorkOrders(id),
      sap.getMaintenancePlan(id),
      sap.listSpareParts(id),
      seSuite.listDocuments(id),
      seSuite.listNonConformities(id),
      sap.getCosts(id),
      pi.getPredictive(id),
    ]);

  return NextResponse.json({
    equipment,
    currentValues,
    workOrders,
    plans,
    parts,
    documents,
    nonConformities,
    costs,
    predictive,
  });
}
