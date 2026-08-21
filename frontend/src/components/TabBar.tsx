"use client";

export function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`eam-focus -mb-px whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            active === t
              ? "border-[var(--accent)] text-[var(--foreground)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
