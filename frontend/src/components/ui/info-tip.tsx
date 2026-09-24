"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// InfoTip — ícono (i) con tooltip explicativo. Antes había 3 implementaciones
// locales casi idénticas (Twin, UfCebPanel, Predictive), cada una con su propia
// firma, y ninguna reusada donde hacía falta (Panel Principal). Une los dos
// patrones que ya estaban en producción:
//   · sólo ícono, junto a un título ya visible aparte     → omitir `label`
//   · label visible + ícono en línea (headers de tabla)   → pasar `label`
// ─────────────────────────────────────────────────────────────────────────────

interface InfoTipProps {
  /** Contenido del tooltip. */
  children: ReactNode;
  /** Texto/nodo visible antes del ícono (p.ej. header de columna). Si se omite, sólo se ve el ícono. */
  label?: ReactNode;
  /** aria-label del botón. Default: "Explicación", o "Qué es {label}" si label es string. */
  srLabel?: string;
  side?: "top" | "bottom" | "left" | "right";
  contentClassName?: string;
  className?: string;
}

export function InfoTip({ children, label, srLabel, side = "top", contentClassName, className }: InfoTipProps) {
  const resolvedSrLabel = srLabel ?? (typeof label === "string" ? `Qué es ${label}` : "Explicación");
  const icon = (
    <Tooltip>
      <TooltipTrigger type="button" className="text-muted-foreground transition-colors hover:text-[var(--accent)]" aria-label={resolvedSrLabel}>
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side={side} className={cn("max-w-xs", contentClassName)}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
  return (
    <TooltipProvider delay={120}>
      {label == null ? icon : (
        <span className={cn("inline-flex items-center gap-1", className)}>
          {label}
          {icon}
        </span>
      )}
    </TooltipProvider>
  );
}
