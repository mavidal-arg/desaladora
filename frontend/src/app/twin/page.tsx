import { PageHeader } from "@/components/PageHeader";
import { getTwinSummary } from "@/lib/desal";
import { getUfSummary } from "@/lib/uf";
import { TwinClient } from "./TwinClient";

export const dynamic = "force-dynamic";

export default async function TwinPage() {
  const [data, uf] = await Promise.all([getTwinSummary(), getUfSummary()]);
  return (
    <div>
      <PageHeader
        title="Gemelo Digital"
        subtitle="Modelo físico de las dos etapas de membranas — ósmosis inversa (ensuciamiento, energía y predicción de CIP) y ultrafiltración (permeabilidad y ciclo de CEB)"
      />
      <TwinClient data={data} uf={uf} />
    </div>
  );
}
