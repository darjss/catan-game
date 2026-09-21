import type { Game, GameState, PlayerState, ResourceType, Tile } from "catan-game-engine";
import { GAME_CONSTANTS } from "catan-game-engine";
import type { JSONValue } from "ai";
import { RESOURCE_TYPES, pips } from "./model";

/** One concrete, fully-parameterized legal move — the unit bots choose between. */
export interface Move {
  id: string;
  label: string;
  /** Structured option detail sent to the evaluation model (bots only). */
  info?: { [key: string]: JSONValue };
  apply: (g: Game) => void;
}

/** What an intersection produces — shared by labels, Jev options, fallback. */
export interface VertexFacts {
  produces: { resource: ResourceType; number: number; pips: number }[];
  totalPips: number;
  resources: ResourceType[];
  numbers: number[];
  port: string | null;
}

export function vertexFacts(state: GameState, vid: string): VertexFacts {
  const v = state.board.vertices.get(vid);
  const produces = (v?.adjacentTiles ?? [])
    .map((id) => state.board.tiles.get(id))
    .filter((t): t is Tile => !!t)
    .flatMap((t) =>
      t.type === "desert"
        ? []
        : [
            {
              resource: t.type,
              number: t.numberToken ?? 0,
              pips: pips(t.numberToken),
            },
          ],
    );
  return {
    produces,
    totalPips: produces.reduce((n, p) => n + p.pips, 0),
    resources: [...new Set(produces.map((p) => p.resource))],
    numbers: produces.map((p) => p.number),
    port: v?.port ? `${v.port.ratio}:1 ${v.port.type === "generic" ? "any" : v.port.type}` : null,
  };
}

