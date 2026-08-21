export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">{title}</h1>
      {subtitle && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{subtitle}</p>}
    </header>
  );
}
