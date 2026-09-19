// SVG art system: seeded procedural tile interiors + hand-authored pieces.
// All art lives on the board's unit grid (hex radius = 1). Flat geometric
// shapes, one palette, generous negative space — printed-board energy.

import { For } from "solid-js";
import { palette } from "../palette";
import type { ResourceType } from "../game/model";

// Deterministic per-tile randomness so each forest looks like itself forever.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0 || 1;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Scatter helper: picks points inside the hex's safe inner zone (r < 0.6).
function scatter(seed: string, n: number, radius: number) {
  const next = rng(seed);
  return Array.from({ length: n }, () => {
    const a = next() * Math.PI * 2;
    const d = 0.08 + next() * radius;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 0.7 + next() * 0.6, r: next() };
  });
}

const T = palette.terrain;

function Pine(p: { x: number; y: number; s: number }) {
  const s = p.s * 0.28;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <rect x={-0.015 * p.s} y={s * 0.35} width={0.03 * p.s} height={s * 0.3} fill={T.woodDark} />
      <path d={`M0 ${-s} L${s * 0.75} ${s * 0.45} L${-s * 0.75} ${s * 0.45} Z`} fill={T.woodDark} />
      <path
        d={`M0 ${-s * 1.25} L${s * 0.58} ${-s * 0.1} L${-s * 0.58} ${-s * 0.1} Z`}
        fill="oklch(0.46 0.09 158)"
      />
    </g>
  );
}

function Sheep(p: { x: number; y: number; s: number; flip: boolean }) {
  const s = p.s * 0.22;
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${p.flip ? -1 : 1} 1)`}>
      <ellipse rx={s} ry={s * 0.68} fill="oklch(0.96 0.015 90)" />
      <circle cx={-s * 0.55} cy={-s * 0.4} r={s * 0.5} fill="oklch(0.96 0.015 90)" />
      <circle cx={s * 0.85} cy={-s * 0.15} r={s * 0.3} fill="oklch(0.35 0.02 60)" />
      <rect
        x={-s * 0.5}
        y={s * 0.5}
        width={s * 0.16}
        height={s * 0.35}
        fill="oklch(0.35 0.02 60)"
      />
      <rect
        x={s * 0.35}
        y={s * 0.5}
        width={s * 0.16}
        height={s * 0.35}
        fill="oklch(0.35 0.02 60)"
      />
    </g>
  );
}

function WheatStalk(p: { x: number; y: number; s: number; lean: number }) {
  const s = p.s * 0.3;
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.lean})`}>
      <line x1="0" y1="0" x2="0" y2={-s} stroke={T.wheatDark} stroke-width="0.018" />
      <ellipse cx="0" cy={-s * 1.05} rx={s * 0.16} ry={s * 0.42} fill={T.wheatDark} />
      <ellipse cx={-s * 0.14} cy={-s * 0.7} rx={s * 0.11} ry={s * 0.28} fill={T.wheatDark} />
      <ellipse cx={s * 0.14} cy={-s * 0.7} rx={s * 0.11} ry={s * 0.28} fill={T.wheatDark} />
    </g>
  );
}

function Crag(p: { x: number; y: number; s: number }) {
  const s = p.s * 0.34;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <path d={`M${-s} ${s * 0.6} L${-s * 0.15} ${-s * 0.7} L${s} ${s * 0.6} Z`} fill={T.oreDark} />
      <path
        d={`M${-s * 0.28} ${-s * 0.44} L${-s * 0.15} ${-s * 0.7} L${s * 0.12} ${-s * 0.36} L${-s * 0.02} ${-s * 0.2} Z`}
        fill="oklch(0.93 0.015 90)"
      />
      <circle cx={s * 0.55} cy={s * 0.45} r={s * 0.09} fill="oklch(0.55 0.02 250)" />
    </g>
  );
}