/** Open future settlement spots reachable through `vid` (distance rule). */
function openSpotsFrom(state: GameState, vid: string, exclude: string): VertexFacts[] {
  const v = state.board.vertices.get(vid);
  if (!v) return [];
  const open = v.adjacentVertices.filter((id) => {
    if (id === exclude) return false;
    const w = state.board.vertices.get(id);
    return (
      w && !w.structure && w.adjacentVertices.every((n) => !state.board.vertices.get(n)?.structure)
    );
  });
  return open.map((id) => vertexFacts(state, id)).sort((a, b) => b.totalPips - a.totalPips);
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

/** Resources a player's settlements/cities currently produce. */
function productionOf(state: GameState, p: PlayerState): Set<ResourceType> {
  const out = new Set<ResourceType>();
  for (const vid of [...p.settlements, ...p.cities]) {
    for (const f of vertexFacts(state, vid).resources) out.add(f);
  }
  return out;
}

/** Build kinds a hand can afford right now (pure cost arithmetic). */
function affordable(hand: Partial<Record<ResourceType, number>>): string[] {
  return (Object.keys(GAME_CONSTANTS.COSTS) as (keyof typeof GAME_CONSTANTS.COSTS)[]).filter((k) =>
    RESOURCE_TYPES.every((r) => (hand[r] ?? 0) >= (GAME_CONSTANTS.COSTS[k][r] ?? 0)),
  );
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
      const isSecond = state.turn.setupPhase === "secondSettlement";
      const have = productionOf(state, me);
      for (const v of state.board.vertices.values()) {
        if (can("placeSettlement", v.id)) {
          const f = vertexFacts(state, v.id);
          const frontier = openSpotsFrom(state, v.id, "");
          moves.push({
            id: `settle:${v.id}`,
            label: `Place settlement — ${vertexLabel(state, v.id)}`,
            info: {
              action: "place starting settlement",
              produces: f.produces,
              totalPips: f.totalPips,
              resources: f.resources,
              port: f.port,
              resourcesYouStillLack: f.resources.filter((r) => !have.has(r)),
              openNeighborIntersections: frontier.length,
              bestNeighborPips: frontier[0]?.totalPips ?? 0,
              ...(isSecond ? { startingHandYouWouldDraw: f.resources } : {}),
            },
            apply: (g) => g.placeSettlement(v.id),
          });
        }
      }
    } else {
      // Setup roads must touch the settlement just placed; the useful
      // question is which frontier that edge opens up.
      const anchor = me.settlements[me.settlements.length - 1];
      for (const e of state.board.edges.values()) {
        if (can("placeRoad", e.id)) {
          const far = e.vertices.find((v) => v !== anchor) ?? e.vertices[1];
          const frontier = openSpotsFrom(state, far, anchor ?? "");
          const best = frontier[0];
          moves.push({
            id: `road:${e.id}`,
            label: `Place road toward ${
              best ? `open land (${best.resources.join("/")}, ${best.totalPips} pips)` : "the coast"
            }`,
            info: {
              action: "place starting road",
              leadsTowardOpenIntersections: frontier.length,
              bestReachableSpot: best
                ? {
                    produces: best.produces,
                    totalPips: best.totalPips,
                    resources: best.resources,
                    port: best.port,
                  }
                : null,
            },
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

  const have = productionOf(state, me);
  for (const v of state.board.vertices.values()) {
    const f = vertexFacts(state, v.id);
    if (can("placeCity", v.id)) {
      moves.push({
        id: `city:${v.id}`,
        label: `Upgrade settlement to city — ${vertexLabel(state, v.id)}`,
        info: {
          action: "upgrade to city (doubles production)",
          produces: f.produces,
          totalPipsNow: f.totalPips,
          totalPipsAfter: f.totalPips * 2,
        },
        apply: (g) => g.placeCity(v.id),
      });
    } else if (can("placeSettlement", v.id)) {
      const frontier = openSpotsFrom(state, v.id, "");
      moves.push({
        id: `settle:${v.id}`,
        label: `Build settlement — ${vertexLabel(state, v.id)}`,
        info: {
          action: "build settlement",
          produces: f.produces,
          totalPips: f.totalPips,
          resources: f.resources,
          port: f.port,
          resourcesYouStillLack: f.resources.filter((r) => !have.has(r)),
          openNeighborIntersections: frontier.length,
        },
        apply: (g) => g.placeSettlement(v.id),
      });
    }
  }
  for (const e of state.board.edges.values()) {
    if (can("placeRoad", e.id)) {
      const [a, b] = e.vertices;
      const frontier = [...openSpotsFrom(state, a, b), ...openSpotsFrom(state, b, a)];
      const best = frontier.sort((x, y) => y.totalPips - x.totalPips)[0];
      moves.push({
        id: `road:${e.id}`,
        label: `Build road toward ${
          best
            ? `open land (${best.resources.join("/")}, ${best.totalPips} pips)`
            : "occupied coast"
        }`,
        info: {
          action: "build road",
          opensNewSettlementSpots: frontier.length,
          bestReachableSpot: best
            ? {
                produces: best.produces,
                totalPips: best.totalPips,
                resources: best.resources,
                port: best.port,
              }
            : null,
        },
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

  const now = affordable(me.resources);
  for (const give of RESOURCE_TYPES) {
    const ratio = bestRatio(state, me, give);
    if ((me.resources[give] ?? 0) < ratio) continue;
    for (const get of RESOURCE_TYPES) {
      if (get === give) continue;
      const after = {
        ...me.resources,
        [give]: (me.resources[give] ?? 0) - ratio,
        [get]: (me.resources[get] ?? 0) + 1,
      };
      const unlocks = affordable(after).filter((k) => !now.includes(k));
      moves.push({
        id: `trade:${give}:${get}`,
        label: `Trade ${ratio} ${give} for 1 ${get}`,
        info: {
          action: "trade with bank",
          give: `${ratio} ${give}`,
          receive: `1 ${get}`,
          rate: `${ratio}:1`,
          handAfter: after,
          buildsThisUnlocks: unlocks,
        },
        apply: (g) => g.tradeWithBank({ [give]: ratio } as never, { [get]: 1 } as never),
      });
    }
  }

  moves.push({ id: "end", label: "End turn", apply: (g) => g.endTurn() });
  if (moves.length <= 240) return moves;
  const end = moves.pop()!;
  return [...moves.slice(0, 239), end];
}
