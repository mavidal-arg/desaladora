import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const sesion = await getSession();
  if (!sesion) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const { user, via } = sesion;
  return NextResponse.json({
    // El `via` viaja al cliente para que la barra izquierda pueda marcar que la
    // identidad es de muestra, y para que el panel del QR sepa que todavía tiene
    // que pedir la clave.
    via,
    user: {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      department: user.department,
      shift: user.shift,
    },
  });
}
