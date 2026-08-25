import { PageHeader } from "@/components/PageHeader";
import { sap, seSuite } from "@/lib/adapters";
import { InspectionClient } from "./InspectionClient";

export const dynamic = "force-dynamic";

export default async function InspectionPage() {
  // Las observaciones de terreno (las que entran por el QR) también viven acá:
  // son inspección, y hasta ahora no aparecían en ninguna lista del menú.
  const [routes, ncs, equipment] = await Promise.all([
    seSuite.listInspectionRoutes(),
    seSuite.listNonConformities(),
    sap.listEquipment(),
  ]);
  return (
    <div>
      <PageHeader title="Inspección y Cumplimiento" subtitle="Rondas · Equipos especiales · Instrumentos · Observaciones de terreno" />
      <InspectionClient routes={routes} ncs={ncs} equipment={equipment} />
    </div>
  );
}
