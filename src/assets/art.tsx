// Art system: raster atlases (public/assets) for terrain + resource sprites,
// SVG for interaction geometry, number tokens, and wooden pieces.
// Board space: hex radius = 1, pointy-top.

import { For } from "solid-js";
import { palette } from "../palette";
import type { ResourceType } from "../game/model";

// terrain-atlas.png: 1536x1024, 3x2 cells of 512px. Row 0: forest, pasture,
// wheat. Row 1: clay hills, ore mountains, desert.
const ATLAS_CELL: Record<string, [number, number]> = {
  wood: [0, 0],
  sheep: [512, 0],
  wheat: [1024, 0],
  brick: [0, 512],
  ore: [512, 512],
  desert: [1024, 512],
};

/**
 * Terrain illustration clipped by the caller's hex clip-path. Draws a square
 * viewport around the hex center and crops the matching atlas cell via a
 * nested viewBox — the hex clip trims it to shape.
 */
export function TileArt(props: { type: string; seed: string }) {
  const cell = () => ATLAS_CELL[props.type] ?? ATLAS_CELL.desert;
  return (
    <svg
      x="-1"
      y="-1"
      width="2"
      height="2"
      viewBox={`${cell()[0]} ${cell()[1]} 512 512`}
      preserveAspectRatio="xMidYMid slice"
    >
      <image
        href="/assets/terrain-atlas.png"
        x="0"
        y="0"
        width="1536"
        height="1024"
        preserveAspectRatio="none"
      />
    </svg>
  );
}

export const TERRAIN_BASE: Record<string, string> = {
  wood: palette.terrain.wood,
  brick: palette.terrain.brick,
  sheep: palette.terrain.sheep,
  wheat: palette.terrain.wheat,
  ore: palette.terrain.ore,
  desert: palette.terrain.desert,
};

/* ---------------- pieces ---------------- */

/** Settlement: a little house with a roof, ~0.5 units wide, centered at (0,0). */
export function Settlement(p: { color: string; x: number; y: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <ellipse cy="0.21" rx="0.24" ry="0.06" fill="oklch(0 0 0 / 0.22)" />
      <path
        d="M-0.2 0.18 L-0.2 -0.02 L0 -0.24 L0.2 -0.02 L0.2 0.18 Z"
        fill={p.color}
        stroke="oklch(0.98 0.01 90)"
        stroke-width="0.045"
        stroke-linejoin="round"
      />
      <rect x="-0.045" y="0.02" width="0.09" height="0.16" rx="0.015" fill="oklch(0 0 0 / 0.3)" />
    </g>
  );
}

/** City: a taller keep with a second block and a chimney. */
export function City(p: { color: string; x: number; y: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <ellipse cy="0.24" rx="0.3" ry="0.07" fill="oklch(0 0 0 / 0.22)" />
      <path
        d="M-0.28 0.2 L-0.28 -0.06 L-0.12 -0.06 L-0.12 -0.3 L0.04 -0.44 L0.2 -0.3 L0.2 -0.06 L0.28 -0.06 L0.28 0.2 Z"
        fill={p.color}
        stroke="oklch(0.98 0.01 90)"
        stroke-width="0.045"
        stroke-linejoin="round"
      />
      <rect x="-0.19" y="0.0" width="0.08" height="0.2" rx="0.015" fill="oklch(0 0 0 / 0.3)" />
      <rect x="0.02" y="-0.16" width="0.08" height="0.14" rx="0.015" fill="oklch(0 0 0 / 0.3)" />
    </g>
  );
}

/** Robber: a hooded pawn on a shadow. */
export function Robber(p: { x: number; y: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <ellipse cy="0.26" rx="0.2" ry="0.05" fill="oklch(0 0 0 / 0.25)" />
      <path
        d="M-0.14 0.24 Q-0.16 0.02 -0.09 -0.08 Q-0.14 -0.2 0 -0.26 Q0.14 -0.2 0.09 -0.08 Q0.16 0.02 0.14 0.24 Z"
        fill="oklch(0.24 0.02 60)"
      />
      <circle cy="-0.17" r="0.075" fill="oklch(0.3 0.02 60)" />
      <ellipse cx="-0.03" cy="-0.17" rx="0.02" ry="0.028" fill="oklch(0.9 0.03 85)" />
      <ellipse cx="0.03" cy="-0.17" rx="0.02" ry="0.028" fill="oklch(0.9 0.03 85)" />
    </g>
  );
}

