import { PageHeader } from "@/components/PageHeader";
import { getPlantConfig } from "@/lib/plant-config-store";
import { ScadaMimic } from "@/components/mimic/scada/ScadaMimic";
import { RO_SECTION } from "@/components/mimic/scada/mimic-model";

export const dynamic = "force-dynamic";

export default async function ProcesoPage() {
  const config = await getPlantConfig();
  return (
    <div>
      <PageHeader
        title="Vista de proceso"
        subtitle={`${config.plant.location} · ${config.plant.product} — mímico SCADA (piloto: Ósmosis Inversa)`}
      />
      <ScadaMimic config={config} section={RO_SECTION} />
    </div>
  );
}
