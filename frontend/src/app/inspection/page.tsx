import { PageHeader } from "@/components/PageHeader";
import { seSuite } from "@/lib/adapters";
import { InspectionClient } from "./InspectionClient";

export const dynamic = "force-dynamic";

export default async function InspectionPage() {
  const routes = await seSuite.listInspectionRoutes();
  return (
    <div>
      <PageHeader title="Inspección y Cumplimiento" subtitle="Rondas · Equipos especiales · Instrumentos" />
      <InspectionClient routes={routes} />
    </div>
  );
}
