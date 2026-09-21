import type { Game, PlayerState, ResourceType } from "catan-game-engine";
import type { JSONValue } from "ai";
import { chooseBotMove } from "../server/bot-ai";
import { RESOURCE_TYPES, pips } from "./model";
import { legalMoves, vertexFacts, type Move } from "./moves";

function handSize(p: PlayerState): number {
  return RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0);
}

/** Per-resource pip yield across a player's settlements (cities count double). */
function production(game: Game, p: PlayerState) {
  const s = game.getState();
  const per: Record<string, number> = {};
  const numbers = new Set<number>();
  for (const vid of p.settlements) {
    for (const f of vertexFacts(s, vid).produces) {
      per[f.resource] = (per[f.resource] ?? 0) + f.pips;
      numbers.add(f.number);
    }
  }
  for (const vid of p.cities) {
    for (const f of vertexFacts(s, vid).produces) {
      per[f.resource] = (per[f.resource] ?? 0) + f.pips * 2;
      numbers.add(f.number);
    }
  }
  return { perResourcePips: per, diceNumbers: [...numbers] };
}

/** Total pips per resource on the board — what is scarce vs abundant. */
function boardScarcity(game: Game) {
  const s = game.getState();
  const per: Record<string, number> = {};
  for (const t of s.board.tiles.values()) {
    if (t.type === "desert") continue;
    per[t.type] = (per[t.type] ?? 0) + pips(t.numberToken);
  }
  return per;
}

/** Compact JSON game summary — Jev's `state` input. */
function summarize(game: Game, me: PlayerState): Record<string, JSONValue> {
  const s = game.getState();
  const robber = [...s.board.tiles.values()].find((t) => t.hasRobber);
  const myProd = production(game, me);
  return {
    game: "Settlers of Catan, first to 10 victory points",
    phase:
      s.turn.phase === "setup"
        ? `setup (${s.turn.setupPhase})`
        : `${s.turn.phase}${s.turn.hasRolled ? ", dice rolled" : ""}`,
    you: {
      name: me.name,
      victoryPoints: me.victoryPoints,
      resources: me.resources,
      productionPipsPerResource: myProd.perResourcePips,
      diceNumbersYouProduceOn: myProd.diceNumbers,
      resourcesYouDoNotProduce: RESOURCE_TYPES.filter((r) => !myProd.perResourcePips[r]),
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
        productionPipsPerResource: production(game, p).perResourcePips,
        settlements: p.settlements.length,
        cities: p.cities.length,
        roads: p.roads.length,
      })),
    board: { totalPipsPerResourceOnBoard: boardScarcity(game) },
    turn: { round: s.turn.round, phase: s.turn.phase, rolled: s.turn.hasRolled },
    robberOn: robber ? `${robber.type} ${robber.numberToken ?? ""}` : null,
    deckLeft: s.devCardDeck.length,
  };
}

const PIP_NOTE =
  "Pips are dice probability: 6/8=5 pips, 5/9=4, 4/10=3, 3/11=2, 2/12=1. More pips = more production.";

const SETUP_INSTRUCTIONS = `You are placing pieces in Catan setup. ${PIP_NOTE}
For starting settlements: maximize totalPips first — a strong spot touches 2-3 producing hexes, ideally 10+ pips. Cover all five resources across your two settlements when possible; your second settlement should fill resources your first lacks, and it also draws those resources as your starting hand. Spread across different dice numbers so one roll can't starve you. Prefer wheat and ore (cities and dev cards) plus wood and brick (expansion); sheep is nice but piles up unused. A 2:1 or 3:1 port is a bonus on top of real production, never a substitute — a coastal spot touching one weak hex is a bad pick even with a port. Avoid desert edges.
For starting roads: the road is free, so pick the edge that leads toward the strongest still-open intersections (bestReachableSpot) — that is where your next settlement goes.`;

