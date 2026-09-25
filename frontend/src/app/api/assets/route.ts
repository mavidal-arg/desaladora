import { NextResponse } from "next/server";
import { pi, sap } from "@/lib/adapters";

// GET /api/assets → equipment list + hierarchical tree (for the Equipment explorer).
//
// El POST de alta de equipo vivía acá y se fue con Administración: la planta la
// edita la fábrica de apps, que es donde está el operador de plataforma. Tenía
// además un desajuste de planos —el botón lo mostraba `can(role,"edit_equipment")`,
// que es un rol de la DEMO, y el handler exigía admin de Tier0, así que un
// Supervisor de la demo veía el botón y cobraba un 403—.
export async function GET() {
  const [equipment, tree] = await Promise.all([
    sap.listEquipment(),
    pi.getAssetTree(),
  ]);
  return NextResponse.json({ equipment, tree });
}
