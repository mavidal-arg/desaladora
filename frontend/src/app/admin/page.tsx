import { PageHeader } from "@/components/PageHeader";
import { getPlantConfig } from "@/lib/plant-config-store";
import { getCurrentUser } from "@/lib/auth";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

const ROLES_ADMIN = ["Supervisor", "Manager"];

export default async function AdminPage() {
  const [config, user] = await Promise.all([getPlantConfig(), getCurrentUser()]);

  // La pantalla existía sin control de rol: sólo el PUT estaba protegido, así que
  // cualquiera logueado podía abrirla y editar hasta que el guardado fallaba.
  if (!user || !ROLES_ADMIN.includes(user.role)) {
    return (
      <div>
        <PageHeader title="Administración" subtitle="Configuración de la planta y de la identidad de la aplicación" />
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-medium">Esta sección es sólo para Supervisor.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user ? `Tu perfil (${user.role}) no la tiene habilitada.` : "Iniciá sesión para continuar."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Administración · Motor de replicación" subtitle="Customizá la planta (identidad, proceso y equipos) sin tocar código — para replicar a otros entornos" />
      <AdminClient initial={config} />
    </div>
  );
}
