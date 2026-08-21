import { PageHeader } from "@/components/PageHeader";
import { getTwinSummary } from "@/lib/desal";
import { TwinClient } from "./TwinClient";

export const dynamic = "force-dynamic";

export default async function TwinPage() {
  const data = await getTwinSummary();
  return (
    <div>
      <PageHeader
        title="Gemelo Digital"
        subtitle="Modelo físico de ósmosis inversa — ensuciamiento, energía y predicción de CIP"
      />
      <TwinClient data={data} />
    </div>
  );
}
