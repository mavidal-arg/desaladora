"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * OEEGauge — three-ring donut showing Availability / Performance / Quality
 * with a center OEE value.
 *
 * Usage:
 *   <OEEGauge availability={92} performance={87} quality={98} />
 */

interface OEEGaugeProps {
  /** Availability percentage 0-100 */
  availability: number;
  /** Performance percentage 0-100 */
  performance: number;
  /** Quality percentage 0-100 */
  quality: number;
  /**
   * OEE ya calculado por el motor. Cuando viene, se muestra tal cual.
   *
   * Sin esto el gauge derivaba el OEE de los tres pilares que recibe — que
   * llegan REDONDEADOS — mientras la tarjeta de al lado mostraba el valor del
   * motor, redondeado una sola vez al final. Dos redondeos del mismo número:
   * la misma pantalla decía 79 % en la tarjeta y 78 % en el donut.
   */
  oee?: number;
  /** Width & height in pixels. Default 200. */
  size?: number;
  className?: string;
  /**
   * Texto bajo el valor central. Default "OEE".
   *
   * Este gauge se reusa para métricas que NO son OEE de producción (p.ej. la
   * "salud compuesta" de Twin, que combina integridad de membrana + eficiencia
   * energética + rechazo de sales). Sin este prop, el centro siempre decía
   * "OEE" sin importar qué se le pasara — el mismo tren mostraba "30% OEE" en
   * Panel Principal y "36% OEE" en Twin, dos métricas distintas con el mismo
   * nombre. Default preserva el comportamiento de los call sites que sí son OEE real.
   */
  centerLabel?: string;
  /**
   * Letras de la leyenda de los 3 anillos, en orden [availability, performance, quality].
   * Default ["D","R","C"] (Disponibilidad/Rendimiento/Calidad) — el desglose de OEE se
   * muestra en español en el resto de la app (KPIs, `Bar3`); las siglas en inglés
   * "A/P/Q" quedaban sólo acá, sin ningún llamador real que las necesitara.
   */
  legendLabels?: [string, string, string];
}

function ring(value: number, color: string) {
  return [
    { value, fill: color },
    { value: 100 - value, fill: "transparent" },
  ];
}

export function OEEGauge({
  availability,
  performance,
  quality,
  oee: oeeProp,
  size = 200,
  className,
  centerLabel = "OEE",
  legendLabels = ["D", "R", "C"],
}: OEEGaugeProps) {
  const [l1, l2, l3] = legendLabels;
  // El cálculo local queda sólo para llamadores que no tengan el agregado.
  const oee = oeeProp ?? Math.round((availability * performance * quality) / 10000);
  const trackColor = "#f4f4f5"; // gray-100

  return (
    <div className={cn("mx-auto w-full", className)} style={{ maxWidth: size }}>
      <div className="relative aspect-square w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Track rings (background) */}
          <Pie data={[{ value: 100 }]} dataKey="value" cx="50%" cy="50%" innerRadius="78%" outerRadius="88%" startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={trackColor} />
          </Pie>
          <Pie data={[{ value: 100 }]} dataKey="value" cx="50%" cy="50%" innerRadius="60%" outerRadius="70%" startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={trackColor} />
          </Pie>
          <Pie data={[{ value: 100 }]} dataKey="value" cx="50%" cy="50%" innerRadius="42%" outerRadius="52%" startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={trackColor} />
          </Pie>

          {/* Value rings */}
          <Pie data={ring(availability, "var(--accent)")} dataKey="value" cx="50%" cy="50%" innerRadius="78%" outerRadius="88%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={4}>
            {ring(availability, "").map((_, i) => (
              <Cell key={i} fill={i === 0 ? "var(--accent)" : "transparent"} />
            ))}
          </Pie>
          <Pie data={ring(performance, "#71717a")} dataKey="value" cx="50%" cy="50%" innerRadius="60%" outerRadius="70%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={4}>
            {ring(performance, "").map((_, i) => (
              <Cell key={i} fill={i === 0 ? "#71717a" : "transparent"} />
            ))}
          </Pie>
          <Pie data={ring(quality, "#27272a")} dataKey="value" cx="50%" cy="50%" innerRadius="42%" outerRadius="52%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={4}>
            {ring(quality, "").map((_, i) => (
              <Cell key={i} fill={i === 0 ? "#27272a" : "transparent"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{oee}%</span>
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{centerLabel}</span>
      </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />{l1} {availability}%</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#71717a]" />{l2} {performance}%</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#27272a]" />{l3} {quality}%</span>
      </div>
    </div>
  );
}
