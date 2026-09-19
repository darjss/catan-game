import type { Game, GameState, PlayerState, ResourceType, Tile } from "catan-game-engine";
import { RESOURCE_TYPES, pips } from "./model";

/** One concrete, fully-parameterized legal move — the unit bots choose between. */
export interface Move {
  id: string;
  label: string;
  apply: (g: Game) => void;
}

function tileText(t: Tile): string {
  return t.type === "desert" ? "desert" : `${t.type} ${t.numberToken}`;
}

function vertexLabel(state: GameState, vid: string): string {
  const v = state.board.vertices.get(vid);
  if (!v) return vid;
  const tiles = v.adjacentTiles
    .map((id) => state.board.tiles.get(id))
    .filter((t): t is Tile => !!t && t.type !== "desert")
    .map((t) => `${t.type} ${t.numberToken} (${pips(t.numberToken)} pips)`);
  const port = v.port
    ? `, on a ${v.port.ratio}:1 ${v.port.type === "generic" ? "any-resource" : v.port.type} port`
    : "";
  return tiles.length ? `touches ${tiles.join(", ")}${port}` : `coastal spot${port}`;
}

function bestRatio(state: GameState, player: PlayerState, res: ResourceType): number {
  let ratio = 4;
  for (const vid of [...player.settlements, ...player.cities]) {
    const port = state.board.vertices.get(vid)?.port;
    if (port && (port.type === "generic" || port.type === res)) {
      ratio = Math.min(ratio, port.ratio);
    }
  }
  return ratio;
}

function handSize(p: PlayerState): number {
  return RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0);
}

/** Opponent with the biggest hand touching `tileId` — the juiciest steal. */
function bestRobTarget(state: GameState, tileId: string, meId: string): string | undefined {
  let best: PlayerState | undefined;
  for (const v of state.board.vertices.values()) {
    if (!v.adjacentTiles.includes(tileId) || !v.structure) continue;
    const owner = state.players.find((p) => p.id === v.structure!.playerId);
    if (
      owner &&
      owner.id !== meId &&
      handSize(owner) > 0 &&
      (!best || handSize(owner) > handSize(best))
    ) {
      best = owner;
    }
  }
  return best?.id;
}

function robberMoves(state: GameState, me: PlayerState, kind: "moveRobber" | "playKnight"): Move[] {
  const moves: Move[] = [];
  for (const t of state.board.tiles.values()) {
    if (t.hasRobber) continue;
    const target = bestRobTarget(state, t.id, me.id);
    const targetName = target ? state.players.find((p) => p.id === target)?.name : undefined;
    const what = kind === "playKnight" ? "Play knight: move robber" : "Move robber";
    moves.push({
      id: `${kind}:${t.id}:${target ?? ""}`,
      label: `${what} to ${tileText(t)}${targetName ? `, steal from ${targetName}` : ""}`,
      apply:
        kind === "playKnight"
          ? (g) => g.playKnight(t.id, target)
          : (g) => g.moveRobber(t.id, target),
    });
  }
  return moves;
}

export function legalMoves(game: Game): Move[] {
  const state = game.getState();
  const me = game.getCurrentPlayer();
  const moves: Move[] = [];
  const can = (action: string, ...args: unknown[]) => game.canPerformAction(action, ...args).valid;

  if (state.turn.phase === "setup") {
    if (state.turn.setupPhase?.includes("Settlement")) {
      for (const v of state.board.vertices.values()) {
        if (can("placeSettlement", v.id)) {
          moves.push({
            id: `settle:${v.id}`,
            label: `Place settlement — ${vertexLabel(state, v.id)}`,
            apply: (g) => g.placeSettlement(v.id),
          });
        }
      }
    } else {
      for (const e of state.board.edges.values()) {
        if (can("placeRoad", e.id)) {
          moves.push({
            id: `road:${e.id}`,
            label: "Place road from your new settlement",
            apply: (g) => g.placeRoad(e.id),
          });
        }
      }
    }
    return moves;
  }

  if (state.turn.phase === "robberPlacement") {
    return robberMoves(state, me, "moveRobber");
  }

  if (state.turn.phase !== "main") return moves;

  if (!state.turn.hasRolled) {
    return [{ id: "roll", label: "Roll the dice", apply: (g) => g.rollDice() }];
  }

  for (const v of state.board.vertices.values()) {
    if (can("placeCity", v.id)) {
      moves.push({
        id: `city:${v.id}`,
        label: `Upgrade settlement to city — ${vertexLabel(state, v.id)}`,
        apply: (g) => g.placeCity(v.id),
      });
    } else if (can("placeSettlement", v.id)) {
      moves.push({
        id: `settle:${v.id}`,
        label: `Build settlement — ${vertexLabel(state, v.id)}`,
        apply: (g) => g.placeSettlement(v.id),
      });
    }
  }
  for (const e of state.board.edges.values()) {
    if (can("placeRoad", e.id)) {
      moves.push({
        id: `road:${e.id}`,
        label: "Build road",
        apply: (g) => g.placeRoad(e.id),
      });
    }
  }
  if (can("buyDevCard")) {
    moves.push({ id: "buyDev", label: "Buy a development card", apply: (g) => g.buyDevCard() });
  }

  // Development card plays (one per turn, engine-enforced).
  if (me.devCardsPlayedThisTurn === 0) {
    const hand = new Set(me.devCards.filter((c) => !c.playedThisTurn).map((c) => c.type));
    if (hand.has("knight")) {
      for (const m of robberMoves(state, me, "playKnight")) {
        if (can("playKnight", m.id.split(":")[1], m.id.split(":")[2] || undefined)) {
          moves.push(m);
        }
      }
    }
    if (hand.has("yearOfPlenty")) {
      for (const a of RESOURCE_TYPES) {
        for (const b of RESOURCE_TYPES) {
          if (a === b) continue;
          moves.push({
            id: `yop:${a}:${b}`,
            label: `Play Year of Plenty: take 1 ${a} and 1 ${b}`,
            apply: (g) => g.playYearOfPlenty(a, b),
          });
        }
      }
    }
    if (hand.has("monopoly")) {
      for (const r of RESOURCE_TYPES) {
        moves.push({
          id: `mono:${r}`,
          label: `Play Monopoly: take everyone's ${r}`,
          apply: (g) => g.playMonopoly(r),
        });
      }
    }
    if (hand.has("roadBuilding")) {
      const free = [...state.board.edges.values()].filter(
        (e) => !e.road && e.adjacentEdges.some((id) => me.roads.includes(id)),
      );
      for (let i = 0; i < free.length && i < 6; i++) {
        const second = free.find((e) => e.id !== free[i].id);
        moves.push({
          id: `rb:${free[i].id}`,
          label: "Play Road Building: place two free roads",
          apply: (g) => g.playRoadBuilding(free[i].id, second?.id),
        });
      }
    }
  }

  for (const give of RESOURCE_TYPES) {
    const ratio = bestRatio(state, me, give);
    if ((me.resources[give] ?? 0) < ratio) continue;
    for (const get of RESOURCE_TYPES) {
      if (get === give) continue;
      moves.push({
        id: `trade:${give}:${get}`,
        label: `Trade ${ratio} ${give} for 1 ${get}`,
        apply: (g) => g.tradeWithBank({ [give]: ratio } as never, { [get]: 1 } as never),
      });
    }
  }

  moves.push({ id: "end", label: "End turn", apply: (g) => g.endTurn() });
  if (moves.length <= 240) return moves;
  const end = moves.pop()!;
  return [...moves.slice(0, 239), end];
}