const MAIN_INSTRUCTIONS = `You are playing Catan. Pick the strongest move for the long run. ${PIP_NOTE}
Cities on high-pip wheat/ore spots and new settlements that open resources you lack are usually best. Build roads only when opensNewSettlementSpots points at land worth settling — a road to nowhere loses to buying a dev card. Trade only when buildsThisUnlocks names something you actually want this turn; giving 4 cards for 1 is a last resort, better rates (3:1, 2:1) are cheaper. When ahead on VP press the lead; when behind, the robber on the leader's best hex slows them. End turn only when nothing useful remains affordable.`;

function instructionsFor(game: Game): string {
  return game.getState().turn.phase === "setup" ? SETUP_INSTRUCTIONS : MAIN_INSTRUCTIONS;
}

/** Score for the local fallback — same evidence Jev sees, deterministic. */
function score(game: Game, m: Move): number {
  const s = game.getState();
  const me = game.getCurrentPlayer();
  const kind = m.id.split(":")[0];
  const id = m.id.split(":")[1];

  if (kind === "settle" || kind === "city") {
    const f = vertexFacts(s, id);
    const have = production(game, me).perResourcePips;
    const missing = f.resources.filter((r) => !have[r]).length;
    const portBonus = f.port ? (f.port.startsWith("2:1") ? 2 : 1) : 0;
    const base = f.totalPips + missing * 3 + portBonus;
    return kind === "city" ? base * 2 : base;
  }
  if (kind === "road") {
    const e = s.board.edges.get(id);
    if (!e) return 0;
    const anchor = s.turn.phase === "setup" ? me.settlements[me.settlements.length - 1] : "";
    const far = e.vertices.find((v) => v !== anchor) ?? e.vertices[1];
    const frontier = (s.turn.phase === "setup" ? [far] : e.vertices).flatMap((v) =>
      (s.board.vertices.get(v)?.adjacentVertices ?? []).filter(
        (n) =>
          n !== anchor &&
          !s.board.vertices.get(n)?.structure &&
          (s.board.vertices.get(n)?.adjacentVertices ?? []).every(
            (x) => !s.board.vertices.get(x)?.structure,
          ),
      ),
    );
    return Math.max(0, ...frontier.map((v) => vertexFacts(s, v).totalPips));
  }
  if (kind === "trade") {
    // Worthwhile only if it unlocks a build now.
    return (m.info as { buildsThisUnlocks?: string[] })?.buildsThisUnlocks?.length ? 4 : -1;
  }
  return { roll: 100, playKnight: 30, buyDev: 20, moveRobber: 10 }[kind] ?? 0;
}

/**
 * Apply one bot move: ask Jev over the full legal move list, fall back to a
 * scored heuristic, and keep trying options until one applies cleanly.
 */
/** Rejects as soon as the signal aborts — used to cut off the Jev wait. */
function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) =>
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
  );
}

export async function botStep(game: Game, bot: PlayerState, signal?: AbortSignal): Promise<void> {
  const moves = legalMoves(game);
  if (moves.length === 0) return;

  const ranked = [...moves].sort((a, b) => score(game, b) - score(game, a));
  let ordered = ranked;

  if (moves.length > 1) {
    try {
      const ask = chooseBotMove({
        state: summarize(game, bot),
        instructions: instructionsFor(game),
        options: Object.fromEntries(moves.map((m) => [m.id, m.info ?? m.label])),
      });
      const choice = signal ? await Promise.race([ask, aborted(signal)]) : await ask;
      const picked = moves.find((m) => m.id === choice);
      if (picked) {
        ordered = [picked, ...ranked.filter((m) => m !== picked)];
        console.info(`[bot-ai] jev picked: ${picked.label}`);
      }
    } catch (e) {
      if (signal?.aborted) return; // game was disposed — don't apply anything
      // gateway down / no key — heuristics carry on
      console.warn("[bot-ai] jev unavailable, using heuristic:", e);
    }
  }

  if (signal?.aborted) return;
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
