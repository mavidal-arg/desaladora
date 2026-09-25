import { headers } from "next/headers";
import QRCode from "qrcode";
import { PageHeader } from "@/components/PageHeader";
import { getPlantConfig } from "@/lib/plant-config-store";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

// Etiquetas QR imprimibles por activo. Cada QR codifica la URL COMPLETA de la
// vista AR (`<origin><basePath>/ar/<code>`) para abrirse con la cámara nativa.

/**
 * Origen PÚBLICO de la app — el que tiene que poder abrir un teléfono.
 *
 * No alcanza con el encabezado `Host`. Kong publica estas rutas con
 * `preserve_host = false`, así que reescribe el Host con el del upstream y la app
 * recibe `redabast-…-ops:3000`: el hostname interno de Docker. Los QR salían
 * codificando `http://<contenedor>:3000/…`, imposible de abrir desde afuera, en
 * TODA app publicada por Kong. Las publicadas por un bloque de nginx no tenían el
 * problema porque nginx manda `Host $host`.
 *
 * Tampoco sirve `x-forwarded-proto` tal cual: Kong recibe de nginx por http
 * plano en :8088 y reenvía `http`, así que el esquema también salía mal. Por eso,
 * cuando el origen se deduce de `x-forwarded-host`, el esquema se fuerza a https:
 * el borde de Tier0 es https y no hay otra manera de llegar.
 *
 * `PUBLIC_ORIGIN` la escribe el aprovisionador en el `.env` de cada app y es la
 * única forma determinística. Las otras dos ramas son red, no plan.
 */
function origenPublico(h: Headers): { origin: string; fuente: string } {
  const explicito = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  if (explicito) return { origin: explicito, fuente: "PUBLIC_ORIGIN" };
  const reenviado = h.get("x-forwarded-host");
  if (reenviado) return { origin: `https://${reenviado}`, fuente: "x-forwarded-host" };
  const proto = h.get("x-forwarded-proto") ?? "https";
  return { origin: `${proto}://${h.get("host") ?? "localhost"}`, fuente: "host" };
}

/** Un origen sin punto en el host, o con puerto de contenedor, no es alcanzable. */
function pareceInterno(origin: string): boolean {
  try {
    const u = new URL(origin);
    return !u.hostname.includes(".") || u.port === "3000";
  } catch {
    return true;
  }
}

export default async function ArCodesPage() {
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const { origin, fuente } = origenPublico(h);
  const sospechoso = pareceInterno(origin);
  const cfg = await getPlantConfig();
  const areaPorCodigo = Object.fromEntries(cfg.areas.map((a) => [a.code, a]));

  const cards = await Promise.all(
    cfg.equipment.map(async (e) => {
      const url = `${origin}${base}/ar/${e.code}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
      return { code: e.code, name: e.name, area: areaPorCodigo[e.areaCode]?.short ?? e.areaCode, url, svg };
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
        {sospechoso && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 print:hidden">
            Ese origen no es alcanzable desde afuera —se dedujo de <span className="font-mono">{fuente}</span>—,
            así que estos QR no se van a poder escanear con un teléfono. Definí{" "}
            <span className="font-mono">PUBLIC_ORIGIN</span> en el entorno del contenedor con la URL
            pública de Tier0 y volvé a abrir esta página.
          </p>
        )}
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
