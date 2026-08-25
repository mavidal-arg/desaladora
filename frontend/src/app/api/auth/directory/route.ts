import { NextResponse } from "next/server";
import { users } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/directory → las personas dadas de alta, SIN sus claves.
 *
 * La pantalla de acceso importaba `@/lib/users` desde el cliente, así que las
 * claves de las 7 personas viajaban dentro del bundle de JavaScript. Pedir la
 * clave por pantalla teniendo eso habría sido decorativo: acá sale sólo lo que
 * la pantalla necesita para dibujar la lista.
 */
export async function GET() {
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      department: u.department,
    })),
  });
}
