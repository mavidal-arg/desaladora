import { cn } from "@/lib/utils";

// Extraído de OeeClient.tsx (pestaña "Alertas") — ahora también lo usa /alertas.
const COLOR: Record<string, string> = {
  critico: "bg-red-500/15 text-red-600",
  advertencia: "bg-amber-500/15 text-amber-600",
  info: "bg-sky-500/15 text-sky-600",
};
const LABEL: Record<string, string> = { critico: "Crítico", advertencia: "Advertencia", info: "Info" };

export function AlertLevelBadge({ level }: { level: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", COLOR[level] ?? "bg-muted")}>
      {LABEL[level] ?? level}
    </span>
  );
}
