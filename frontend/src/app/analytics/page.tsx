import { PageHeader } from "@/components/PageHeader";
import { sap, seSuite } from "@/lib/adapters";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [equipment, workOrders, parts, ncs, routes] = await Promise.all([
    sap.listEquipment(),
    sap.listWorkOrders(),
    sap.listSpareParts(),
    seSuite.listNonConformities(),
    seSuite.listInspectionRoutes(),
  ]);

  const reports = {
    maintenanceOrders: workOrders.length,
    sparePartsValue: Math.round(parts.reduce((s, p) => s + p.quantity * p.unitCost, 0)),
    runtimeTotal: Math.round(equipment.reduce((s, e) => s + e.runtimeHours, 0)),
    inspections: routes.length,
    openNc: ncs.filter((n) => n.status !== "closed").length,
  };

  return (
    <div>
      <PageHeader title="Analítica y Optimización" subtitle="Reportes y panel de gestión · el OEE se publica en Panel principal" />
      <AnalyticsClient reports={reports} />
    </div>
  );
}
