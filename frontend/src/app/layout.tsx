import type { Metadata } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppShellWrapper } from "@/components/AppShellWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/mes";

// Western UI sans (self-hosted at build time by next/font — no runtime network).
// IBM Plex Mono stays available via `font-mono` for code-like fields (asset codes).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Desaladora Coquimbo V2 — Operación de Planta",
  description: "Vista operativa de la Planta Desaladora Maitencillo de Panul (Aguas del Valle): mímico de proceso, activos (EAM) y KPIs de producción de agua por ósmosis inversa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased dark", "font-sans", inter.variable)}>
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <AppShellWrapper>{children}</AppShellWrapper>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
