import { PageHeader } from "@/components/PageHeader";
import { sap } from "@/lib/adapters";
import { getCurrentUser } from "@/lib/auth";
import { getPlantConfig } from "@/lib/plant-config-store";
import { EquipmentExplorer } from "./EquipmentExplorer";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const [equipment, cfg, user, sp] = await Promise.all([
    sap.listEquipment(),
    getPlantConfig(),
    getCurrentUser(),
    searchParams,
  ]);
  const areas = cfg.areas.map((a) => ({ code: a.code, name: a.name }));
  const areaByCode = Object.fromEntries(cfg.equipment.map((e) => [e.code, e.areaCode]));
  return (
    <div>
      <PageHeader title="Maestro de Equipos" subtitle="Maestro de equipos y Ficha-360" />
      <EquipmentExplorer
        equipment={equipment}
        areas={areas}
        areaByCode={areaByCode}
        role={user?.role ?? "Lector"}
        initialStatus={sp.status}
        initialCategory={sp.category}
      />
    </div>
  );
}
