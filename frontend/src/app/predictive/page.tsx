import { PageHeader } from "@/components/PageHeader";
import { pi } from "@/lib/adapters";
import { PredictiveClient } from "./PredictiveClient";

export const dynamic = "force-dynamic";

export default async function PredictivePage() {
  const predictive = await pi.listPredictive();
  return (
    <div>
      <PageHeader title="Mantenimiento Predictivo" subtitle="Distribución de salud · Menor salud · Anomalías de parámetros" />
      <PredictiveClient predictive={predictive} />
    </div>
  );
}
