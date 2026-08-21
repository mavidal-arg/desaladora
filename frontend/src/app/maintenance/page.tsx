import { PageHeader } from "@/components/PageHeader";
import { sap } from "@/lib/adapters";
import { MaintenanceClient } from "./MaintenanceClient";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const [workOrders, plans, sp] = await Promise.all([sap.listWorkOrders(), sap.listAllPlans(), searchParams]);
  return (
    <div>
      <PageHeader title="Órdenes de trabajo" subtitle="Órdenes correctivas y preventivas · planes de mantenimiento" />
      <MaintenanceClient workOrders={workOrders} plans={plans} initialStatus={sp.status} initialType={sp.type} />
    </div>
  );
}
