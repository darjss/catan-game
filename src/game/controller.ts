import { createEffect, createRoot, createSignal, until } from "solid-js";
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

/** One log line: an icon, the acting player (for name color), and parts —
 *  plain text interleaved with resource icons and die faces. */
export type LogPart = string | { res: ResourceType } | { die: number };
export interface LogEntry {
  icon: string;
  actor?: string;
  parts: LogPart[];
  /** Turn index at push time — the log draws a divider when it changes. */
  turn?: number;
}
const [log, setLog] = createSignal<LogEntry[]>([]);
const [botThinking, setBotThinking] = createSignal<string | null>(null);
const [pendingBuild, setPendingBuild] = createSignal<PendingBuild>(null);
const [robberPick, setRobberPick] = createSignal<{ hexId: string; targets: PlayerState[] } | null>(
  null,
);
const [tradeOpen, setTradeOpen] = createSignal(false);
const [cardPick, setCardPick] = createSignal<"yearOfPlenty" | "monopoly" | null>(null);
const [lastError, setLastError] = createSignal<string | null>(null);
/** Hexes that produced on the latest roll — for the board flash. */
const [producedTiles, setProducedTiles] = createSignal<Set<string>>(new Set());

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
  producedTiles,
};

export function isBot(id: string): boolean {
  return BOT_IDS.has(id);
}

export function playerName(snap: Snapshot, id: string): string {
  return snap.players.find((p) => p.id === id)?.name ?? id;
}

function pushEntry(entry: LogEntry) {
  const turn = snapshot()?.turn.currentPlayerIndex;
  setLog((l) => [...l.slice(-120), { ...entry, turn }]);
}

function resParts(r?: Partial<Record<ResourceType, number>>): LogPart[] {
  if (!r) return [];
  return Object.entries(r)
    .filter(([, n]) => n)
    .flatMap(([k, n]) => [{ res: k as ResourceType }, ` ×${n}`] as LogPart[]);
}

function describeEvent(snap: Snapshot, ev: GameEvent): LogEntry | null {
  switch (ev.type) {
    case "diceRolled":
      return {
        icon: "dice",
        actor: ev.playerId,
        parts: [
          " rolled ",
          { die: ev.dice1 },
          { die: ev.dice2 },
          ev.total === 7 ? " — robber!" : "",
        ],
      };
    case "settlementBuilt":
      return { icon: "settle", actor: ev.playerId, parts: [" placed a settlement"] };
    case "cityBuilt":
      return { icon: "city", actor: ev.playerId, parts: [" upgraded to a city"] };
    case "roadBuilt":
      return { icon: "road", actor: ev.playerId, parts: [" placed a road"] };
    case "devCardBought":
      return { icon: "dev", actor: ev.playerId, parts: [" bought a development card"] };
    case "gameEnded":
      return { icon: "flag", actor: ev.winnerId, parts: [" wins!"] };
    default:
      return null;
  }
}

let flashToken = 0;
let prevSnap: Snapshot | null = null;

/** The engine only records builds, buys, rolls, and turn boundaries to
 *  history. Robber moves, steals, discards, bank trades, dev-card plays and
 *  road/army swings are silent, so diff consecutive snapshots for them. */
