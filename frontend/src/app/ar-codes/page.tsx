import { headers } from "next/headers";
import QRCode from "qrcode";
import { PageHeader } from "@/components/PageHeader";
import { PLANT, areaByCode } from "@/lib/plant-config";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

// Etiquetas QR imprimibles por activo. Cada QR codifica la URL COMPLETA de la
// vista AR (`<origin><basePath>/ar/<code>`) para abrirse con la cámara nativa.
export default async function ArCodesPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const origin = `${proto}://${host}`;

  const cards = await Promise.all(
    PLANT.equipment.map(async (e) => {
      const url = `${origin}${base}/ar/${e.code}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
      return { code: e.code, name: e.name, area: areaByCode[e.areaCode]?.short ?? e.areaCode, url, svg };
    })
  );

  return (
    <div>
      <PageHeader title="Códigos QR de activos" subtitle="Etiquetas para pegar en cada equipo — el operador de campo escanea y abre la vista de terreno del activo" />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-[var(--muted-foreground)]">{cards.length} activos · el QR apunta a <span className="font-mono">{origin}{base}/ar/&lt;código&gt;</span></p>
          <PrintButton />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
          {cards.map((c) => (
            <div key={c.code} className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center break-inside-avoid">
              <div className="w-full max-w-[140px] rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full">
                <span dangerouslySetInnerHTML={{ __html: c.svg }} />
              </div>
              <div className="font-mono text-sm font-bold">{c.code}</div>
              <div className="line-clamp-2 text-[11px] leading-tight text-[var(--muted-foreground)]">{c.name}</div>
              <div className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px]">{c.area}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
