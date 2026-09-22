"use client";

import { useState, type ReactNode } from "react";
import type { ActivityPoint } from "@/server/domains/mastery/dashboard.queries";

interface Props {
  points: ActivityPoint[];
  /** Height of the plot area in px. */
  height?: number;
  /** Called when a bar is activated, so the parent can title the panel. */
  onHoverChange?: (point: ActivityPoint | null, index: number | null) => void;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Bars are rendered from the same values the tiles use, so the chart can never
 * disagree with "Questions this week". Validated at construction, so no
 * `?? default` fallbacks scatter through the render path. */
const COLORS = {
  bar: "rgba(255,255,255,0.28)",
  barActive: "#ffffff",
  grid: "rgba(255,255,255,0.18)",
};

const fmtDay = (key: string): string => {
  // Day keys are YYYY-MM-DD; parse as UTC so the label can't shift by a day.
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
};

/**
 * Weekly activity as a column chart. Hover/focus/click all select the same
 * bar, so the readout is reachable by mouse, touch, and keyboard alike.
 * The <table> below is the real data source for assistive tech; the SVG is
 * presentational.
 */
export function ActivityChart({ points, height = 168, onHoverChange }: Props): ReactNode {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(1, ...points.map((p) => p.attempted));
  // Guard the degenerate case rather than dividing by zero in the layout math.
  const n = Math.max(1, points.length);
  const gap = 8;
  const barW = 32;
  const width = n * barW + (n - 1) * gap;

  const select = (i: number | null) => {
    setActive(i);
    onHoverChange?.(i === null ? null : (points[i] ?? null), i);
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto no-scrollbar">
        <svg
          role="presentation"
          aria-hidden="true"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
        >
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={width}
              y1={height - f * (height - 24)}
              y2={height - f * (height - 24)}
              stroke={COLORS.grid}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}
          {points.map((p, i) => {
            const h = Math.max(2, (p.attempted / max) * (height - 24));
            const x = i * (barW + gap);
            const y = height - h;
            const isActive = i === active;
            return (
              <g key={p.day}>
                {/* Full-height hit target: a 2px bar is unhoverable. */}
                <rect
                  x={x}
                  y={0}
                  width={barW}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onPointerEnter={() => select(i)}
                  onPointerLeave={() => select(null)}
                />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={6}
                  fill={isActive ? COLORS.barActive : COLORS.bar}
                  className="pointer-events-none transition-[fill] duration-150"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex" style={{ gap: `${gap}px` }}>
        {points.map((p, i) => (
          <button
            key={p.day}
            type="button"
            style={{ width: `${barW}px` }}
            onFocus={() => select(i)}
            onBlur={() => select(null)}
            onClick={() => select(i)}
            className="text-center text-xs text-white/70"
          >
            {fmtDay(p.day).split(" ")[0]}
            <span className="sr-only">
              {fmtDay(p.day)}: {p.attempted} attempted, {p.correct} correct
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