function BrickMound(p: { x: number; y: number; s: number }) {
  const s = p.s * 0.3;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <path
        d={`M${-s} ${s * 0.4} Q${-s} ${-s * 0.5} 0 ${-s * 0.55} Q${s} ${-s * 0.5} ${s} ${s * 0.4} Z`}
        fill={T.brickDark}
      />
      <line
        x1={-s * 0.55}
        y1={s * 0.05}
        x2={s * 0.55}
        y2={s * 0.05}
        stroke={T.brick}
        stroke-width="0.02"
      />
    </g>
  );
}

/** Terrain interior art, drawn in hex-local coordinates around (0,0). */
export function TileArt(props: { type: string; seed: string }) {
  return (
    <>
      {props.type === "wood" && (
        <For each={scatter(`${props.seed}-w`, 6, 0.5)}>
          {(p) => <Pine x={p.x} y={p.y} s={p.s} />}
        </For>
      )}
      {props.type === "sheep" && (
        <>
          <For each={scatter(`${props.seed}-g`, 6, 0.5)}>
            {(p) => (
              <path
                d={`M${p.x - 0.04} ${p.y} Q${p.x} ${p.y - 0.09 * p.s} ${p.x + 0.04} ${p.y}`}
                stroke={T.sheepDark}
                stroke-width="0.02"
                fill="none"
                stroke-linecap="round"
              />
            )}
          </For>
          <For each={scatter(`${props.seed}-s`, 3, 0.4)}>
            {(p) => <Sheep x={p.x} y={p.y} s={p.s} flip={p.r > 0.5} />}
          </For>
        </>
      )}
      {props.type === "wheat" && (
        <For each={scatter(`${props.seed}-wh`, 8, 0.52)}>
          {(p) => <WheatStalk x={p.x} y={p.y} s={p.s} lean={p.r * 24 - 12} />}
        </For>
      )}
      {props.type === "brick" && (
        <For each={scatter(`${props.seed}-b`, 3, 0.34)}>
          {(p) => <BrickMound x={p.x} y={p.y} s={p.s} />}
        </For>
      )}
      {props.type === "ore" && (
        <For each={scatter(`${props.seed}-o`, 3, 0.36)}>
          {(p) => <Crag x={p.x} y={p.y} s={p.s} />}
        </For>
      )}
      {props.type === "desert" && (
        <>
          <path
            d="M-0.55 0.28 Q-0.15 0.02 0.5 0.3"
            stroke={T.desertDark}
            stroke-width="0.035"
            fill="none"
            stroke-linecap="round"
            opacity="0.55"
          />
          <path
            d="M-0.4 0.52 Q0 0.34 0.45 0.5"
            stroke={T.desertDark}
            stroke-width="0.03"
            fill="none"
            stroke-linecap="round"
            opacity="0.4"
          />
          <g transform="translate(0.32 -0.3)">
            <rect x="-0.025" y="-0.14" width="0.05" height="0.26" rx="0.025" fill={T.sheepDark} />
            <rect x="-0.12" y="-0.08" width="0.05" height="0.14" rx="0.025" fill={T.sheepDark} />
            <rect x="0.07" y="-0.1" width="0.05" height="0.16" rx="0.025" fill={T.sheepDark} />
          </g>
        </>
      )}
    </>
  );
}

