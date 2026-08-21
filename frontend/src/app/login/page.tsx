"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/utils";
import { users } from "@/lib/users";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Always apply dark mode on login page
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  async function handleLogin(uname: string, pwd: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      // Restore user's theme preference
      const stored = localStorage.getItem("suzano-theme");
      if (stored) {
        document.documentElement.classList.toggle("dark", stored === "dark");
      }
      router.push("/overview");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin(username, password);
  }

  const roleColors: Record<string, string> = {
    Supervisor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    Planificador: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    Mantenedor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    Lector: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D]">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,51,102,0.15)_0%,_transparent_50%)]" />

      <div className="relative w-full max-w-md space-y-8 px-6">
        {/* EAM Brand & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--accent)] text-2xl font-bold text-black">
            E
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            EAM — Equipment Asset Management
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gray-400">
            Entity-360 · PI · SAP · SE Suite
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-xs text-gray-300">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="border-gray-700 bg-gray-900/50 font-mono text-sm text-white placeholder:text-gray-500 focus:border-[var(--accent)] focus:ring-[var(--accent)]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs text-gray-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="border-gray-700 bg-gray-900/50 font-mono text-sm text-white placeholder:text-gray-500 focus:border-[var(--accent)] focus:ring-[var(--accent)]"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-[var(--accent)] font-medium text-black hover:bg-[var(--accent-strong)]"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Ingresar"}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#0D0D0D] px-3 text-[10px] uppercase tracking-widest text-gray-500">
              Quick Login
            </span>
          </div>
        </div>

        {/* Quick Login Cards */}
        <div className="space-y-3">
          {/* Supervisor — prominent full-width card */}
          {users.filter(u => u.role === "Supervisor").map((user) => (
            <button
              key={user.id}
              onClick={() => handleLogin(user.username, user.password)}
              disabled={loading}
              className="flex w-full items-center gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left transition-all hover:border-amber-400/60 hover:bg-amber-500/20 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/30 text-sm font-bold text-amber-300">
                {user.displayName.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-200">{user.displayName}</p>
                <p className="text-[10px] text-amber-400/70">Acceso total — todos los módulos</p>
              </div>
              <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                Supervisor
              </Badge>
            </button>
          ))}
          {/* Other roles grid */}
          <div className="grid grid-cols-2 gap-3">
            {users.filter(u => u.role !== "Supervisor").map((user) => (
              <button
                key={user.id}
                onClick={() => handleLogin(user.username, user.password)}
                disabled={loading}
                className="flex flex-col items-start gap-1.5 rounded-lg border border-gray-700/50 bg-gray-900/30 p-3 text-left transition-all hover:border-[var(--accent)]/50 hover:bg-gray-800/50 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#003366] text-xs font-semibold text-white">
                  {user.displayName.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-200">{user.displayName}</p>
                  <Badge
                    variant="outline"
                    className={`mt-0.5 text-[10px] ${roleColors[user.role] || "text-gray-400 border-gray-600"}`}
                  >
                    {user.role}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600">
          Aguas del Valle · Desaladora Coquimbo
        </p>
      </div>
    </div>
  );
}
