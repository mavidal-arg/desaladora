// ─────────────────────────────────────────────────────────────────────────────
// Flags de build. Se congelan en el bundle (NEXT_PUBLIC_*) al compilar, así que
// distintos clones de la app pueden habilitar cosas distintas sin tocar código.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fuente única de valores de señal + snapshot de observación de terreno.
 *
 * OFF (default, Coquimbo V2): cada vista simula su propio "valor en vivo" en el
 * browser (`useSignalSim` / `useTwinLive` con `Math.random`), así que el mismo
 * activo muestra números distintos en el gemelo, la ficha y el QR.
 *
 * ON (Iquique — `LIVE_SIGNALS_UNIFIED=1` en su compose/build): todas las vistas
 * pollean un único resolver server-side (`lib/live-signals.ts`), determinista y
 * anclado al último valor sembrado, y la observación de terreno guarda una foto
 * de lo que se veía + lo que leyó el operador.
 *
 * Se activa por build-arg en `deploy/compose.aguas-del-norte-desaladora-iquique.yaml`.
 * "Pasar a Coquimbo" = activarlo en `deploy/compose.yaml` + rebuild.
 */
export const LIVE_UNIFIED = process.env.NEXT_PUBLIC_LIVE_SIGNALS_UNIFIED === "1";
