import { PageHeader } from "@/components/PageHeader";
import { sap } from "@/lib/adapters";
import { SparePartsClient } from "./SparePartsClient";

export const dynamic = "force-dynamic";

export default async function SparePartsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [parts, tools, sp] = await Promise.all([sap.listSpareParts(), sap.listTools(), searchParams]);
  return (
    <div>
      <PageHeader title="Repuestos y Herramientas" subtitle="Inventario · Herramientas · Más reemplazados" />
      <SparePartsClient parts={parts} tools={tools} initialFilter={sp.filter} />
    </div>
  );
}
