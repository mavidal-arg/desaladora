import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { sap, seSuite } from "@/lib/adapters";
import { getFindingSummary } from "@/lib/finding-treatment";
import { HallazgosPageClient } from "./HallazgosPageClient";

export const dynamic = "force-dynamic";

export default async function HallazgosPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; status?: string; equipo?: string }>;
}) {
  const [user, equipment, ncs, summary, sp] = await Promise.all([
    getCurrentUser(),
    sap.listEquipment(),
    seSuite.listNonConformities(),
    getFindingSummary(),
    searchParams,
  ]);
  return (
    <div>
      <PageHeader
        title="Hallazgos"
        subtitle="Sumario y tratamiento de observaciones de campo — corrosión, fugas, vibración y otros hallazgos por equipo"
      />
      <HallazgosPageClient
        role={user?.role ?? "Lector"}
        equipment={equipment}
        ncs={ncs}
        summary={summary}
        initialSeverity={sp.severity}
        initialStatus={sp.status}
        initialEquipo={sp.equipo}
      />
    </div>
  );
}
