"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useFindingAlertPoll } from "@/lib/useFindingAlertPoll";

// ─────────────────────────────────────────────────────────────────────────────
// Banner global — se ve en CUALQUIER pantalla del Shell (montado ahí, no en
// una página) cuando hay hallazgos abiertos/en revisión de severidad alta o
// crítica. El link lleva al sumario ya filtrado para tratarlos.
// ─────────────────────────────────────────────────────────────────────────────

export function FindingAlertBanner() {
  const summary = useFindingAlertPoll();
  const count = summary?.openHighOrCritical ?? 0;
  if (count === 0) return null;

  return (
    <Link
      href="/hallazgos?severity=high,critical&status=open,in_review"
      className="flex items-center justify-center gap-2 border-b border-red-500/30 bg-red-500/15 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-400"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        {count === 1
          ? "1 hallazgo de gravedad alta/crítica sin tratar"
          : `${count} hallazgos de gravedad alta/crítica sin tratar`}
      </span>
      <span className="underline underline-offset-2">Ver en Hallazgos →</span>
    </Link>
  );
}
