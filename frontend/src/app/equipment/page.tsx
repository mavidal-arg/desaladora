import { PageHeader } from "@/components/PageHeader";
import { sap, seSuite } from "@/lib/adapters";
import { getPlantConfig } from "@/lib/plant-config-store";
import { getCurrentUser } from "@/lib/auth";
import { EquipmentExplorer } from "./EquipmentExplorer";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const [equipment, cfg, sp, ncs, user] = await Promise.all([
    sap.listEquipment(),
    getPlantConfig(),
    searchParams,
    seSuite.listNonConformities(),
    getCurrentUser(),
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
        initialStatus={sp.status}
        initialCategory={sp.category}
        ncs={ncs}
        role={user?.role ?? "Lector"}
      />
    </div>
  );
}
