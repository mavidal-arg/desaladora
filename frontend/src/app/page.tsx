import { PageHeader } from "@/components/PageHeader";
import { pi, sap, seSuite } from "@/lib/adapters";
import { computeDashboard } from "@/lib/metrics";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [equipment, workOrders, parts, predictive, routes, ncs] = await Promise.all([
    sap.listEquipment(),
    sap.listWorkOrders(),
    sap.listSpareParts(),
    pi.listPredictive(),
    seSuite.listInspectionRoutes(),
    seSuite.listNonConformities(),
  ]);

  const model = computeDashboard({ equipment, workOrders, parts, predictive, routes, ncs });

  return (
    <div>
      <PageHeader title="Panel de Mantención" subtitle="Activos, órdenes y repuestos · el OEE se publica en Panel principal" />
      <DashboardClient model={model} />
    </div>
  );
}
