import { NextRequest, NextResponse } from "next/server";
import { users, getUserById, type AppUser } from "@/lib/users";

/**
 * POST /api/auth/assume → tomar una identidad del plantel SIN clave.
 *
 * Esta app es una muestra de capacidades: abre sin login y sin clave, y la
 * persona se elige del selector de la barra izquierda. Sin body toma un
 * Supervisor —el rol que puede recorrer todo— para que el visitante entre
 * directo y pueda tocar la demo desde el primer click.
 *
 * La sesión queda marcada `via: "demo"`. Eso NO habilita firmar una observación
 * desde el QR de un activo: para eso hace falta clave (`requirePassword` en
 * lib/auth). Es lo que impide que tomar a un supervisor del selector deje una
 * traza indistinguible de la que deja esa persona de verdad.
 *
 * No se elige por índice ni por id fijo: los clones de esta app cambian el
 * plantel, y `usr_supervisor_01` puede no existir.
 */
function porDefecto(): AppUser {
  return users.find((u) => u.role === "Supervisor") ?? users[0];
}

export async function POST(req: NextRequest) {
  // El body es opcional: sin cuerpo, o con cuerpo ilegible, se toma el default.
  let userId: unknown = null;
  try {
    ({ userId } = await req.json());
  } catch {
    userId = null;
  }

  const user = typeof userId === "string" ? getUserById(userId) : porDefecto();
  if (!user) {
    return NextResponse.json({ error: "Esa persona no está en el plantel" }, { status: 404 });
  }

  const res = NextResponse.json({
    ok: true,
    via: "demo",
    user: {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      department: user.department,
      shift: user.shift,
    },
  });

  res.cookies.set("mes-session", JSON.stringify({ userId: user.id, role: user.role, via: "demo" }), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  return res;
}
