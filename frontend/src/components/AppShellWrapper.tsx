"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Shell, defaultModules } from "./Shell";
import { apiUrl } from "@/lib/utils";

interface SessionUser {
  displayName: string;
  role: string;
}

export function AppShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const cookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("mes-session="));
      if (cookie) {
        const val = JSON.parse(decodeURIComponent(cookie.split("=")[1]));
        if (val?.userId) {
          fetch(apiUrl("/api/auth/me"))
            .then((r) => r.json())
            .then((d) => {
              if (d.user) setUser(d.user);
              setChecked(true);
            })
            .catch(() => setChecked(true));
          return;
        }
      }
    } catch {
      // ignore
    }
    setChecked(true);
  }, [pathname]);

  // Login page + vista AR pública por QR (/ar/<code>) — render sin Shell ni auth.
  // Ojo: usar "/ar/" con slash para NO capturar /ar-codes (admin, sí va con Shell).
  if (pathname.startsWith("/login") || pathname.startsWith("/ar/")) {
    return <>{children}</>;
  }

  // Still checking auth
  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--accent)]" />
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!user) {
    if (typeof window !== "undefined") {
      router.push("/login");
    }
    return null;
  }

  return (
    <Shell
      modules={defaultModules}
      user={user}
      onSwitchUser={() => {
        fetch(apiUrl("/api/auth/logout"), { method: "POST" }).then(() => {
          router.push("/login");
        });
      }}
    >
      {children}
    </Shell>
  );
}
