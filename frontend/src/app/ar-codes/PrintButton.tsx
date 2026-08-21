"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()}
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] print:hidden">
      <Printer className="h-4 w-4" /> Imprimir etiquetas
    </button>
  );
}
