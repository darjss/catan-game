import { createSignal } from "solid-js";
import {
  Game,
  generateBoard,
  type GameEvent,
  type PlayerState,
  type ResourceType,
} from "catan-game-engine";
import { botDiscard, botStep } from "./bot";
import { RESOURCE_TYPES, takeSnapshot, type Snapshot } from "./model";

export const HUMAN_ID = "player_0";
const BOT_NAMES = ["Ada", "Bruno", "Cleo"];
const BOT_IDS = new Set(["player_1", "player_2", "player_3"]);

export type PendingBuild =
  | "road"
  | "settlement"
  | "city"
  | "knight"
  | "roadBuilding1"
  | "roadBuilding2"
  | null;

let game: Game | null = null;
let rbFirstEdge: string | null = null;

const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null);
const [log, setLog] = createSignal<string[]>([]);
const [botThinking, setBotThinking] = createSignal<string | null>(null);
const [pendingBuild, setPendingBuild] = createSignal<PendingBuild>(null);
const [robberPick, setRobberPick] = createSignal<{ hexId: string; targets: PlayerState[] } | null>(
  null,
);
const [tradeOpen, setTradeOpen] = createSignal(false);
const [cardPick, setCardPick] = createSignal<"yearOfPlenty" | "monopoly" | null>(null);
const [lastError, setLastError] = createSignal<string | null>(null);

export {
  snapshot,
  log,
  botThinking,
  pendingBuild,
  setPendingBuild,
  robberPick,
  tradeOpen,
  setTradeOpen,
  cardPick,
  setCardPick,
  lastError,
  setLastError,
};

export function isBot(id: string): boolean {
  return BOT_IDS.has(id);
}

export function playerName(snap: Snapshot, id: string): string {
  return snap.players.find((p) => p.id === id)?.name ?? id;
}

function pushLog(line: string) {
  setLog((l) => [...l.slice(-120), line]);
}

function describeEvent(snap: Snapshot, ev: GameEvent): string | null {
  const name = (id: string) => playerName(snap, id);
  const res = (r?: Partial<Record<ResourceType, number>>) =>
    r
      ? Object.entries(r)
          .filter(([, n]) => n)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ")
      : "";
  switch (ev.type) {
    case "diceRolled":
      return `${name(ev.playerId)} rolled ${ev.total}${ev.total === 7 ? " — robber!" : ""}`;
    case "settlementBuilt":
      return `${name(ev.playerId)} built a settlement`;
    case "cityBuilt":
      return `${name(ev.playerId)} upgraded to a city`;
    case "roadBuilt":
      return `${name(ev.playerId)} built a road`;
    case "devCardBought":
      return `${name(ev.playerId)} bought a development card`;
    case "devCardPlayed":
      return `${name(ev.playerId)} played ${ev.cardType}`;
    case "resourcesGained":
      return ev.reason === "diceRoll" ? `${name(ev.playerId)} gained ${res(ev.resources)}` : null;
    case "resourcesDiscarded":
      return `${name(ev.playerId)} discarded ${res(ev.resources)}`;
    case "robberMoved":
      return `${name(ev.playerId)} moved the robber`;
    case "playerStole":
      return `${name(ev.stealerId)} stole from ${name(ev.victimId)}`;
    case "tradeWithBank":
      return `${name(ev.playerId)} traded ${res(ev.gave)} for ${res(ev.received)}`;
    case "longestRoadChanged":
      return ev.playerId ? `${name(ev.playerId)} took longest road` : null;
    case "largestArmyChanged":
      return ev.playerId ? `${name(ev.playerId)} took largest army` : null;
    case "gameEnded":
      return `${name(ev.winnerId)} wins!`;
    default:
      return null;
  }
}

function refresh() {
  if (!game) return;
  const snap = takeSnapshot(game.getState());
  setSnapshot(snap);
  for (const ev of game.getHistory().slice(seenEvents)) {
    const line = describeEvent(snap, ev);
    if (line) pushLog(line);
  }
  seenEvents = game.getHistory().length;
}

let seenEvents = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let driving = false;
async function driveBots() {
  if (driving || !game) return;
  driving = true;
  try {
    while (game && !game.isGameOver()) {
      const s = game.getState();

      if (s.turn.phase === "robberDiscard") {
        const discarder = s.turn.mustDiscardPlayers.find((id) => BOT_IDS.has(id));
        if (!discarder) break; // only humans left to discard
        botDiscard(game, discarder);
        refresh();
        await sleep(400);
        continue;
      }

      const current = s.players[s.turn.currentPlayerIndex];
      if (!BOT_IDS.has(current.id)) break;
      setBotThinking(current.name);
      await sleep(350);
      await botStep(game, current);
      refresh();
      await sleep(500);
    }
  } finally {
    driving = false;
    setBotThinking(null);
    refresh();
  }
}

/** Apply a human action; engine errors surface as a toast, not a crash. */
function act(fn: (g: Game) => void) {
  if (!game) return false;
  try {
    fn(game);
  } catch (e) {
    setLastError((e as Error).message);
    setTimeout(() => setLastError(null), 3500);
    return false;
  }
  refresh();
  void driveBots();
  return true;
}

