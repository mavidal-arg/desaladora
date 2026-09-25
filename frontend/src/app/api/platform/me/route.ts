import { NextResponse } from "next/server";
import { getSupOSIdentity, esAdministrador } from "@/lib/supos-auth";

export const dynamic = "force-dynamic";

/**
 * ¿Quién sos en la PLATAFORMA (Tier0), no en la demo?
 *
 * Existe sólo para que la barra lateral sepa si tiene que mostrar el link de
 * Administración. Mostrar u ocultar no es control de acceso —ese vive en
 * `requireAdmin()`, server-side— pero mostrarle a un cliente un link que
 * siempre le va a dar 403 es peor que no mostrárselo.
 *
 * No expone roles ni ids: sólo el booleano y el nombre para mostrar.
 */
export async function GET() {
  const id = await getSupOSIdentity();
  return NextResponse.json({
    admin: esAdministrador(id),
    displayName: id?.displayName ?? null,
  });
}
