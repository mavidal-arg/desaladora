import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getOeeSummary, getTrainProcess } from "@/lib/oee";
import { TrainDetailClient } from "./TrainDetailClient";

export const dynamic = "force-dynamic";

export default async function TrainDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const [summary, process] = await Promise.all([getOeeSummary(), getTrainProcess(code)]);
  const train = summary.trains.find((t) => t.code === code);
  if (!train) notFound();

  const label = train.code;
  return (
    <div>
      <PageHeader
        title={`Tren ${label} — Detalle OEE`}
        subtitle={`${train.name} · disponibilidad × rendimiento × calidad y parámetros de proceso — datos de demostración simulados`}
      />
      <TrainDetailClient train={train} process={process} thresholds={summary.thresholds} windowDays={summary.window.days} />
    </div>
  );
}