// Axial neighbor deltas for the pointy-top layout the engine bakes into ids.
const HEX_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;
const RED_TOKENS = new Set([6, 8]);

/** True when no two red (6/8) number tokens share an edge on this board. */
function tokensAreSpread(seed: number): boolean {
  const board = generateBoard(seed);
  const byCoord = new Map(
    [...board.tiles.values()].map((t) => [`${t.coordinate.q},${t.coordinate.r}`, t]),
  );
  return [...board.tiles.values()].every(
    (t) =>
      !(t.numberToken != null && RED_TOKENS.has(t.numberToken)) ||
      HEX_DIRS.every(([dq, dr]) => {
        const n = byCoord.get(`${t.coordinate.q + dq},${t.coordinate.r + dr}`);
        return !(n?.numberToken != null && RED_TOKENS.has(n.numberToken));
      }),
  );
}

/**
 * Pick a seed whose engine-generated board has no adjacent 6/8 tokens. The
 * engine offers no balanced-generation option, so we try seeds until one
 * qualifies — capped so a pathological stream can't spin forever.
 */
function pickSeed(): number {
  let seed = Math.floor(Math.random() * 2 ** 31);
  for (let i = 0; i < 200; i++) {
    if (tokensAreSpread(seed)) return seed;
    seed = (seed + 7919) % 2 ** 31;
  }
  return seed;
}

export function newGame(yourName = "You") {
  game = new Game([yourName, ...BOT_NAMES], pickSeed());
  seenEvents = 0;
  setLog([]);
  setPendingBuild(null);
  setRobberPick(null);
  setTradeOpen(false);
  setCardPick(null);
  rbFirstEdge = null;
  refresh();
  pushLog("New game — place your first settlement");
  void driveBots();
}

// --- human inputs -----------------------------------------------------------

export function clickVertex(vertexId: string) {
  if (!game) return;
  const s = game.getState();
  const pb = pendingBuild();
  if (s.turn.phase === "setup" && s.turn.setupPhase?.includes("Settlement")) {
    act((g) => g.placeSettlement(vertexId));
    return;
  }
  if (s.turn.phase !== "main") return;
  if (pb === "settlement") {
    if (act((g) => g.placeSettlement(vertexId))) setPendingBuild(null);
  } else if (pb === "city") {
    if (act((g) => g.placeCity(vertexId))) setPendingBuild(null);
  }
}

export function clickEdge(edgeId: string) {
  if (!game) return;
  const s = game.getState();
  const pb = pendingBuild();
  if (s.turn.phase === "setup" && s.turn.setupPhase?.includes("Road")) {
    act((g) => g.placeRoad(edgeId));
    return;
  }
  if (s.turn.phase !== "main") return;
  if (pb === "road") {
    if (act((g) => g.placeRoad(edgeId))) setPendingBuild(null);
  } else if (pb === "roadBuilding1") {
    rbFirstEdge = edgeId;
    setPendingBuild("roadBuilding2");
  } else if (pb === "roadBuilding2") {
    const first = rbFirstEdge;
    rbFirstEdge = null;
    if (act((g) => g.playRoadBuilding(first!, edgeId))) setPendingBuild(null);
    else setPendingBuild("roadBuilding1");
  }
}

/** Hex click while moving the robber (after a 7, or a pending knight). */
export function clickTile(tileId: string) {
  if (!game) return;
  const s = game.getState();
  const knight = pendingBuild() === "knight";
  if (!(s.turn.phase === "robberPlacement" || knight)) return;
  const me = s.players[s.turn.currentPlayerIndex];
  if (!knight && me.id !== HUMAN_ID) return;

  const targets = s.players.filter(
    (p) =>
      p.id !== me.id &&
      handSize(p) > 0 &&
      [...p.settlements, ...p.cities].some((vid) =>
        s.board.vertices.get(vid)?.adjacentTiles.includes(tileId),
      ),
  );
  if (targets.length === 0) {
    applyRobber(tileId, undefined, knight);
  } else {
    setRobberPick({ hexId: tileId, targets });
  }
}

function applyRobber(hexId: string, targetId: string | undefined, knight: boolean) {
  if (act((g) => (knight ? g.playKnight(hexId, targetId) : g.moveRobber(hexId, targetId)))) {
    setPendingBuild(null);
  }
  setRobberPick(null);
}

export function pickRobberTarget(targetId: string | undefined) {
  const pick = robberPick();
  if (!pick) return;
  applyRobber(pick.hexId, targetId, pendingBuild() === "knight");
}

export function rollDice() {
  act((g) => g.rollDice());
}

export function endTurn() {
  setPendingBuild(null);
  act((g) => g.endTurn());
}

export function buyDevCard() {
  act((g) => g.buyDevCard());
}

export function trade(give: ResourceType, get: ResourceType, ratio: number) {
  if (act((g) => g.tradeWithBank({ [give]: ratio } as never, { [get]: 1 } as never))) {
    setTradeOpen(false);
  }
}

