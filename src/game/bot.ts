import type { Game, PlayerState, ResourceType } from "catan-game-engine";
import type { JSONValue } from "ai";
import { chooseBotMove } from "../server/bot-ai";
import { RESOURCE_TYPES } from "./model";
import { legalMoves, type Move } from "./moves";

function handSize(p: PlayerState): number {
  return RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0);
}

/** Compact JSON game summary — Jev's `state` input. */
function summarize(game: Game, me: PlayerState): Record<string, JSONValue> {
  const s = game.getState();
  const robber = [...s.board.tiles.values()].find((t) => t.hasRobber);
  return {
    game: "Settlers of Catan, first to 10 victory points",
    you: {
      name: me.name,
      victoryPoints: me.victoryPoints,
      resources: me.resources,
      unplayedDevCards: me.devCards.filter((c) => !c.playedThisTurn).map((c) => c.type),
      settlements: me.settlements.length,
      cities: me.cities.length,
      roads: me.roads.length,
      hasLongestRoad: me.hasLongestRoad,
      hasLargestArmy: me.hasLargestArmy,
    },
    opponents: s.players
      .filter((p) => p.id !== me.id)
      .map((p) => ({
        name: p.name,
        victoryPoints: p.victoryPoints,
        handSize: handSize(p),
        unplayedDevCards: p.devCards.filter((c) => !c.playedThisTurn).length,
        settlements: p.settlements.length,
        cities: p.cities.length,
        roads: p.roads.length,
        hasLongestRoad: p.hasLongestRoad,
        hasLargestArmy: p.hasLargestArmy,
      })),
    turn: { round: s.turn.round, phase: s.turn.phase, rolled: s.turn.hasRolled },
    robberOn: robber ? `${robber.type} ${robber.numberToken ?? ""}` : null,
    deckLeft: s.devCardDeck.length,
  };
}

const INSTRUCTIONS = `You are playing Catan. Pick the strongest move for the long run:
early game favor settlements on scarce/high-pip resources and ports; mid game
balance expansion with cities and dev cards; when ahead on VP press the lead,
when behind block leaders with the robber. End turn only when nothing useful
remains affordable.`;

function rank(m: Move): number {
  if (m.id === "roll") return 0;
  if (m.id.startsWith("city:")) return 1;
  if (m.id.startsWith("settle:")) return 2;
  if (m.id.startsWith("playKnight:")) return 3;
  if (m.id === "buyDev") return 4;
  if (m.id.startsWith("road:")) return 5;
  if (m.id.startsWith("yop:") || m.id.startsWith("mono:") || m.id.startsWith("rb:")) return 6;
  if (m.id.startsWith("trade:")) return 7;
  if (m.id.startsWith("moveRobber:")) return 8;
  return 9; // end
}

/** Local fallback when Jev is unreachable or picks something invalid. */
function heuristic(moves: Move[]): Move[] {
  const best = Math.min(...moves.map(rank));
  return moves.filter((m) => rank(m) === best);
}

/**
 * Apply one bot move: ask Jev over the full legal move list, fall back to a
 * priority heuristic, and keep trying options until one applies cleanly.
 */
export async function botStep(game: Game, bot: PlayerState): Promise<void> {
  const moves = legalMoves(game);
  if (moves.length === 0) return;

  let ordered = heuristic(moves);
  try {
    const choice = await chooseBotMove({
      state: summarize(game, bot),
      instructions: INSTRUCTIONS,
      options: Object.fromEntries(moves.map((m) => [m.id, m.label])),
    });
    const picked = moves.find((m) => m.id === choice);
    if (picked) ordered = [picked, ...ordered.filter((m) => m !== picked)];
  } catch (e) {
    // gateway down / no key — heuristics carry on
    console.warn("[bot-ai] jev unavailable, using heuristic:", e);
  }

  for (const m of ordered.concat(moves)) {
    try {
      m.apply(game);
      return;
    } catch {
      // option disagreed with the engine — try the next one
    }
  }
}

/** Discard half a bot's hand (robber), shedding the biggest piles first. */
export function botDiscard(game: Game, playerId: string): void {
  const s = game.getState();
  const bot = s.players.find((p) => p.id === playerId);
  if (!bot) return;
  const total = handSize(bot);
  let toLose = Math.floor(total / 2);
  if (toLose <= 0) return;

  const discard: Partial<Record<ResourceType, number>> = {};
  const counts = RESOURCE_TYPES.map((r) => ({ r, n: bot.resources[r] ?? 0 })).sort(
    (a, b) => b.n - a.n,
  );
  let i = 0;
  while (toLose > 0) {
    const c = counts[i % counts.length];
    if (c.n - (discard[c.r] ?? 0) > 0) {
      discard[c.r] = (discard[c.r] ?? 0) + 1;
      toLose--;
    }
    i++;
    if (i > 1000) break;
  }
  game.discardResources(playerId, discard);
}
