import type {
  Edge,
  GameState,
  PlayerState,
  Port,
  ResourceType,
  Tile,
  Vertex,
} from "catan-game-engine";

export type { Edge, PlayerState, Port, ResourceType, Tile, Vertex };
export type TurnState = GameState["turn"];

export const RESOURCE_TYPES: ResourceType[] = ["wood", "brick", "sheep", "wheat", "ore"];

export const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "🪨",
};

export const TILE_COLOR: Record<string, string> = {
  wood: "#2d6a4f",
  brick: "#b23a2e",
  sheep: "#95d5b2",
  wheat: "#e9c46a",
  ore: "#6c757d",
  desert: "#e7d8b7",
};

/** Serializable view of GameState — the engine's Board uses Maps. */
export interface Snapshot {
  tiles: Tile[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
  players: PlayerState[];
  turn: TurnState;
  winner: string | null;
  longestRoadPlayer: string | null;
  largestArmyPlayer: string | null;
  devCardDeckCount: number;
}

export function takeSnapshot(state: GameState): Snapshot {
  // The engine mutates tile/vertex/edge objects in place across state clones,
  // so fresh identities are required here — keyed <For> diffs on item identity
  // and would never re-render a vertex whose structure was just set.
  return {
    tiles: [...state.board.tiles.values()].map((t) => ({ ...t })),
    vertices: [...state.board.vertices.values()].map((v) => ({ ...v })),
    edges: [...state.board.edges.values()].map((e) => ({ ...e })),
    ports: state.board.ports,
    players: state.players,
    turn: { ...state.turn, mustDiscardPlayers: [...state.turn.mustDiscardPlayers] },
    winner: state.winner,
    longestRoadPlayer: state.longestRoadPlayer,
    largestArmyPlayer: state.largestArmyPlayer,
    devCardDeckCount: state.devCardDeck.length,
  };
}

// Geometry — the engine bakes pixel-ish coordinates into ids: `v_<x>_<y>` in
// 1/1000 units on a pointy-top axial layout; edge ids embed both vertex ids.
export function vertexPos(id: string): { x: number; y: number } {
  const m = /^v_(-?\d+)_(-?\d+)$/.exec(id);
  if (!m) throw new Error(`bad vertex id ${id}`);
  return { x: Number(m[1]) / 1000, y: Number(m[2]) / 1000 };
}

/** Port vertex ids are legacy `<q>_<r>_v<dir>` — resolve to a position directly. */
export function legacyVertexPos(id: string): { x: number; y: number } {
  const m = /^(-?\d+)_(-?\d+)_v(\d+)$/.exec(id);
  if (!m) return vertexPos(id);
  const q = Number(m[1]);
  const r = Number(m[2]);
  const [dx, dy] = HEX_OFFSETS[Number(m[3])];
  return { x: Math.sqrt(3) * (q + r / 2) + dx, y: 1.5 * r + dy };
}

export function edgeVertices(id: string): [string, string] {
  const m = id.match(/v_-?\d+_-?\d+/g);
  if (!m || m.length !== 2) throw new Error(`bad edge id ${id}`);
  return [m[0], m[1]];
}

/** Hex center for a tile, matching the engine's axial layout (radius 1). */
export function hexCenter(tile: Tile): { x: number; y: number } {
  const { q, r } = tile.coordinate;
  return { x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r };
}

const SQRT3_2 = Math.sqrt(3) / 2;
const HEX_OFFSETS = [
  [0, -1],
  [SQRT3_2, -0.5],
  [SQRT3_2, 0.5],
  [0, 1],
  [-SQRT3_2, 0.5],
  [-SQRT3_2, -0.5],
];

export function hexPoints(center: { x: number; y: number }): string {
  return HEX_OFFSETS.map(([dx, dy]) => `${center.x + dx},${center.y + dy}`).join(" ");
}

export function pips(n: number | null): number {
  return n == null || n === 7 ? 0 : 6 - Math.abs(7 - n);
}
