import type { PlantConfig } from "@/lib/plant-config";

/**
 * Helpers de marca SIN "use client".
 *
 * Viven acá y no en `BrandProvider` porque los usan los dos lados: el layout
 * raíz y la vista AR son componentes de servidor, y llamar a una función
 * exportada por un módulo cliente desde el servidor rompe el build
 * ("Attempted to call esImagen() from the server").
 */

export type Brand = { app: PlantConfig["app"]; branding: PlantConfig["branding"] };

// Conectores y formas societarias: sin esto "Aguas del Valle" daba "AD".
const NEXOS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "sa", "s.a.", "s.a", "srl", "ltda", "spa", "inc"]);

/** "Aguas del Valle" → "AV". Sirve de logo cuando el cliente no subió imagen. */
export function iniciales(texto: string, max = 2): string {
  return texto
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NEXOS.has(w.toLowerCase().replace(/[.,]+$/, "")))
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** ¿El valor guardado es una imagen usable en un <img src>? */
export function esImagen(logo: string | undefined): boolean {
  return Boolean(logo && (logo.startsWith("data:image/") || logo.startsWith("http")));
}

function aRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function oscurecer(hex: string, factor = 0.82): string {
  const rgb = aRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => Math.round(v * factor));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function conAlfa(hex: string, alfa: number): string {
  const rgb = aRgb(hex);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alfa})` : hex;
}

/** Negro o blanco, el que se lea sobre ese color (luminancia relativa sRGB). */
function tintaSobre(hex: string): string {
  const rgb = aRgb(hex);
  if (!rgb) return "#000000";
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#000000" : "#ffffff";
}

/**
 * Los tokens se SOBRESCRIBEN, no se reemplaza `globals.css` (AGENTS.md lo
 * prohíbe). Van con `:root` y `.dark` juntos porque globals redefine `--accent`
 * y `--primary` dentro de `.dark`: cubriendo un solo ámbito, en modo oscuro no
 * se vería el color del cliente.
 */
export function tokensDeMarca(b: PlantConfig["branding"]): string {
  const decl = [
    `--accent: ${b.accent};`,
    `--accent-strong: ${oscurecer(b.accent)};`,
    `--accent-light: ${conAlfa(b.accent, 0.14)};`,
    `--accent-foreground: ${tintaSobre(b.accent)};`,
    `--primary: ${b.primary};`,
    `--primary-foreground: ${tintaSobre(b.primary)};`,
  ].join(" ");
  return `:root { ${decl} }\n.dark { ${decl} }`;
}
