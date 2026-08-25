// Server-safe presentational primitives shared across EAM module pages.
// No hooks / no "use client" → usable in server components. Charts/tabs live in client files.
import type { ReactNode, ElementType } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

export function StatCard({ label, value, accent, sub, icon: Icon, href }: { label: string; value: ReactNode; accent?: boolean; sub?: string; icon?: ElementType<{ className?: string }>; href?: string }) {
  const base = "eam-card group rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-all hover:border-[var(--accent)]/30";
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
        <span className="flex items-center gap-1">
          {href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--accent)]" />}
        </span>
      </div>
      <p className={`eam-nums mt-1 text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${base} eam-focus block cursor-pointer hover:-translate-y-0.5`} aria-label={`${label} — ver detalle`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

export function AlertCard({ count, title, subtitle, tone, href }: { count: number; title: string; subtitle: string; tone: "red" | "amber" | "blue" | "purple" | "gray"; href?: string }) {
  const tones: Record<string, string> = {
    red: "border-red-500/40 bg-red-500/5", amber: "border-amber-500/40 bg-amber-500/5",
    blue: "border-blue-500/40 bg-blue-500/5", purple: "border-purple-500/40 bg-purple-500/5",
    gray: "border-[var(--border)] bg-[var(--card)]",
  };
  const dots: Record<string, string> = {
    red: "bg-red-500", amber: "bg-amber-500", blue: "bg-blue-500", purple: "bg-purple-400", gray: "bg-gray-500",
  };
  const base = `eam-card group rounded-xl border px-4 py-3 transition-all ${tones[tone]}`;
  const inner = (
    <>
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[tone]}`} />
        <span className="eam-nums">{count}</span> <span className="flex-1">{title}</span>
        {href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
      </p>
      <p className="mt-0.5 pl-3.5 text-[11px] text-[var(--muted-foreground)]">{subtitle}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${base} eam-focus block cursor-pointer hover:-translate-y-0.5`} aria-label={`${title} — ver detalle`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** Dismissible active-filter pill. `onClear` resets the host's local filter state. */
export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="eam-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]/20"
      aria-label={`Quitar filtro: ${label}`}
    >
      <span className="text-[var(--muted-foreground)]">Filtro:</span>
      <span className="font-medium capitalize">{label}</span>
      <X className="h-3 w-3 opacity-70" aria-hidden="true" />
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="eam-card rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{children}</th>;
}
export function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 text-xs text-[var(--foreground)]">{children}</td>;
}
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="eam-nums w-full border-collapse">
        <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">{text}</p>;
}

export const fmtDate = (s: string) => new Date(s).toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Fecha CON hora, para lo que se levanta en terreno: en una observación importa
 * el turno y el momento, no sólo el día. Se resuelve en el navegador, así que
 * muestra la hora local de quien mira — que en planta es la hora de planta.
 *
 * Deliberadamente separado de `fmtDate`: las órdenes de trabajo y los planes se
 * miden en días y agregarles la hora sería ruido.
 */
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("es-AR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
