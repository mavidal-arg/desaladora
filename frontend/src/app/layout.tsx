import type { Metadata } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppShellWrapper } from "@/components/AppShellWrapper";
import { BrandProvider } from "@/components/BrandProvider";
import { esImagen } from "@/lib/brand";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/mes";
import { getPlantConfig } from "@/lib/plant-config-store";

// Western UI sans (self-hosted at build time by next/font — no runtime network).
// IBM Plex Mono stays available via `font-mono` for code-like fields (asset codes).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

// La identidad se lee de la DB en cada request. Sin esto, las rutas que Next
// prerenderiza (el login, /_not-found) se quedan con la marca del BUILD — donde
// la DB ni siquiera está disponible — y el login seguía mostrando el logo y el
// pie del template aunque el Admin ya tuviera los del cliente.
export const dynamic = "force-dynamic";

// Título, descripción y favicon salen de la identidad configurada: al clonar la
// app para otro cliente, hasta la pestaña del navegador queda a su nombre.
export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getPlantConfig();
  return {
    title: `${cfg.app.shortName} · ${cfg.app.site}`,
    description: `${cfg.plant.name} (${cfg.plant.company}) — ${cfg.plant.product}.`,
    icons: esImagen(cfg.branding.logo) ? { icon: cfg.branding.logo } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cfg = await getPlantConfig();
  return (
    <html lang="es" className={cn("h-full antialiased dark", "font-sans", inter.variable)}>
      <body className="min-h-full font-sans">
        <BrandProvider brand={{ app: cfg.app, branding: cfg.branding }}>
          <ThemeProvider>
            <AppShellWrapper>{children}</AppShellWrapper>
            <Toaster />
          </ThemeProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
