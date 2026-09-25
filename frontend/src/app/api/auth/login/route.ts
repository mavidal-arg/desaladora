import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = findUser(username, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // `via: "password"` — la persona puso su clave. Es lo que habilita firmar
    // una observación desde el QR de un activo (ver requirePassword en lib/auth).
    const session = JSON.stringify({ userId: user.id, role: user.role, via: "password" });
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      },
    });

    res.cookies.set("mes-session", session, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
