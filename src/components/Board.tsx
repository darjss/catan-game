import { For, Show } from "solid-js";
import type { LegalTargets } from "../game/controller";
import {
  edgeVertices,
  hexCenter,
  legacyVertexPos,
  pips,
  vertexPos,
  type Snapshot,
} from "../game/model";
import {
  City,
  PortBadge,
  Robber,
  Settlement,
  TERRAIN_BASE,
  TargetRing,
  TileArt,
} from "../assets/art";
import { palette } from "../palette";

const PLAYER_COLOR: Record<string, string> = palette.player;

function hexPointsR(center: { x: number; y: number }, r: number): string {
  const pts = [
    [0, -r],
    [r * 0.866, -r * 0.5],
    [r * 0.866, r * 0.5],
    [0, r],
    [-r * 0.866, r * 0.5],
    [-r * 0.866, -r * 0.5],
  ];
  return pts.map(([x, y]) => `${center.x + x},${center.y + y}`).join(" ");
}

export default function Board(props: {
  snap: Snapshot;
  legal: LegalTargets;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onTile: (id: string) => void;
}) {
  const colorOf = (id: string) => PLAYER_COLOR[id] ?? palette.ink;

  return (
    <svg
      viewBox="-5.5 -4.9 11 9.8"
      role="img"
      aria-label="Catan board"
      style="width:100%;height:auto"
    >
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={palette.water1} />
          <stop offset="1" stop-color={palette.water2} />
        </linearGradient>
        {/* lamplight pooling in the middle of the sea */}
        <radialGradient id="seaglow" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stop-color="oklch(1 0 0 / 0.10)" />
          <stop offset="1" stop-color="oklch(1 0 0 / 0)" />
        </radialGradient>
        {/* printed-tile top light */}
        <linearGradient id="tilelight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="oklch(1 0 0 / 0.14)" />
          <stop offset="0.5" stop-color="oklch(1 0 0 / 0.02)" />
          <stop offset="1" stop-color="oklch(0 0 0 / 0.07)" />
        </linearGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.22" />
        </filter>
        <clipPath id="hexclip">
          <polygon points={hexPointsR({ x: 0, y: 0 }, 1)} />
        </clipPath>
      </defs>

      {/* water */}
      <rect x="-5.5" y="-4.9" width="11" height="9.8" rx="0.4" fill="url(#sea)" />
      <rect x="-5.5" y="-4.9" width="11" height="9.8" rx="0.4" fill="url(#seaglow)" />

      {/* island shadow on the water */}
      <ellipse
        cx="0"
        cy="0.28"
        rx="4.15"
        ry="3.55"
        fill="oklch(0 0 0 / 0.18)"
        filter="url(#soft)"
      />

      {/* shores under every tile */}
      <For each={props.snap.tiles}>
        {(t) => (
          <polygon
            points={hexPointsR(hexCenter(t), 1.1)}
            fill={palette.shore}
            stroke="oklch(0.8 0.06 85 / 0.6)"
            stroke-width="0.03"
          />
        )}
      </For>

      {/* tiles + clipped terrain art + top light */}
      <For each={props.snap.tiles}>
        {(t) => {
          const c = () => hexCenter(t);
          return (
            <g>
              <polygon
                points={hexPointsR(c(), 1)}
                fill={TERRAIN_BASE[t.type] ?? "#ccc"}
                stroke="oklch(0 0 0 / 0.12)"
                stroke-width="0.03"
              />
              <g transform={`translate(${c().x} ${c().y})`} clip-path="url(#hexclip)">
                <TileArt type={t.type} seed={t.id} />
              </g>
              <polygon points={hexPointsR(c(), 1)} fill="url(#tilelight)" />
              <Show when={props.legal.tiles.has(t.id)}>
                <polygon
                  points={hexPointsR(c(), 1)}
                  fill="oklch(1 0 0 / 0.22)"
                  style="cursor:pointer"
                  role="button"
                  tabindex="0"
                  aria-label={`Move robber to ${t.type}`}
                  onClick={() => props.onTile(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && props.onTile(t.id)}
                />
              </Show>
              <Show when={t.numberToken != null && !t.hasRobber}>
                <g transform={`translate(${c().x} ${c().y})`}>
                  <circle cy="0.05" r="0.37" fill="oklch(0 0 0 / 0.16)" />
                  <circle
                    r="0.36"
                    fill={palette.tokenDisc}
                    stroke={palette.tokenRing}
                    stroke-width="0.03"
                  />
                  <text
                    y="0.02"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    font-size="0.34"
                    font-weight="800"
                    fill={t.numberToken === 6 || t.numberToken === 8 ? palette.numRed : palette.ink}
                  >
                    {t.numberToken}
                  </text>
                  <For each={Array.from({ length: pips(t.numberToken) }, (_, i) => i)}>
                    {(i) => (
                      <circle
                        cx={(i - (pips(t.numberToken) - 1) / 2) * 0.11}
                        cy="0.24"
                        r="0.028"
                        fill={
                          t.numberToken === 6 || t.numberToken === 8
                            ? palette.numRed
                            : palette.inkSoft
                        }
                      />
                    )}
                  </For>
                </g>
              </Show>
              <Show when={t.hasRobber}>
                <g
                  class="robber-move"
                  style={`transform: translate(${c().x}px, ${c().y - 0.02}px)`}
                >
                  <Robber x={0} y={0} />
                </g>
              </Show>
            </g>
          );
        }}
      </For>

      {/* ports */}
      <For each={props.snap.ports}>
        {(p) => {
          const pos = () => {
            const [a, b] = p.vertices.map(legacyVertexPos);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const len = Math.hypot(mx, my) || 1;
            return { x: mx + (mx / len) * 0.42, y: my + (my / len) * 0.42 };
          };
          return <PortBadge x={pos().x} y={pos().y} ratio={p.ratio} />;
        }}
      </For>

      {/* roads — drawn on with a dash sweep */}
      <For each={props.snap.edges}>
        {(e) => {
          const [v1, v2] = edgeVertices(e.id);
          const a = vertexPos(v1);
          const b = vertexPos(v2);
          return (
            <Show when={e.road}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={colorOf(e.road!.playerId)}
                stroke-width="0.17"
                stroke-linecap="round"
                class="piece-in"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="oklch(1 0 0 / 0.28)"
                stroke-width="0.05"
                stroke-linecap="round"
              />
            </Show>
          );
        }}
      </For>

      {/* legal road spots */}
      <For each={props.snap.edges}>
        {(e) => {
          if (!props.legal.edges.has(e.id)) return null;
          const [v1, v2] = edgeVertices(e.id);
          const a = vertexPos(v1);
          const b = vertexPos(v2);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                stroke-width="0.4"
                style="cursor:pointer"
                role="button"
                tabindex="0"
                aria-label={`Build road ${e.id}`}
                onClick={() => props.onEdge(e.id)}
                onKeyDown={(ev) => ev.key === "Enter" && props.onEdge(e.id)}
              />
              <TargetRing x={midX} y={midY} r={0.13} />
            </g>
          );
        }}
      </For>

      {/* structures + legal settlement spots */}
      <For each={props.snap.vertices}>
        {(v) => {
          const p = vertexPos(v.id);
          return (
            <g>
              <Show when={v.structure?.type === "settlement"}>
                <g class="piece-in">
                  <Settlement x={p.x} y={p.y} color={colorOf(v.structure!.playerId)} />
                </g>
              </Show>
              <Show when={v.structure?.type === "city"}>
                <g class="piece-in">
                  <City x={p.x} y={p.y} color={colorOf(v.structure!.playerId)} />
                </g>
              </Show>
              <Show when={props.legal.vertices.has(v.id)}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="0.3"
                  fill="transparent"
                  style="cursor:pointer"
                  role="button"
                  tabindex="0"
                  aria-label={`Build at ${v.id}`}
                  onClick={() => props.onVertex(v.id)}
                  onKeyDown={(e) => e.key === "Enter" && props.onVertex(v.id)}
                />
                <TargetRing x={p.x} y={p.y} r={0.15} />
              </Show>
            </g>
          );
        }}
      </For>
    </svg>
  );
}
