"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, type ElementType, useState, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
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
  Droplets,
  Atom,
} from "lucide-react";

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
    ],
  },
  {
    key: "intelligence",
    label: "Inteligencia",
    icon: TrendingUp,
    modules: [
      { key: "twin", label: "Gemelo Digital", short: "TWN", href: "/twin", icon: Atom },
      { key: "predictive", label: "Predictivo", short: "PRD", href: "/predictive", icon: Brain },
      { key: "analytics", label: "Analítica", short: "ANL", href: "/analytics", icon: BarChart3 },
    ],
  },
];

// Flat list for backward compatibility
export const defaultModules: NavModule[] = [...topModules, ...navSections.flatMap((s) => s.modules)];

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

export function Shell({
  user,
  onSwitchUser,
  children,
}: {
  modules?: NavModule[];
  user?: ShellUser | null;
  onSwitchUser?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-black">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight tracking-tight text-[var(--foreground)]">Aguas del Valle</h1>
              <p className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                Desaladora Coquimbo <span className="rounded bg-[var(--accent)]/20 px-1 font-semibold text-[var(--accent)]">V2</span>
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

          {user && (
            <div>
              <p className="truncate text-xs font-medium text-[var(--foreground)]">{user.displayName}</p>
              <p className="text-[10px] text-[var(--muted-foreground)]">{user.role}</p>
              {onSwitchUser && (
                <button
                  onClick={onSwitchUser}
                  className="mt-1 text-[10px] text-[var(--muted-foreground)] underline-offset-2 hover:underline hover:text-[var(--foreground)]"
                >
                  Cambiar usuario
                </button>
              )}
            </div>
          )}
          <p className="text-[10px] text-[var(--muted-foreground)]">Aguas del Valle · Desaladora Coquimbo V2</p>
        </div>
      </nav>

      {/* Folded icon rail — visible only on tablet (md–lg) */}
      <nav className="hidden w-16 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--sidebar)] py-4 md:flex lg:hidden">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-base font-bold text-black">
          A
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
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-black">
              A
            </div>
            <span className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Aguas del Valle</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[var(--background)]">{children}</main>
      </div>
    </div>
  );
}