function logDiff(prev: Snapshot, snap: Snapshot, hadBuild: boolean, hadRoll: boolean) {
  // The player whose action caused this refresh — endTurn flips the index,
  // so read the actor from the *previous* state's current player.
  const actor = prev.players[prev.turn.currentPlayerIndex]?.id;

  // dev card played: a type count dropped
  for (const p of snap.players) {
    const before = prev.players.find((q) => q.id === p.id);
    if (!before) continue;
    for (const type of ["knight", "roadBuilding", "yearOfPlenty", "monopoly"] as const) {
      const was = before.devCards.filter((c) => c.type === type).length;
      const is = p.devCards.filter((c) => c.type === type).length;
      if (is < was) pushEntry({ icon: "dev", actor: p.id, parts: [` played ${CARD_LABEL[type]}`] });
    }
  }

  const robberMoved =
    prev.tiles.find((t) => t.hasRobber)?.id !== snap.tiles.find((t) => t.hasRobber)?.id;
  if (robberMoved) {
    pushEntry({ icon: "robber", actor, parts: [" moved the robber"] });
    const victim = snap.players.find(
      (p) =>
        p.id !== actor && handSize(p) === handSize(prev.players.find((q) => q.id === p.id)!) - 1,
    );
    if (victim) pushEntry({ icon: "robber", actor, parts: [" stole from ", victim.name] });
  }

  // resource diffs per player → discards and bank trades
  for (const p of snap.players) {
    const before = prev.players.find((q) => q.id === p.id);
    if (!before) continue;
    const lost: Partial<Record<ResourceType, number>> = {};
    const got: Partial<Record<ResourceType, number>> = {};
    for (const r of RESOURCE_TYPES) {
      const d = (before.resources[r] ?? 0) - (p.resources[r] ?? 0);
      if (d > 0) lost[r] = d;
      else if (d < 0) got[r] = -d;
    }
    const lostN = Object.values(lost).reduce((a, b) => a + b, 0);
    const gotN = Object.values(got).reduce((a, b) => a + b, 0);
    if (lostN === 0) continue;
    // steal victim already narrated
    if (robberMoved && p.id !== actor && lostN === 1 && gotN === 0) continue;
    if (prev.turn.phase === "robberDiscard" && gotN === 0) {
      pushEntry({ icon: "gain", actor: p.id, parts: [" discarded ", ...resParts(lost)] });
    } else if (!hadBuild && !hadRoll && !robberMoved && gotN > 0 && p.id === actor) {
      pushEntry({
        icon: "trade",
        actor: p.id,
        parts: [" gave ", ...resParts(lost), ", got ", ...resParts(got)],
      });
    }
  }

  for (const p of snap.players) {
    const before = prev.players.find((q) => q.id === p.id);
    if (!before) continue;
    if (p.hasLongestRoad && !before.hasLongestRoad)
      pushEntry({ icon: "road", actor: p.id, parts: [" took longest road"] });
    if (p.hasLargestArmy && !before.hasLargestArmy)
      pushEntry({ icon: "dev", actor: p.id, parts: [" took largest army"] });
  }
}

const CARD_LABEL: Record<string, string> = {
  knight: "a knight",
  roadBuilding: "road building",
  yearOfPlenty: "year of plenty",
  monopoly: "monopoly",
};

function refresh() {
  if (!game) return;
  const snap = takeSnapshot(game.getState());
  setSnapshot(snap);
  const fresh = game.getHistory().slice(seenEvents);
  const hadBuild = fresh.some((e) =>
    ["settlementBuilt", "cityBuilt", "roadBuilt", "devCardBought"].includes(e.type),
  );
  const hadRoll = fresh.some((e) => e.type === "diceRolled");
  for (const ev of fresh) {
    if (ev.type === "diceRolled" && ev.total !== 7) {
      const produced = new Set(
        snap.tiles.filter((t) => t.numberToken === ev.total && !t.hasRobber).map((t) => t.id),
      );
      const token = ++flashToken;
      setProducedTiles(produced);
      setTimeout(() => {
        if (flashToken === token) setProducedTiles(new Set<string>());
      }, 1400);
    }
    const entry = describeEvent(snap, ev);
    if (entry) pushEntry(entry);
    // The engine doesn't emit per-player gain events — derive them from the
    // board: 1 card per settlement, 2 per city on each producing hex.
    if (ev.type === "diceRolled" && ev.total !== 7) {
      const gains = new Map<string, Map<string, number>>();
      for (const t of snap.tiles) {
        if (t.numberToken !== ev.total || t.hasRobber) continue;
        for (const v of snap.vertices) {
          if (!v.structure || !v.adjacentTiles.includes(t.id)) continue;
          const n = v.structure.type === "city" ? 2 : 1;
          const m = gains.get(v.structure.playerId) ?? new Map<string, number>();
          m.set(t.type, (m.get(t.type) ?? 0) + n);
          gains.set(v.structure.playerId, m);
        }
      }
      for (const [pid, res] of gains) {
        pushEntry({
          icon: "gain",
          actor: pid,
          parts: [" got ", ...resParts(Object.fromEntries(res))],
        });
      }
    }
  }
  seenEvents = game.getHistory().length;
  if (prevSnap) logDiff(prevSnap, snap, hadBuild, hadRoll);
  prevSnap = snap;
}

