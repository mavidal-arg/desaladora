import { PageHeader } from "@/components/PageHeader";
import { getPlantConfig } from "@/lib/plant-config-store";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const config = await getPlantConfig();
  return (
    <div>
      <PageHeader title="Administración · Motor de replicación" subtitle="Customizá la planta (identidad, proceso y equipos) sin tocar código — para replicar a otros entornos" />
      <AdminClient initial={config} />
    </div>
  );
}