/** Port: a little wooden dock off the coast, crate + flag with the ratio. */
export function PortBadge(p: { x: number; y: number; ratio: number; angle: number }) {
  // Clamp the dock's tilt so the flag stays roughly upright.
  const deg = Math.max(-32, Math.min(32, p.angle));
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${deg})`}>
      {/* pier planks */}
      <rect x="-0.34" y="-0.05" width="0.68" height="0.26" rx="0.05" fill="oklch(0.52 0.1 60)" />
      <line
        x1="-0.11"
        y1="-0.05"
        x2="-0.11"
        y2="0.21"
        stroke="oklch(0.4 0.08 55)"
        stroke-width="0.02"
      />
      <line
        x1="0.11"
        y1="-0.05"
        x2="0.11"
        y2="0.21"
        stroke="oklch(0.4 0.08 55)"
        stroke-width="0.02"
      />
      {/* crate */}
      <rect
        x="-0.2"
        y="-0.3"
        width="0.4"
        height="0.28"
        rx="0.04"
        fill={palette.paper}
        stroke="oklch(0.75 0.05 80)"
        stroke-width="0.025"
      />
      <text
        y="-0.15"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="0.17"
        font-weight="800"
        fill={palette.ink}
      >
        {p.ratio}:1
      </text>
      {/* flag */}
      <line
        x1="0.24"
        y1="-0.02"
        x2="0.24"
        y2="-0.34"
        stroke="oklch(0.4 0.06 55)"
        stroke-width="0.025"
      />
      <polygon points="0.24,-0.34 0.44,-0.28 0.24,-0.22" fill={palette.paper} />
    </g>
  );
}

/** Legal-move affordance: a breathing ring over a small seat dot. */
export function TargetRing(p: { x: number; y: number; r?: number }) {
  const r = p.r ?? 0.16;
  return (
    <g transform={`translate(${p.x} ${p.y})`} style="pointer-events:none">
      <circle
        r={r}
        fill="none"
        stroke={palette.accentInk}
        stroke-width="0.045"
        style="animation: ping-soft 1.4s cubic-bezier(0.23,1,0.32,1) infinite; transform-box: fill-box; transform-origin: center;"
      />
      <circle r={r * 0.45} fill={palette.accentInk} opacity="0.95" />
    </g>
  );
}

/* ---------------- resource sprites ---------------- */

// resource-sprites.png: 3x2 grid on transparency. Row 0: wood, brick, sheep.
// Row 1: wheat, ore, development scroll. Percentage positioning means the
// sheet's pixel size doesn't matter.
const SPRITE_CELL: Record<ResourceType | "dev", [number, number]> = {
  wood: [0, 0],
  brick: [50, 0],
  sheep: [100, 0],
  wheat: [0, 100],
  ore: [50, 100],
  dev: [100, 100],
};

export function ResourceIcon(p: { type: ResourceType | "dev"; size?: number }) {
  const s = p.size ?? 18;
  const [cx, cy] = SPRITE_CELL[p.type];
  // Painted cells have opaque backgrounds — frame them like card art windows.
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: `${s}px`,
        height: `${s}px`,
        "vertical-align": "-0.2em",
        "background-image": "url(/assets/resource-sprites.png)",
        "background-size": "300% 200%",
        "background-position": `${cx}% ${cy}%`,
        "background-repeat": "no-repeat",
        "border-radius": "22%",
        "box-shadow": "inset 0 0 0 1px oklch(0 0 0 / 0.18)",
        "flex-shrink": "0",
      }}
    />
  );
}

/* ---------------- action glyphs (24x24, currentColor) ---------------- */

export function ActionIcon(p: { name: string; size?: number }) {
  const s = p.size ?? 20;
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="display:inline-block;vertical-align:-0.25em"
    >
      {p.name === "road" && <path d="M4 19 L16 5 M7.5 16.5 l1.8 1.8 M12 12 l1.8 1.8" />}
      {p.name === "settle" && <path d="M4 20 V11 L12 4 L20 11 V20 Z M10 20 v-5 h4 v5" />}
      {p.name === "city" && (
        <path d="M3 20 V10 h4 V5 h4 l2 -2 l2 2 h4 v5 h2 V20 Z M9 20 v-4 h3 v4" />
      )}
      {p.name === "dev" && <path d="M6 3 h9 l3 3 v15 h-12 Z M15 3 v3 h3 M9 12 l3 3 l4 -5" />}
      {p.name === "trade" && <path d="M4 8 h13 m-3 -3 l3 3 l-3 3 M20 16 H7 m3 3 l-3 -3 l3 -3" />}
      {p.name === "end" && <path d="M6 21 V4 m0 1 h11 l-3 4 l3 4 H6" />}
    </svg>
  );
}

/* ---------------- dice ---------------- */

const PIP_POS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [
    [7.5, 7.5],
    [16.5, 16.5],
  ],
  3: [
    [7, 7],
    [12, 12],
    [17, 17],
  ],
  4: [
    [7.5, 7.5],
    [16.5, 7.5],
    [7.5, 16.5],
    [16.5, 16.5],
  ],
  5: [
    [7, 7],
    [17, 7],
    [12, 12],
    [7, 17],
    [17, 17],
  ],
  6: [
    [7, 6.5],
    [17, 6.5],
    [7, 12],
    [17, 12],
    [7, 17.5],
    [17, 17.5],
  ],
};

/** A real die face, 24x24. Red pips when hot (any die can be). */
export function DieFace(p: { value: number; size?: number; hot?: boolean }) {
  const s = p.size ?? 40;
  const pip = p.hot ? palette.numRed : palette.ink;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label={`die showing ${p.value}`} role="img">
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="5"
        fill={palette.paperHi}
        stroke={palette.tokenRing}
        stroke-width="1"
      />
      <For each={PIP_POS[p.value] ?? []}>
        {([x, y]) => <circle cx={x} cy={y} r="2.1" fill={pip} />}
      </For>
    </svg>
  );
}