let seenEvents = 0;

/** Sleep that resolves early when aborted. */
function pace(ms: number, signal: AbortSignal) {
  return new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        res();
      },
      { once: true },
    );
  });
}

/** True when a bot has work: it's a bot's turn, or a bot must discard. */
function botsNeedWork(s: Snapshot | null): boolean {
  if (!s || s.winner) return false;
  if (s.turn.phase === "robberDiscard")
    return s.turn.mustDiscardPlayers.some((id) => BOT_IDS.has(id));
  return BOT_IDS.has(s.players[s.turn.currentPlayerIndex].id);
}

/** Bumped on every new game — restarting the driver is a compute dependency
 *  change, and the previous loop is aborted by the effect's cleanup. */
const [gameId, setGameId] = createSignal(0);

/**
 * Bot driver. `until` parks the loop on the snapshot signal instead of being
 * poked from every action, and the abort unwinds pacing sleeps and any
 * in-flight Jev call. Starting a new game bumps `gameId`, which re-runs the
 * effect — its cleanup aborts the old loop so a stale driver can't move
 * pieces in the fresh game.
 */
createRoot(() => {
  createEffect(
    () => gameId(),
    () => {
      const g = game;
      if (!g) return;
      const ac = new AbortController();
      void (async () => {
        while (!g.isGameOver()) {
          try {
            await until(() => botsNeedWork(snapshot()), { signal: ac.signal });
          } catch {
            return; // aborted
          }
          if (ac.signal.aborted) return;
          const s = g.getState();
          if (s.turn.phase === "robberDiscard") {
            const id = s.turn.mustDiscardPlayers.find((x) => BOT_IDS.has(x));
            if (id) {
              botDiscard(g, id);
              refresh();
              await pace(400, ac.signal);
            }
            continue;
          }
          const current = s.players[s.turn.currentPlayerIndex];
          if (!BOT_IDS.has(current.id)) continue;
          setBotThinking(current.name);
          try {
            await pace(350, ac.signal);
            await botStep(g, current, ac.signal);
          } finally {
            setBotThinking(null);
          }
          if (ac.signal.aborted) return;
          refresh();
          await pace(500, ac.signal);
        }
      })();
      // cleanup runs before the next game and on disposal
      return () => ac.abort();
    },
  );
});

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

// --- persistence ------------------------------------------------------------
// The game lives in this tab's memory — a mobile browser evicting the tab
// wipes it. Every mutation, human or bot, goes through one of these Game
// methods, so wrapping them gives a complete, deterministic action log:
// same seed + same actions = same game. Determinism is guaranteed by the
// pnpm patch on catan-game-engine: all RNG draws seed from the game seed
// plus a draw counter on state, never Date.now().
const STORAGE_KEY = "catan:game:v3";
const RECORDED_METHODS = [
  "rollDice",
  "placeSettlement",
  "placeCity",
  "placeRoad",
  "buyDevCard",
  "playKnight",
  "playRoadBuilding",
  "playYearOfPlenty",
  "playMonopoly",
  "discardResources",
  "moveRobber",
  "tradeWithBank",
  "endTurn",
] as const;

type LoggedAction = [string, unknown[]];
type SavedGame = { names: string[]; seed: number; actions: LoggedAction[]; tab: string };

let actionLog: LoggedAction[] = [];
let replaying = false;
// Each tab owns its writes. A second tab resuming the same save would
// otherwise diverge and the two tabs would clobber each other's log.
const TAB_ID = crypto.randomUUID();

