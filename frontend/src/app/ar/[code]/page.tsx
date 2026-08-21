import Link from "next/link";
import { Droplets, QrCode } from "lucide-react";
import { getAssetArView } from "@/lib/ar";
import { ArAssetView } from "./ArAssetView";

export const dynamic = "force-dynamic";

export default async function ArPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const view = await getAssetArView(code);

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      {/* Cabecera branded compacta (sin Shell) */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur">
        <Droplets className="h-5 w-5 text-[var(--accent)]" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Aguas del Valle</div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">Vista de terreno · QR</div>
        </div>
      </header>

      {view ? (
        <ArAssetView initial={view} code={code} />
      ) : (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--muted)]">
            <QrCode className="h-8 w-8 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="text-lg font-semibold">Activo no encontrado</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            El código <span className="font-mono text-[var(--foreground)]">{code}</span> no corresponde a un equipo de la planta.
            Verificá el QR o volvé a escanear la etiqueta del equipo.
          </p>
          <Link href="/login" className="mt-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]">
            Ir a la plataforma
          </Link>
        </div>
      )}
    </div>
  );
}
