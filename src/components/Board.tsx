import { For, Show } from "solid-js";
import type { LegalTargets } from "../game/controller";
import {
  edgeVertices,
  hexCenter,
  hexPoints,
  legacyVertexPos,
  pips,
  TILE_COLOR,
  vertexPos,
  type Snapshot,
} from "../game/model";

const PLAYER_COLOR: Record<string, string> = {
  player_0: "#4361ee",
  player_1: "#e63946",
  player_2: "#f4a261",
};

export default function Board(props: {
  snap: Snapshot;
  legal: LegalTargets;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onTile: (id: string) => void;
}) {
  const colorOf = (id: string) => PLAYER_COLOR[id] ?? "#333";

  return (
    <svg viewBox="-6.6 -4.6 13.2 9.2" class="board" role="img" aria-label="Catan board">
      {/* tiles */}
      <For each={props.snap.tiles}>
        {(t) => {
          const c = () => hexCenter(t);
          return (
            <g>
              <polygon
                points={hexPoints(c())}
                fill={TILE_COLOR[t.type] ?? "#ccc"}
                stroke="#f8f4e8"
                stroke-width="0.07"
              />
              <Show when={props.legal.tiles.has(t.id)}>
                <polygon
                  points={hexPoints(c())}
                  fill="rgba(255,80,80,0.25)"
                  class="legal-tile"
                  role="button"
                  tabindex="0"
                  aria-label={`Move robber to ${t.type}`}
                  onClick={() => props.onTile(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && props.onTile(t.id)}
                />
              </Show>
              <Show when={t.numberToken != null}>
                <circle
                  cx={c().x}
                  cy={c().y}
                  r="0.34"
                  fill="#fdf6e3"
                  stroke="#999"
                  stroke-width="0.02"
                />
                <text
                  x={c().x}
                  y={c().y + 0.02}
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="0.32"
                  font-weight="700"
                  fill={t.numberToken === 6 || t.numberToken === 8 ? "#c1121f" : "#333"}
                >
                  {t.numberToken}
                </text>
                <text x={c().x} y={c().y + 0.22} text-anchor="middle" font-size="0.11" fill="#888">
                  {"•".repeat(pips(t.numberToken))}
                </text>
              </Show>
              <Show when={t.type === "desert" || t.hasRobber}>
                <Show when={t.hasRobber}>
                  <circle cx={c().x} cy={c().y} r="0.3" fill="#222" />
                  <text
                    x={c().x}
                    y={c().y}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    font-size="0.3"
                  >
                    🥷
                  </text>
                </Show>
              </Show>
            </g>
          );
        }}
      </For>

      {/* ports — tiny labels near their vertex pair */}
      <For each={props.snap.ports}>
        {(p) => {
          const pos = () => {
            const [a, b] = p.vertices.map(legacyVertexPos);
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          };
          return (
            <text
              x={pos().x}
              y={pos().y}
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="0.3"
              class="port-label"
            >
              ⚓{p.ratio}:1
            </text>
          );
        }}
      </For>

      {/* edges / roads */}
      <For each={props.snap.edges}>
        {(e) => {
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
                stroke={e.road ? colorOf(e.road.playerId) : "#cbbf9f"}
                stroke-width={e.road ? 0.16 : 0.07}
                stroke-linecap="round"
              />
              <Show when={props.legal.edges.has(e.id)}>
                <circle
                  cx={midX}
                  cy={midY}
                  r="0.24"
                  fill="rgba(67,97,238,0.35)"
                  class="legal-target"
                  role="button"
                  tabindex="0"
                  aria-label={`Build road ${e.id}`}
                  onClick={() => props.onEdge(e.id)}
                  onKeyDown={(ev) => ev.key === "Enter" && props.onEdge(e.id)}
                />
              </Show>
            </g>
          );
        }}
      </For>

      {/* vertices / structures */}
      <For each={props.snap.vertices}>
        {(v) => {
          const p = vertexPos(v.id);
          const owner = () => v.structure && colorOf(v.structure.playerId);
          return (
            <g>
              <Show when={props.legal.vertices.has(v.id)}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="0.26"
                  fill="rgba(67,97,238,0.45)"
                  class="legal-target"
                  role="button"
                  tabindex="0"
                  aria-label={`Build at ${v.id}`}
                  onClick={() => props.onVertex(v.id)}
                  onKeyDown={(e) => e.key === "Enter" && props.onVertex(v.id)}
                />
              </Show>
              <Show when={v.structure?.type === "settlement"}>
                <path
                  d={`M ${p.x - 0.22} ${p.y + 0.18} L ${p.x - 0.22} ${p.y} L ${p.x} ${p.y - 0.24} L ${p.x + 0.22} ${p.y} L ${p.x + 0.22} ${p.y + 0.18} Z`}
                  fill={owner() ?? "#333"}
                  stroke="#fff"
                  stroke-width="0.04"
                />
              </Show>
              <Show when={v.structure?.type === "city"}>
                <path
                  d={`M ${p.x - 0.3} ${p.y + 0.2} L ${p.x - 0.3} ${p.y - 0.05} L ${p.x - 0.08} ${p.y - 0.05} L ${p.x - 0.08} ${p.y - 0.28} L ${p.x + 0.12} ${p.y - 0.05} L ${p.x + 0.3} ${p.y - 0.05} L ${p.x + 0.3} ${p.y + 0.2} Z`}
                  fill={owner() ?? "#333"}
                  stroke="#fff"
                  stroke-width="0.04"
                />
              </Show>
              <Show when={!v.structure && !props.legal.vertices.has(v.id)}>
                <circle cx={p.x} cy={p.y} r="0.05" fill="#a08b6d" />
              </Show>
            </g>
          );
        }}
      </For>
    </svg>
  );
}