function persistGame(names: string[], seed: number, force = false) {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && !force) {
      const other = JSON.parse(existing) as SavedGame;
      // A foreign save that's ahead of us belongs to a live tab further
      // along — don't clobber it. Behind us, it's stale and safe to replace.
      if (other.tab !== TAB_ID && other.actions.length > actionLog.length) return;
    }
    const save: SavedGame = { names, seed, actions: actionLog, tab: TAB_ID };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // storage full or private mode — game keeps working, just won't resume
  }
}

/** Wrap a Game so every recorded method appends [method, args]. */
function instrument(g: Game, names: string[], seed: number) {
  for (const m of RECORDED_METHODS) {
    const orig = (g[m] as (...a: unknown[]) => unknown).bind(g);
    (g as unknown as Record<string, (...a: unknown[]) => unknown>)[m] = (...args: unknown[]) => {
      const r = orig(...args);
      if (!replaying) {
        actionLog.push([m, args]);
        persistGame(names, seed);
      }
      return r;
    };
  }
}

/** Shared activation: swap in a game, reset UI state, kick the bot driver. */
function activate(g: Game, names: string[], seed: number) {
  game = g;
  seenEvents = 0;
  prevSnap = null;
  setLog([]);
  setPendingBuild(null);
  setRobberPick(null);
  setTradeOpen(false);
  setCardPick(null);
  rbFirstEdge = null;
  instrument(g, names, seed);
  refresh();
  setGameId((v) => v + 1);
}

export function newGame(yourName = "You") {
  const names = [yourName, ...BOT_NAMES];
  const seed = pickSeed();
  actionLog = [];
  persistGame(names, seed, true);
  activate(new Game(names, seed), names, seed);
  pushEntry({ icon: "flag", parts: ["New game — place your first settlement"] });
}

/** On load: rebuild the saved game by replaying its action log on the same
 *  seed, or start fresh if there's nothing (or the log is corrupted). */
export function resumeOrNew() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return newGame();
    const saved = JSON.parse(raw) as {
      names: string[];
      seed: number;
      actions: LoggedAction[];
    };
    const g = new Game(saved.names, saved.seed);
    replaying = true;
    try {
      for (let i = 0; i < saved.actions.length; i++) {
        const [m, args] = saved.actions[i];
        try {
          (g[m as keyof Game] as (...a: unknown[]) => unknown)(...args);
        } catch (err) {
          throw new Error(`replay failed at action ${i} (${m}): ${(err as Error).message}`, {
            cause: err,
          });
        }
      }
    } finally {
      replaying = false;
    }
    actionLog = saved.actions;
    activate(g, saved.names, saved.seed);
    pushEntry({ icon: "flag", parts: ["Resumed your game"] });
  } catch (err) {
    console.error("[resume] replay failed — starting fresh:", err);
    // Quarantine, don't wipe: a failed save may be recoverable (e.g. after an
    // engine fix) and erasing it turns a compatibility bug into data loss.
    // Storing the error alongside it means the next report has evidence.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(
          `${STORAGE_KEY}:failed`,
          JSON.stringify({ error: String(err), save: JSON.parse(raw) }),
        );
      }
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no storage — nothing to quarantine
    }
    newGame();
    pushEntry({ icon: "warn", parts: ["Couldn't resume your saved game — started a new one"] });
  }
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
  const s = snapshot();
  if (!s || !game) return false;
  if (s.turn.phase !== "main" || !s.turn.hasRolled) return false;
  if (s.players[s.turn.currentPlayerIndex].id !== HUMAN_ID) return false;
  const action = kind === "road" ? "placeRoad" : kind === "city" ? "placeCity" : "placeSettlement";
  const ids = kind === "road" ? s.edges.map((e) => e.id) : s.vertices.map((v) => v.id);
  for (const id of ids) {
    if (game.canPerformAction(action, id).valid) return true;
  }
  return false;
}

/** Whether the human can buy a dev card right now (engine validation). */
export function canBuyDevNow(): boolean {
  const s = snapshot();
  if (!s || !game) return false;
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
