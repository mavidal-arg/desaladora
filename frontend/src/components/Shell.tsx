"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, type ElementType, useState, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { useBrand } from "./BrandProvider";
import { iniciales, esImagen } from "@/lib/brand";
import { apiUrl } from "@/lib/utils";
import {
  LayoutDashboard,
  Boxes,
  Wrench,
  Package,
  Activity,
  ClipboardCheck,
  Brain,
  BarChart3,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Factory,
  TrendingUp,
  Menu,
  X,
  Waypoints,
  Atom,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { FindingAlertBanner } from "@/components/FindingAlertBanner";
import { AlertBubble } from "@/components/AlertBubble";

// basePath para servir assets estáticos de /public bajo el reverse-proxy de Tier0.
// (basePath ya no se usa acá; el wordmark es texto)

export interface NavModule {
  key: string;
  label: string;
  short: string;
  href: string;
  icon?: ElementType<{ className?: string }>;
}

export interface NavSection {
  key: string;
  label: string;
  icon: ElementType<{ className?: string }>;
  modules: NavModule[];
}

// Nav mirrors the real EAM rail [basado en datos]: Dashboard · Equipment · Maintenance ·
// Spare Parts · Operations · Inspection · Predictive · Analytics. Grouped for the
// collapsible scaffold UI; the real app is flat but the routes/labels match.
// Ítem de nivel superior, sin grupo: Panel principal (se muestra en MAYÚSCULA).
export const topModules: NavModule[] = [
  { key: "overview", label: "PANEL PRINCIPAL", short: "PLT", href: "/overview", icon: Waypoints },
];

export const navSections: NavSection[] = [
  {
    key: "asset360",
    label: "Mantención",
    icon: Factory,
    modules: [
      { key: "dashboard", label: "Panel de Mantención", short: "PAN", href: "/", icon: LayoutDashboard },
      { key: "equipment", label: "Equipos", short: "EQP", href: "/equipment", icon: Boxes },
      { key: "maintenance", label: "Órdenes de trabajo", short: "OT", href: "/maintenance", icon: Wrench },
      { key: "spare-parts", label: "Repuestos", short: "REP", href: "/spare-parts", icon: Package },
      { key: "operations", label: "Funcionamiento (Horas)", short: "HRS", href: "/operations", icon: Activity },
      { key: "inspection", label: "Inspección", short: "INS", href: "/inspection", icon: ClipboardCheck },
      { key: "hallazgos", label: "Hallazgos", short: "HLZ", href: "/hallazgos", icon: AlertTriangle },
    ],
  },
  {
    key: "intelligence",
    label: "Inteligencia",
    icon: TrendingUp,
    modules: [
      { key: "twin", label: "Gemelo Digital", short: "TWN", href: "/twin", icon: Atom },
      { key: "alertas", label: "Alertas", short: "ALR", href: "/alertas", icon: Bell },
      { key: "predictive", label: "Predictivo", short: "PRD", href: "/predictive", icon: Brain },
      { key: "analytics", label: "Analítica", short: "ANL", href: "/analytics", icon: BarChart3 },
    ],
  },
];

// Flat list for backward compatibility
export const defaultModules: NavModule[] = [...topModules, ...navSections.flatMap((s) => s.modules)];

/**
 * El logo del cliente. Si subió una imagen se usa; si no, un cuadro con sus
 * iniciales sobre el color de marca. Los cuatro lugares donde antes decía
 * "Aguas del Valle" a mano ahora pasan por acá.
 */
function MarcaLogo({ size = 36 }: { size?: number }) {
  const { app, branding } = useBrand();
  if (esImagen(branding.logo)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={branding.logo}
        alt={app.client}
        style={{ height: size, width: "auto", maxWidth: size * 2.4 }}
        className="shrink-0 rounded-lg object-contain"
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg font-bold"
      style={{
        height: size, width: size, fontSize: Math.round(size * 0.4),
        background: "var(--accent)", color: "var(--accent-foreground)",
      }}
    >
      {iniciales(app.client) || app.shortName.slice(0, 2)}
    </div>
  );
}

export interface ShellUser {
  displayName: string;
  role: string;
}

function NavSectionGroup({
  section,
  pathname,
  defaultOpen,
}: {
  section: NavSection;
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const SectionIcon = section.icon;

  // Auto-expand if a child is active
  const hasActive = section.modules.some(
    (mod) =>
      pathname === mod.href ||
      (mod.href !== "/" && pathname.startsWith(mod.href))
  );

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="eam-focus group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <SectionIcon className="h-3.5 w-3.5 opacity-50" />
        <span className="flex-1 text-left">{section.label}</span>
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-40" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-40" />
        )}
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pl-1">
          {section.modules.map((mod) => {
            const isActive =
              pathname === mod.href ||
              (mod.href !== "/" && pathname.startsWith(mod.href));
            const Icon = mod.icon;
            return (
              <Link
                key={mod.key}
                href={mod.href}
                aria-current={isActive ? "page" : undefined}
                className={`eam-focus group flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--accent)] font-semibold text-black shadow-[0_2px_12px_-2px_var(--accent)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {Icon ? (
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                ) : (
                  <span className="w-3.5 text-center text-[9px] font-bold uppercase tracking-wider opacity-60">
                    {mod.short}
                  </span>
                )}
                <span>{mod.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PersonaDelPlantel {
  id: string;
  displayName: string;
  role: string;
  department: string;
}

/**
 * Quién está mirando la demo, abajo a la izquierda — y con qué otra persona
 * cambiarlo, sin clave.
 *
 * Antes esto era un "Cambiar usuario" que cerraba la sesión y mandaba a /login.
 * La app ahora abre sin login para quien recibe el link, así que ese camino
 * dejaba al visitante frente a una pantalla de claves que no tiene. El plantel
 * llega de `/api/auth/directory`, que NO devuelve las claves: la lista se puede
 * dibujar en el cliente sin filtrarlas al bundle.
 *
 * La marca "de muestra" no es decorativa: avisa que la identidad se tomó sin
 * acreditar, que es exactamente lo que hace que el QR de un activo vuelva a
 * pedir la clave antes de firmar una observación.
 */
function SelectorDePersona({
  user,
  via,
  onElegirPersona,
}: {
  user: ShellUser;
  via: "demo" | "password" | null;
  onElegirPersona?: (userId: string) => Promise<void> | void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [plantel, setPlantel] = useState<PersonaDelPlantel[] | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  // El plantel se pide recién al abrir, y una sola vez: es una lista fija de
  // siete personas, no hace falta traerla en cada carga de la app.
  useEffect(() => {
    if (!abierto || plantel) return;
    let cancelado = false;
    fetch(apiUrl("/api/auth/directory"))
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => { if (!cancelado) setPlantel(d.users ?? []); })
      .catch(() => { if (!cancelado) setPlantel([]); });
    return () => { cancelado = true; };
  }, [abierto, plantel]);

  if (!onElegirPersona) {
    return (
      <div>
        <p className="truncate text-xs font-medium text-[var(--foreground)]">{user.displayName}</p>
        <p className="text-[10px] text-[var(--muted-foreground)]">{user.role}</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)]"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-[var(--foreground)]">
            {user.displayName}
          </span>
          <span className="block text-[10px] text-[var(--muted-foreground)]">
            {user.role}
            {via === "demo" && " · de muestra"}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
          {plantel === null ? (
            <p className="px-2 py-1.5 text-[10px] text-[var(--muted-foreground)]">Cargando…</p>
          ) : (
            plantel.map((p) => (
              <button
                key={p.id}
                disabled={cambiando !== null}
                onClick={async () => {
                  setCambiando(p.id);
                  try {
                    await onElegirPersona(p.id);
                    setAbierto(false);
                  } finally {
                    setCambiando(null);
                  }
                }}
                className="block w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
              >
                <span className="block truncate text-[11px] text-[var(--foreground)]">
                  {p.displayName}
                </span>
                <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                  {p.role} · {p.department}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}


export function Shell({
  user,
  via = null,
  esAdminPlataforma = false,
  nombrePlataforma = null,
  onElegirPersona,
  children,
}: {
  modules?: NavModule[];
  user?: ShellUser | null;
  /** Cómo se obtuvo la identidad: "demo" (elegida sin clave) o "password". */
  via?: "demo" | "password" | null;
  /** Admin de Tier0 (supOS). NO es el rol de planta de la demo. */
  esAdminPlataforma?: boolean;
  /** Nombre de la cuenta de Tier0, para mostrar cuando no hay usuario de demo. */
  nombrePlataforma?: string | null;
  /** Toma la identidad de otra persona del plantel, sin clave. */
  onElegirPersona?: (userId: string) => Promise<void> | void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const brand = useBrand();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--background)]">
      {/* Mobile drawer backdrop (only below md — tablet shows the icon rail instead) */}
      {mobileOpen && (
        <div
          className="eam-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Full sidebar — slide-over drawer below md, hidden on tablet (icon rail), static on lg+ */}
      <nav
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-transform duration-200 ease-out md:hidden lg:flex lg:static lg:w-56 lg:shrink-0 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Arauco Brand */}
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <MarcaLogo size={36} />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight tracking-tight text-[var(--foreground)]">{brand.app.client}</h1>
              <p className="truncate text-[9px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                {brand.app.site}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="eam-focus rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {topModules.map((mod) => {
            const isActive = pathname === mod.href || (mod.href !== "/" && pathname.startsWith(mod.href));
            const Icon = mod.icon;
            return (
              <Link
                key={mod.key}
                href={mod.href}
                aria-current={isActive ? "page" : undefined}
                className={`eam-focus mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  isActive
                    ? "bg-[var(--accent)] text-black shadow-[0_2px_12px_-2px_var(--accent)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5 opacity-70" />}
                <span className="flex-1 text-left">{mod.label}</span>
              </Link>
            );
          })}
          {navSections.map((section, idx) => (
            <NavSectionGroup
              key={section.key}
              section={section}
              pathname={pathname}
              defaultOpen={idx === 0}
            />
          ))}

        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          {/* Campanita de alertas in-app — variante con etiqueta, para el
              sidebar expandido. El riel de íconos tiene la suya más abajo. */}
          <AlertBubble user={user} placement="sidebar" variant="row" />
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>

          {/* Sin usuario de demo pero con sesión de Tier0: el operador tiene que
              ver con qué identidad está entrando, y que es la de plataforma. */}
          {!user && esAdminPlataforma && (
            <div>
              <p className="truncate text-xs font-medium text-[var(--foreground)]">
                {nombrePlataforma ?? "Administrador"}
              </p>
              <p className="text-[10px] text-[var(--muted-foreground)]">Tier0 · administrador</p>
            </div>
          )}

          {user && (
            <SelectorDePersona
              user={user}
              via={via}
              onElegirPersona={onElegirPersona}
            />
          )}
          <p className="text-[10px] text-[var(--muted-foreground)]">{brand.app.footer}</p>
        </div>
      </nav>

      {/* Folded icon rail — visible only on tablet (md–lg) */}
      <nav className="hidden w-16 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--sidebar)] py-4 md:flex lg:hidden">
        <div className="mb-4">
          <MarcaLogo size={36} />
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {defaultModules.map((mod) => {
            const isActive =
              pathname === mod.href ||
              (mod.href !== "/" && pathname.startsWith(mod.href));
            const Icon = mod.icon;
            return (
              <Link
                key={mod.key}
                href={mod.href}
                title={mod.label}
                aria-label={mod.label}
                aria-current={isActive ? "page" : undefined}
                className={`eam-focus flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-[var(--accent)] text-black shadow-[0_2px_12px_-2px_var(--accent)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {Icon ? (
                  <Icon className="h-[18px] w-[18px]" />
                ) : (
                  <span className="text-[9px] font-bold uppercase">{mod.short}</span>
                )}
              </Link>
            );
          })}
        </div>
        {/* Campanita de alertas in-app — al lado del switch de tema, así se ve
            desde cualquier pantalla y no sólo entrando a /alertas. */}
        <div className="mt-2 flex h-10 w-10 items-center justify-center">
          <AlertBubble user={user} placement="sidebar" />
        </div>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="eam-focus mt-2 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </nav>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar (hamburger) — only below md (tablet shows the icon rail) */}
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--sidebar)] px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileOpen}
            className="eam-focus rounded-md p-1.5 text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <MarcaLogo size={28} />
            <span className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">{brand.app.client}</span>
          </div>
          <div className="ml-auto">
            <AlertBubble user={user} placement="header" />
          </div>
        </header>

        <FindingAlertBanner />
        <main className="flex-1 overflow-y-auto bg-[var(--background)]">{children}</main>
      </div>
    </div>
  );
}