export const TERRAIN_BASE: Record<string, string> = {
  wood: T.wood,
  brick: T.brick,
  sheep: T.sheep,
  wheat: T.wheat,
  ore: T.ore,
  desert: T.desert,
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

/** Port badge on the coast: paper chip, anchor mark, ratio. */
export function PortBadge(p: { x: number; y: number; ratio: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <rect
        x="-0.3"
        y="-0.16"
        width="0.6"
        height="0.32"
        rx="0.1"
        fill={palette.paper}
        stroke={palette.shore}
        stroke-width="0.03"
      />
      <path
        d="M-0.17 -0.06 a0.055 0.055 0 1 1 0.0 -0.001 M-0.17 -0.06 v0.14 m0 -0.2 l0.03 0.05 m-0.06 -0.05 l-0.03 0.05 m-0.07 0.08 a0.09 0.09 0 0 0 0.14 0"
        stroke={palette.inkSoft}
        stroke-width="0.025"
        fill="none"
        stroke-linecap="round"
      />
      <text
        x="0.09"
        y="0.01"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="0.15"
        font-weight="800"
        fill={palette.ink}
      >
        {p.ratio}:1
      </text>
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

/* ---------------- resource icons (drawn in a 24x24 viewBox) ---------------- */

export function ResourceIcon(p: { type: ResourceType; size?: number }) {
  const s = p.size ?? 18;
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      aria-hidden="true"
      style="display:inline-block; vertical-align:-0.2em"
    >
      {p.type === "wood" && (
        <g>
          <rect x="3" y="9" width="14" height="7" rx="3.5" fill="oklch(0.5 0.11 60)" />
          <circle cx="17" cy="12.5" r="3.5" fill="oklch(0.72 0.09 70)" />
          <circle
            cx="17"
            cy="12.5"
            r="1.8"
            fill="none"
            stroke="oklch(0.5 0.11 60)"
            stroke-width="1"
          />
          <rect x="6" y="5" width="11" height="6" rx="3" fill="oklch(0.42 0.1 55)" />
          <circle cx="17" cy="8" r="3" fill="oklch(0.66 0.09 68)" />
        </g>
      )}
      {p.type === "brick" && (
        <g>
          <rect x="3" y="6" width="18" height="5" rx="1.2" fill="oklch(0.58 0.16 40)" />
          <rect
            x="6"
            y="12.5"
            width="18"
            height="5"
            rx="1.2"
            fill="oklch(0.52 0.15 38)"
            transform="translate(-3 0)"
          />
          <line x1="12" y1="6" x2="12" y2="11" stroke="oklch(0.4 0.12 38)" stroke-width="1.2" />
          <line x1="9" y1="12.5" x2="9" y2="17.5" stroke="oklch(0.4 0.12 38)" stroke-width="1.2" />
          <line
            x1="15"
            y1="12.5"
            x2="15"
            y2="17.5"
            stroke="oklch(0.4 0.12 38)"
            stroke-width="1.2"
          />
        </g>
      )}
      {p.type === "sheep" && (
        <g>
          <ellipse cx="11" cy="13" rx="7.5" ry="5.5" fill="oklch(0.9 0.02 95)" />
          <circle cx="7" cy="9.5" r="3.6" fill="oklch(0.9 0.02 95)" />
          <circle cx="12" cy="8" r="3.2" fill="oklch(0.9 0.02 95)" />
          <circle cx="18" cy="12" r="2.8" fill="oklch(0.35 0.02 60)" />
        </g>
      )}
      {p.type === "wheat" && (
        <g
          stroke="oklch(0.72 0.14 85)"
          stroke-width="1.6"
          stroke-linecap="round"
          fill="oklch(0.8 0.14 90)"
        >
          <line x1="12" y1="21" x2="12" y2="8" />
          <ellipse cx="12" cy="5.5" rx="2" ry="3.4" stroke="none" />
          <ellipse
            cx="8.4"
            cy="9.5"
            rx="1.7"
            ry="2.8"
            stroke="none"
            transform="rotate(-22 8.4 9.5)"
          />
          <ellipse
            cx="15.6"
            cy="9.5"
            rx="1.7"
            ry="2.8"
            stroke="none"
            transform="rotate(22 15.6 9.5)"
          />
          <ellipse
            cx="9.2"
            cy="14"
            rx="1.6"
            ry="2.6"
            stroke="none"
            transform="rotate(-28 9.2 14)"
          />
          <ellipse
            cx="14.8"
            cy="14"
            rx="1.6"
            ry="2.6"
            stroke="none"
            transform="rotate(28 14.8 14)"
          />
        </g>
      )}
      {p.type === "ore" && (
        <g>
          <path d="M5 15 L8 8 L14 5 L20 10 L18 17 L10 19 Z" fill="oklch(0.5 0.03 255)" />
          <path d="M8 8 L14 5 L20 10 L13 12 Z" fill="oklch(0.62 0.035 250)" />
          <path d="M10 14 l2.5 -1.5 l1.5 2.5 l-2.5 1.5 Z" fill="oklch(0.75 0.1 210)" />
        </g>
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
