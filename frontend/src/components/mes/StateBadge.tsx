"use client";

import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/status-colors";

/**
 * StateBadge — indicador de estado con el código de colores unificado.
 * Los colores y la etiqueta en español salen de `src/lib/status-colors.ts`
 * (fuente única). Pasar `label` para forzar el texto, o `colorMap` para overrides.
 *
 *   <StateBadge state="running" />           → ● En marcha (verde)
 *   <StateBadge state="in_progress" />       → ● En progreso (ámbar)
 *   <StateBadge state="fail" label="Falla" />
 */

interface StateBadgeProps {
  state: string;
  /** Fuerza la etiqueta. Por defecto usa la etiqueta en español del estado. */
  label?: string;
  /** Overrides puntuales de color por clave. */
  colorMap?: Record<string, { bg: string; text: string; dot: string }>;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StateBadge({ state, label, colorMap, size = "md", className }: StateBadgeProps) {
  const base = statusColor(state);
  const override = colorMap?.[state.toLowerCase()];
  const colors = override ?? base;
  const displayLabel = label ?? base.label;

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px] gap-1",
    md: "px-2 py-0.5 text-xs gap-1.5",
    lg: "px-2.5 py-1 text-sm gap-1.5",
  };
  const dotSizes = { sm: "h-1.5 w-1.5", md: "h-2 w-2", lg: "h-2 w-2" };

  return (
    <span className={cn("inline-flex items-center rounded-full font-medium whitespace-nowrap", colors.bg, colors.text, sizeClasses[size], className)}>
      <span className={cn("shrink-0 rounded-full", colors.dot, dotSizes[size])} />
      {displayLabel}
    </span>
  );
}
