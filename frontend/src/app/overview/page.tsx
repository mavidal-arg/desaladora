import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import {
  getOeeSummary, listDowntime, listQuality, listShifts, listAlerts, listAlertRules,
} from "@/lib/oee";
import { getDesalSummary } from "@/lib/desal";
import { getMembranes } from "@/lib/asset-health";
import { getPlantConfig } from "@/lib/plant-config-store";
import { PanelPrincipalClient } from "./PanelPrincipalClient";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [user, config, oee, desal, membranes, downtime, quality, shifts, alerts, rules] = await Promise.all([
    getCurrentUser(),
    getPlantConfig(),
    getOeeSummary(),
    getDesalSummary(),
    getMembranes(),
    listDowntime(),
    listQuality(),
    listShifts(),
    listAlerts(),
    listAlertRules(),
  ]);
  return (
    <div>
      <PageHeader
        title="Panel principal"
        subtitle={`${config.plant.name} · OEE de trenes RO, proceso y salud de membranas — datos de demostración simulados`}
      />
      <PanelPrincipalClient
        role={user?.role ?? "Lector"}
        oee={oee}
        downtime={downtime}
        quality={quality}
        shifts={shifts}
        alerts={alerts}
        rules={rules}
        productionTrend={desal.trend}
        desal={desal}
        membranes={membranes}
      />
    </div>
  );
}
