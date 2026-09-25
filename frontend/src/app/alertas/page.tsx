import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { listAlerts, listAlertRules } from "@/lib/oee";
import { listRecentNotifications } from "@/lib/alert-notify";
import { listAlertChannelRules } from "@/lib/alert-channels";
import { listAlertRecipients } from "@/lib/alert-recipients";
import { AlertasPageClient } from "./AlertasPageClient";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const [user, alerts, rules, channelRules, recipients, notifications] = await Promise.all([
    getCurrentUser(),
    listAlerts(),
    listAlertRules(),
    listAlertChannelRules(),
    listAlertRecipients(),
    listRecentNotifications(),
  ]);
  return (
    <div>
      <PageHeader
        title="Alertas en tiempo real"
        subtitle="Email, WhatsApp y llamada telefónica cuando el Gemelo Digital cruza un umbral — demo de venta sobre datos simulados"
      />
      <AlertasPageClient
        role={user?.role ?? "Lector"}
        alerts={alerts}
        rules={rules}
        channelRules={channelRules}
        recipients={recipients}
        notifications={notifications}
      />
    </div>
  );
}
