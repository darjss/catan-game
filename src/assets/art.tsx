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
        href="/assets/terrain-atlas.webp"
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

/** A resource sprite cropped to its atlas cell, usable inside SVG. */
export function SpriteImage(p: { type: ResourceType | "dev"; x: number; y: number; size: number }) {
  // sprite cell origins in atlas pixels (3x2 of 512)
  const CELL: Record<string, [number, number]> = {
    wood: [0, 0],
    brick: [512, 0],
    sheep: [1024, 0],
    wheat: [0, 512],
    ore: [512, 512],
    dev: [1024, 512],
  };
  const [cx, cy] = CELL[p.type] ?? CELL.dev;
  return (
    <svg
      x={p.x}
      y={p.y}
      width={p.size}
      height={p.size}
      viewBox={`${cx} ${cy} 512 512`}
      preserveAspectRatio="xMidYMid slice"
    >
      <image
        href="/assets/resource-sprites.webp"
        x="0"
        y="0"
        width="1536"
        height="1024"
        preserveAspectRatio="none"
      />
    </svg>
  );
}

/** Port: a little wooden dock off the coast; the crate shows the ratio and,
 *  for specialized ports, the resource it trades. */
export function PortBadge(p: { x: number; y: number; ratio: number; angle: number; res?: string }) {
  // Clamp the dock's tilt so the flag stays roughly upright.
  const deg = Math.max(-32, Math.min(32, p.angle));
  const typed = p.res && p.res !== "generic";
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
      {/* crate with the ratio; typed ports carry a big resource icon on top */}
      <rect
        x="-0.24"
        y="-0.56"
        width="0.48"
        height="0.54"
        rx="0.05"
        fill={palette.paper}
        stroke="oklch(0.75 0.05 80)"
        stroke-width="0.025"
      />
      {typed ? (
        <SpriteImage type={p.res as ResourceType} x={-0.17} y={-0.53} size={0.34} />
      ) : (
        <text
          y="-0.36"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="0.3"
          font-weight="900"
          fill={palette.inkSoft}
        >
          ?
        </text>
      )}
      <text
        y="-0.1"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="0.16"
        font-weight="800"
        fill={palette.ink}
      >
        {p.ratio}:1
      </text>
      {/* flag */}
      <line
        x1="0.32"
        y1="-0.02"
        x2="0.32"
        y2="-0.34"
        stroke="oklch(0.4 0.06 55)"
        stroke-width="0.025"
      />
      <polygon points="0.32,-0.34 0.52,-0.28 0.32,-0.22" fill={palette.paper} />
    </g>
  );
}

/** Legal-move affordance: a pulsing accent ring over a solid target dot —
 *  must read on any terrain and on touch screens where no hover exists. */
export function TargetRing(p: { x: number; y: number; r?: number }) {
  const r = p.r ?? 0.16;
  return (
    <g transform={`translate(${p.x} ${p.y})`} style="pointer-events:none">
      {/* expanding pulse */}
      <circle
        r={r}
        fill="none"
        stroke={palette.accent}
        stroke-width="0.06"
        style="animation: ping-soft 1.3s cubic-bezier(0.23,1,0.32,1) infinite; transform-box: fill-box; transform-origin: center;"
      />
      {/* static ring */}
      <circle r={r} fill="none" stroke={palette.accent} stroke-width="0.045" opacity="0.9" />
      {/* solid target dot, white core for contrast on dark terrain */}
      <circle r={r * 0.52} fill={palette.accent} stroke={palette.accentInk} stroke-width="0.028" />
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
        "background-image": "url(/assets/resource-sprites.webp)",
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
  // Solid wooden-piece silhouettes — they read at dock size, strokes don't.
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      aria-hidden="true"
      fill="currentColor"
      stroke="none"
      style="display:inline-block;vertical-align:-0.25em"
    >
      {p.name === "road" && (
        <rect x="3" y="9.5" width="18" height="5.5" rx="1.6" transform="rotate(-30 12 12)" />
      )}
      {p.name === "settle" && <path d="M4 20 V11 L12 4 L20 11 V20 Z" />}
      {p.name === "city" && (
        <path d="M3 20 V11 L7 7 L11 11 V20 Z M11 20 V8 L15 4 L19 8 V20 Z M19 20 h2 v-6 h-2 Z" />
      )}
      {p.name === "dev" && (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path
            d="M12 7 l1.4 3 3.2 .3 -2.4 2.1 .7 3.1 -2.9 -1.7 -2.9 1.7 .7 -3.1 -2.4 -2.1 3.2 -.3 Z"
            fill="oklch(1 0 0 / 0.9)"
            stroke="none"
          />
        </>
      )}
      {p.name === "trade" && (
        <>
          <path d="M4 9.5 a1.7 1.7 0 0 1 1.7 -1.7 H18 l-2.4 -2.4 L17.5 3.5 l4.5 4.5 -4.5 4.5 -1.9 -1.9 2.4 -2.4 H5.7 A1.7 1.7 0 0 1 4 9.5 Z" />
          <path d="M20 14.5 a1.7 1.7 0 0 1 -1.7 1.7 H6 l2.4 2.4 -1.9 1.9 -4.5 -4.5 4.5 -4.5 1.9 1.9 -2.4 2.4 h12.3 a1.7 1.7 0 0 1 1.7 1.7 Z" />
        </>
      )}
      {p.name === "end" && <path d="M5 21 V4 h1.8 v17 Z M7.5 4 h11.8 l-3.2 4.2 3.2 4.2 H7.5 Z" />}
      {p.name === "cancel" && (
        <path d="M6.2 4.5 L12 10.3 17.8 4.5 19.5 6.2 13.7 12 19.5 17.8 17.8 19.5 12 13.7 6.2 19.5 4.5 17.8 10.3 12 4.5 6.2 Z" />
      )}
      {p.name === "reset" && (
        <path d="M12 4 a8 8 0 1 1 -7.7 5.7 l-1.8 .9 L5.6 5.4 l5.4 3.1 -1.9 .9 A5.6 5.6 0 1 0 12 6.4 Z" />
      )}
      {p.name === "expand" && (
        <path d="M4 4 h5.5 v2.4 H7.4 l3.3 3.3 -1.7 1.7 -3.3 -3.3 v2.1 H4 Z M20 20 h-5.5 v-2.4 h2.1 l-3.3 -3.3 1.7 -1.7 3.3 3.3 v-2.1 H20 Z" />
      )}
      {p.name === "help" && (
        <path d="M12 3 a9 9 0 1 0 0 18 a9 9 0 0 0 0 -18 Z m0 4.2 a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0 -3 Z m-1.1 4.4 h2.2 v5.6 h-2.2 Z" />
      )}
      {p.name === "cards" && <rect x="5" y="6" width="14" height="14" rx="2" />}
      {p.name === "knight" && (
        <path d="M17 3 L21 7 L12.5 15.5 L15.5 18.5 L14 20 L9.5 15.5 L7 18 L6 17 L8.5 14.5 L4 10 L5.5 8.5 L8.5 11.5 Z" />
      )}
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
