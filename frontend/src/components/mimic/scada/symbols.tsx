// Símbolos SCADA en SVG, centrados en (0,0). El renderer los traslada a su nodo.
// `hex` = color del estado SCADA (marcha/detención/anomalía/alarma). El cuerpo usa
// tokens de tema (var(--card)/var(--border)) para cohesión; el trazo lleva el estado.
import type { SymbolKind } from "./mimic-model";

const BODY = "var(--card)";
const INK = "var(--muted-foreground)";

function Pump({ hex, w }: { hex: string; w: number }) {
  const r = w / 2;
  return (
    <g>
      <circle r={r} fill={BODY} stroke={hex} strokeWidth={2.5} />
      {/* impulsor */}
      <path d={`M ${-r * 0.45} 0 L ${r * 0.5} ${-r * 0.42} L ${r * 0.5} ${r * 0.42} Z`} fill={hex} opacity={0.9} />
    </g>
  );
}

function RoRack({ hex, w, h }: { hex: string; w: number; h: number }) {
  const els = 5;
  const pad = 10;
  const usable = w - pad * 2;
  const er = Math.min(h * 0.3, usable / (els * 2.4));
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={BODY} stroke={hex} strokeWidth={2.5} />
      {Array.from({ length: els }).map((_, i) => {
        const cx = -usable / 2 + (usable / (els - 1)) * i;
        return <circle key={i} cx={cx} cy={0} r={er} fill="none" stroke={hex} strokeWidth={1.4} opacity={0.85} />;
      })}
    </g>
  );
}

function Eri({ hex, w, h }: { hex: string; w: number; h: number }) {
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7} fill={BODY} stroke={hex} strokeWidth={2.5} />
      {/* dos flechas de rotación (intercambiador de presión) */}
      <path d={`M ${-w * 0.22} ${-h * 0.18} A ${w * 0.22} ${h * 0.22} 0 1 1 ${w * 0.22} ${-h * 0.05}`} fill="none" stroke={hex} strokeWidth={2} />
      <path d={`M ${w * 0.22} ${h * 0.18} A ${w * 0.22} ${h * 0.22} 0 1 1 ${-w * 0.22} ${h * 0.05}`} fill="none" stroke={hex} strokeWidth={2} />
      <path d={`M ${w * 0.22} ${-h * 0.05} l -6 -5 m 6 5 l -6 6`} fill="none" stroke={hex} strokeWidth={2} />
      <path d={`M ${-w * 0.22} ${h * 0.05} l 6 5 m -6 -5 l 6 -6`} fill="none" stroke={hex} strokeWidth={2} />
    </g>
  );
}

function CartridgeFilter({ hex, w, h }: { hex: string; w: number; h: number }) {
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w / 2} fill={BODY} stroke={hex} strokeWidth={2.5} />
      {[-0.5, 0, 0.5].map((f, i) => (
        <line key={i} x1={f * w * 0.5} y1={-h / 2 + 10} x2={f * w * 0.5} y2={h / 2 - 10} stroke={hex} strokeWidth={1.3} opacity={0.8} />
      ))}
    </g>
  );
}

function Tank({ hex, w, h }: { hex: string; w: number; h: number }) {
  const ry = w * 0.16;
  const level = 0.45; // nivel visual (estático; el valor real va en el badge)
  const top = -h / 2 + ry;
  const bot = h / 2 - ry;
  const lvY = bot - (bot - top) * level;
  return (
    <g>
      {/* cuerpo */}
      <path d={`M ${-w / 2} ${top} L ${-w / 2} ${bot} A ${w / 2} ${ry} 0 0 0 ${w / 2} ${bot} L ${w / 2} ${top}`} fill={BODY} stroke={hex} strokeWidth={2.5} />
      {/* líquido */}
      <path d={`M ${-w / 2} ${lvY} L ${-w / 2} ${bot} A ${w / 2} ${ry} 0 0 0 ${w / 2} ${bot} L ${w / 2} ${lvY} A ${w / 2} ${ry} 0 0 1 ${-w / 2} ${lvY}`} fill={hex} opacity={0.18} />
      <ellipse cx={0} cy={lvY} rx={w / 2} ry={ry} fill="none" stroke={hex} strokeWidth={1.3} opacity={0.7} />
      {/* tapa */}
      <ellipse cx={0} cy={top} rx={w / 2} ry={ry} fill={BODY} stroke={hex} strokeWidth={2.5} />
    </g>
  );
}

function Valve({ hex, w }: { hex: string; w: number }) {
  const r = w / 2;
  return (
    <g>
      <path d={`M ${-r} ${-r * 0.7} L 0 0 L ${-r} ${r * 0.7} Z`} fill={BODY} stroke={hex} strokeWidth={2} />
      <path d={`M ${r} ${-r * 0.7} L 0 0 L ${r} ${r * 0.7} Z`} fill={BODY} stroke={hex} strokeWidth={2} />
    </g>
  );
}

function Vessel({ hex, w, h }: { hex: string; w: number; h: number }) {
  // genérico para mixer / intake / uf / dosing / fallback: cápsula con marca.
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) / 3} fill={BODY} stroke={hex} strokeWidth={2.5} />
      <circle r={Math.min(w, h) * 0.22} fill="none" stroke={hex} strokeWidth={1.6} opacity={0.8} />
    </g>
  );
}

export function ScadaSymbol({ kind, hex, w = 44, h = 44 }: { kind: SymbolKind; hex: string; w?: number; h?: number }) {
  switch (kind) {
    case "pump": return <Pump hex={hex} w={w} />;
    case "ro_rack": return <RoRack hex={hex} w={w} h={h} />;
    case "eri": return <Eri hex={hex} w={w} h={h} />;
    case "cartridge_filter": return <CartridgeFilter hex={hex} w={w} h={h} />;
    case "tank": return <Tank hex={hex} w={w} h={h} />;
    case "valve": return <Valve hex={hex} w={w} />;
    default: return <Vessel hex={hex} w={w} h={h} />;
  }
}

export { INK };
