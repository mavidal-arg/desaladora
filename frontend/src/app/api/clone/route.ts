import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPlantConfig } from "@/lib/plant-config-store";
import { construirPaquete, validar, type EntradaClon } from "@/lib/clone-package";

export const dynamic = "force-dynamic";

/**
 * POST /api/clone → paquete de despliegue de un cliente nuevo. Sólo Supervisor.
 *
 * Devuelve archivos, no contenedores: el despliegue lo ejecuta `deploy/clone.sh`
 * en el host. Ver `src/lib/clone-package.ts` para el porqué.
 */
export async function POST(req: Request) {
  try {
    await requireAuth("Supervisor", "Manager");
  } catch {
    return NextResponse.json({ error: "No autorizado (requiere Supervisor)" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as EntradaClon | null;
  if (!body?.app || !body?.branding) {
    return NextResponse.json({ error: "Faltan la identidad de la app o la marca." }, { status: 400 });
  }

  const actual = await getPlantConfig();
  const error = validar(body, actual.app.slug);
  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json(construirPaquete(actual, body));
}
