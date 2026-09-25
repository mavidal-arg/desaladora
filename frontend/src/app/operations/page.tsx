import { PageHeader } from "@/components/PageHeader";
import { sap, seSuite } from "@/lib/adapters";
import { getCurrentUser } from "@/lib/auth";
import { OperationsClient } from "./OperationsClient";

export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [equipment, ncs, sp, user] = await Promise.all([
    sap.listEquipment(), seSuite.listNonConformities(), searchParams, getCurrentUser(),
  ]);
  return (
    <div>
      <PageHeader title="Funcionamiento (Horas)" subtitle="Horas de marcha · Corrosión · Sellado" />
      <OperationsClient equipment={equipment} ncs={ncs} initialTab={sp.tab} role={user?.role ?? "Lector"} />
    </div>
  );
}