export function playCard(type: string) {
  if (type === "knight") setPendingBuild("knight");
  else if (type === "roadBuilding") setPendingBuild("roadBuilding1");
  else if (type === "yearOfPlenty") setCardPick("yearOfPlenty");
  else if (type === "monopoly") setCardPick("monopoly");
}

export function pickYearOfPlenty(a: ResourceType, b: ResourceType) {
  if (act((g) => g.playYearOfPlenty(a, b))) setCardPick(null);
}

export function pickMonopoly(r: ResourceType) {
  if (act((g) => g.playMonopoly(r))) setCardPick(null);
}

export function discard(resources: Partial<Record<ResourceType, number>>) {
  act((g) => g.discardResources(HUMAN_ID, resources));
}

function handSize(p: PlayerState): number {
  return RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0);
}

export interface LegalTargets {
  vertices: Set<string>;
  edges: Set<string>;
  tiles: Set<string>;
}

/**
 * Where the human may click right now — vertices for settlements/cities,
 * edges for roads, tiles for the robber. Call inside a tracking scope; it
 * re-derives when `snapshot`/`pendingBuild` change.
 */
export function computeLegalTargets(): LegalTargets {
  const out: LegalTargets = {
    vertices: new Set<string>(),
    edges: new Set<string>(),
    tiles: new Set<string>(),
  };
  if (!game) return out;
  const s = game.getState();
  const me = s.players[s.turn.currentPlayerIndex];
  if (me.id !== HUMAN_ID) return out;
  const pb = pendingBuild();
  const ok = (a: string, ...args: unknown[]) => game!.canPerformAction(a, ...args).valid;

  if (s.turn.phase === "setup") {
    if (s.turn.setupPhase?.includes("Settlement")) {
      for (const id of s.board.vertices.keys()) {
        if (ok("placeSettlement", id)) out.vertices.add(id);
      }
    } else {
      for (const id of s.board.edges.keys()) {
        if (ok("placeRoad", id)) out.edges.add(id);
      }
    }
    return out;
  }

  if (s.turn.phase === "robberPlacement" || pb === "knight") {
    for (const [id, t] of s.board.tiles) {
      if (!t.hasRobber) out.tiles.add(id);
    }
    return out;
  }

  if (s.turn.phase !== "main" || !s.turn.hasRolled) return out;
  if (pb === "settlement") {
    for (const id of s.board.vertices.keys()) {
      if (ok("placeSettlement", id)) out.vertices.add(id);
    }
  } else if (pb === "city") {
    for (const id of s.board.vertices.keys()) {
      if (ok("placeCity", id)) out.vertices.add(id);
    }
  } else if (pb === "road") {
    for (const id of s.board.edges.keys()) {
      if (ok("placeRoad", id)) out.edges.add(id);
    }
  } else if (pb === "roadBuilding1" || pb === "roadBuilding2") {
    const me2 = s.players.find((p) => p.id === HUMAN_ID)!;
    for (const [id, e] of s.board.edges) {
      if (
        !e.road &&
        (pb === "roadBuilding1" || id !== rbFirstEdge) &&
        e.adjacentEdges.some((a) => me2.roads.includes(a))
      ) {
        out.edges.add(id);
      }
    }
  }
  return out;
}

export type BuildKind = "road" | "settlement" | "city";

/**
 * Whether the human could place `kind` right now — at least one spot passes
 * the engine's own validation (resources AND position). Call inside a
 * tracking scope.
 */
export function canPlaceNow(kind: BuildKind): boolean {
  if (!game) return false;
  const s = game.getState();
  if (s.turn.phase !== "main" || !s.turn.hasRolled) return false;
  if (s.players[s.turn.currentPlayerIndex].id !== HUMAN_ID) return false;
  const action = kind === "road" ? "placeRoad" : kind === "city" ? "placeCity" : "placeSettlement";
  const ids = kind === "road" ? s.board.edges.keys() : s.board.vertices.keys();
  for (const id of ids) {
    if (game.canPerformAction(action, id).valid) return true;
  }
  return false;
}

/** Whether the human can buy a dev card right now (engine validation). */
export function canBuyDevNow(): boolean {
  if (!game) return false;
  const s = game.getState();
  if (s.turn.phase !== "main" || !s.turn.hasRolled) return false;
  if (s.players[s.turn.currentPlayerIndex].id !== HUMAN_ID) return false;
  return game.canPerformAction("buyDevCard").valid;
}

/** Best bank/port trade ratio the human has for a resource. */
export function tradeRatio(res: ResourceType): number {
  const s = snapshot();
  if (!s) return 4;
  const me = s.players.find((p) => p.id === HUMAN_ID);
  if (!me) return 4;
  let ratio = 4;
  for (const vid of [...me.settlements, ...me.cities]) {
    const port = s.vertices.find((v) => v.id === vid)?.port;
    if (port && (port.type === "generic" || port.type === res)) {
      ratio = Math.min(ratio, port.ratio);
    }
  }
  return ratio;
}
