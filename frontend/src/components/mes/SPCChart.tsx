"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Scatter,
  ComposedChart,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * SPCChart — Statistical Process Control chart (X-bar style).
 * Draws a data line with UCL / LCL / CL reference lines and highlights
 * out-of-control points in red.
 *
 * Usage:
 *   <SPCChart
 *     data={[{ x: "08:00", value: 25.1 }, { x: "08:05", value: 24.8 }, ...]}
 *     ucl={26} lcl={24} cl={25}
 *     label="Temperature (°C)"
 *   />
 */

interface SPCDataPoint {
  /** X-axis label (time, sample number, etc.) */
  x: string;
  /** Measured value */
  value: number;
}

interface SPCChartProps {
  data: SPCDataPoint[];
  /** Upper Control Limit */
  ucl: number;
  /** Lower Control Limit */
  lcl: number;
  /** Center Line (target) */
  cl: number;
  /** Chart title */
  label?: string;
  /** Height in pixels. Default 260. */
  height?: number;
  className?: string;
}

export function SPCChart({ data, ucl, lcl, cl, label, height = 260, className }: SPCChartProps) {
  const violations = data
    .filter((d) => d.value > ucl || d.value < lcl)
    .map((d) => ({ ...d, violation: d.value }));

  // Build an evenly-spaced, round-number Y axis that always frames UCL/LCL with margin.
  // (Recharts' default tick picker produced uneven labels like 80·95·110·122 when the
  // domain was forced to the padded control limits — this snaps to a "nice" step.)
  const span = Math.max(ucl - lcl, Math.abs(cl) * 0.1, 1);
  const padLo = lcl - span * 0.25;
  const padHi = ucl + span * 0.25;
  const rawStep = (padHi - padLo) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceStep = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const yMin = Math.floor(padLo / niceStep) * niceStep;
  const yMax = Math.ceil(padHi / niceStep) * niceStep;
  const yTicks: number[] = [];
  for (let t = yMin; t <= yMax + niceStep * 0.001; t += niceStep) yTicks.push(Math.round(t * 1000) / 1000);
  const yFmt = (v: number) => (niceStep >= 1 ? `${Math.round(v)}` : niceStep >= 0.1 ? v.toFixed(1) : v.toFixed(2));

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <p className="mb-2 text-xs font-medium">{label}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 28, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#a1a1aa" }} stroke="#3f3f46" />
          <YAxis
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            stroke="#3f3f46"
            width={40}
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={(v) => yFmt(Number(v))}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", background: "#111", border: "1px solid #333", borderRadius: 6 }}
          />

          {/* Control limits */}
          <ReferenceLine y={ucl} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "UCL", position: "right", fontSize: 10, fill: "#ef4444" }} />
          <ReferenceLine y={cl} stroke="#71717a" strokeDasharray="4 2" label={{ value: "CL", position: "right", fontSize: 10, fill: "#a1a1aa" }} />
          <ReferenceLine y={lcl} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "LCL", position: "right", fontSize: 10, fill: "#ef4444" }} />

          {/* Data line */}
          <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} activeDot={{ r: 4 }} />

          {/* Out-of-control points */}
          <Scatter data={violations} dataKey="violation" fill="#ef4444" shape="circle" legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
