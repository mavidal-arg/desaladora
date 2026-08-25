"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster — global toast notification container.
 * Add <Toaster /> once in the root layout. Then use:
 *
 *   import { toast } from "sonner";
 *   toast.success("Work order created");
 *   toast.error("Invalid state transition");
 *   toast("Equipment CNC-03 is now idle");
 */

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        // En el teléfono el toast cae justo encima de la barra de acción de las
        // hojas inferiores (la vista de terreno por QR) y tapa el botón de
        // confirmar durante unos segundos. El margen lo levanta sólo en pantalla
        // angosta; en escritorio queda donde estaba.
        className: "mb-24 md:mb-0",
        style: {
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: "12px",
          border: "1px solid var(--border)",
          borderRadius: "8px",
        },
      }}
    />
  );
}
