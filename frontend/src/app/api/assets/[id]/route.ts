import { NextResponse } from "next/server";
import { pi, sap, seSuite, type SignalValue } from "@/lib/adapters";
import { LIVE_UNIFIED } from "@/lib/flags";
import { getLiveSignals } from "@/lib/live-signals";
import { getEquipmentFindingHistory } from "@/lib/finding-treatment";

// GET /api/assets/[id] → aggregated Entity-360 payload for the asset card.
// One round trip feeds all 7 tabs (Overview · Maintenance · Plans · Monitoring ·
// Real-time · Parts · SOP). Each block comes from its source adapter.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const equipment = await sap.getEquipment(id);
  if (!equipment) {
    return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
  }

  // Con la fuente única, "Tiempo real" muestra el MISMO valor canónico que el
  // gemelo y el QR (determinista); si no, el seed crudo del adapter PI.
  const currentValuesP: Promise<SignalValue[]> = LIVE_UNIFIED
    ? getLiveSignals(equipment.code).then((sigs) =>
        sigs.map((s) => ({ signal: s.signal, value: s.value, unit: s.unit, ts: s.ts, quality: "good" as const })),
      )
    : pi.getCurrentValues(id);

  const [currentValues, workOrders, plans, parts, documents, nonConformities, costs, predictive, findingHistory] =
    await Promise.all([
      currentValuesP,
      sap.listWorkOrders(id),
      sap.getMaintenancePlan(id),
      sap.listSpareParts(id),
      seSuite.listDocuments(id),
      seSuite.listNonConformities(id),
      sap.getCosts(id),
      pi.getPredictive(id),
      getEquipmentFindingHistory(id),
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
    findingHistory,
  });
}
