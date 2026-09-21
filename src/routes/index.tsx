import { Title } from "@solidjs/meta";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  type ParentProps,
} from "solid-js";
import { css, cva } from "styled-system/css";
import { GAME_CONSTANTS } from "catan-game-engine";
import Board from "../components/Board";
import {
  HUMAN_ID,
  botThinking,
  buyDevCard,
  canBuyDevNow,
  canPlaceNow,
  cardPick,
  clickEdge,
  clickTile,
  clickVertex,
  computeLegalTargets,
  discard,
  endTurn,
  lastError,
  log,
  newGame,
  pendingBuild,
  pickMonopoly,
  pickRobberTarget,
  pickYearOfPlenty,
  playCard,
  producedTiles,
  robberPick,
  resumeOrNew,
  rollDice,
  setCardPick,
  setPendingBuild,
  setTradeOpen,
  snapshot,
  trade,
  tradeOpen,
  tradeRatio,
  type LogPart,
} from "../game/controller";
import { RESOURCE_TYPES, type ResourceType } from "../game/model";
import { ActionIcon, DieFace, ResourceIcon } from "../assets/art";
import { palette } from "../palette";

const CARD_NAMES: Record<string, string> = {
  knight: "Knight",
  roadBuilding: "Road Building",
  yearOfPlenty: "Year of Plenty",
  monopoly: "Monopoly",
  victoryPoint: "Victory Point",
};

type BuildKind = keyof typeof GAME_CONSTANTS.COSTS;

const PLAYER_DOT: Record<string, string> = palette.player;

const panel = css({
  background: "token(colors.paper)",
  borderRadius: "card",
  border: "1px solid oklch(0 0 0 / 0.12)",
  boxShadow: "0 3px 0 oklch(0.25 0.05 60 / 0.25), 0 10px 24px oklch(0.15 0.06 235 / 0.3)",
});

const railHeader = css({
  fontWeight: 800,
  fontSize: "15px",
  padding: "8px 14px",
  borderBottom: "1px solid oklch(0 0 0 / 0.1)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

const btn = cva({
  base: {
    font: "inherit",
    fontWeight: 800,
    borderRadius: "ctrl",
    padding: "8px 12px",
    cursor: "pointer",
    border: "1px solid token(colors.timberDark)",
    background: "token(colors.paperHi)",
    color: "token(colors.ink)",
    boxShadow: "0 2px 0 oklch(0.25 0.05 60 / 0.3)",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    transitionProperty: "transform, background-color, box-shadow",
    transitionDuration: "150ms",
    transitionTimingFunction: "token(easings.out)",
    _hover: { background: "token(colors.paper)" },
    _active: { transform: "translateY(1px) scale(0.97)", boxShadow: "none" },
    _disabled: { opacity: 0.45, cursor: "default", boxShadow: "none" },
  },
  variants: {
    kind: {
      plain: {},
      primary: {
        background: "token(colors.accent)",
        color: "token(colors.accentInk)",
        borderColor: "token(colors.accentDeep)",
        boxShadow: "0 3px 0 token(colors.accentDeep)",
        _hover: { background: "token(colors.accentDeep)" },
      },
      ghost: {
        background: "transparent",
        borderColor: "oklch(1 0 0 / 0.25)",
        color: "token(colors.paper)",
        boxShadow: "none",
      },
    },
    sel: {
      true: {
        borderColor: "token(colors.accent)",
        boxShadow: "0 0 0 2px token(colors.accent)",
      },
    },
  },
});

const modalTitle = css({ margin: 0, fontSize: "19px", fontWeight: 800 });

function costText(kind: BuildKind) {
  return RESOURCE_TYPES.filter((r) => (GAME_CONSTANTS.COSTS[kind][r] ?? 0) > 0)
    .map((r) => `${GAME_CONSTANTS.COSTS[kind][r]} ${r}`)
    .join(" + ");
}

function handSizeOf(p?: { resources: Partial<Record<ResourceType, number>> }) {
  return RESOURCE_TYPES.reduce((n, r) => n + (p?.resources[r] ?? 0), 0);
}

/** Render one log part: text, resource sprite, or mini die face. */
function LogPartView(props: { part: LogPart }) {
  const p = props.part;
  if (typeof p === "string") return <>{p}</>;
  const inner =
    "res" in p ? <ResourceIcon type={p.res} size={15} /> : <DieFace value={p.die} size={18} />;
  return (
    <span
      class={css({
        display: "inline-flex",
        verticalAlign: "-3px",
        margin: "0 1px",
      })}
    >
      {inner}
    </span>
  );
}

export default function Home() {
  let logEl: HTMLElement | undefined;
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [logCollapsed, setLogCollapsed] = createSignal(false);
  onSettled(() => {
    resumeOrNew();
  });
  // Keep the game log pinned to the newest line.
  createEffect(
    () => log().length,
    () => {
      logEl?.scrollTo({ top: logEl.scrollHeight });
    },
  );

  const me = () => snapshot()?.players.find((p) => p.id === HUMAN_ID);
  const current = () => {
    const s = snapshot();
    return s ? s.players[s.turn.currentPlayerIndex] : undefined;
  };
  const myTurn = () => current()?.id === HUMAN_ID;
  const rolled = () => !!snapshot()?.turn.hasRolled;
  const phase = () => snapshot()?.turn.phase;
  const legal = createMemo(() => {
    snapshot();
    pendingBuild();
    return computeLegalTargets();
  });
  const winner = () => {
    const s = snapshot();
    return s?.winner ? s.players.find((p) => p.id === s.winner) : undefined;
  };
  // Dice tumble in on every roll — WAAPI so identical rolls replay.
  createEffect(
    () => snapshot()?.turn.diceRoll,
    (r) => {
      if (!r) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      document.querySelectorAll("[data-dice] > *").forEach((el, i) =>
        el.animate(
          [
            { transform: "translateY(-16px) rotate(-20deg) scale(0.85)", opacity: 0 },
            { transform: "translateY(2px) rotate(5deg) scale(1.02)", opacity: 1, offset: 0.6 },
            { transform: "translateY(0) rotate(0)" },
          ],
          {
            duration: 340,
            delay: i * 90,
            easing: "cubic-bezier(0.23,1,0.32,1)",
            fill: "backwards",
          },
        ),
      );
    },
  );
  const mustDiscard = () => {
    const s = snapshot();
    return s?.turn.phase === "robberDiscard" && s.turn.mustDiscardPlayers.includes(HUMAN_ID);
  };
  const prompt = () => {
    const s = snapshot();
    if (!s) return "";
    if (s.turn.phase === "setup") {
      return myTurn()
        ? s.turn.setupPhase?.includes("Settlement")
          ? "Place a settlement — tap a glowing spot"
          : "Place a road — tap a glowing edge"
        : `${current()?.name} is setting up…`;
    }
    if (s.turn.phase === "robberDiscard") {
      return mustDiscard() ? "Too many cards — discard half" : "Waiting for discards…";
    }
    if (s.turn.phase === "robberPlacement") {
      return myTurn() ? "Move the robber — tap a hex" : `${current()?.name} is moving the robber…`;
    }
    if (!myTurn())
      return botThinking() ? `${botThinking()} is thinking…` : `${current()?.name}'s turn`;
    if (!rolled()) return "Roll the dice";
    const pb = pendingBuild();
    if (pb === "knight") return "Knight: tap a hex for the robber";
    if (pb === "roadBuilding1") return "Road Building: tap an edge for road 1";
    if (pb === "roadBuilding2") return "Road Building: tap an edge for road 2";
    if (pb) return `Tap a glowing ${pb === "road" ? "edge" : "spot"} — or cancel`;
    return "Build, trade, or end turn";
  };

  return (
    <main
      class={css({
        height: { base: "auto", lg: "100vh" },
        minH: "100vh",
        display: "grid",
        gridTemplateColumns: { base: "minmax(0,1fr)", lg: "52px minmax(0,1fr) 330px" },
        gridTemplateRows: { base: "auto auto auto auto", lg: "minmax(0,1fr) auto" },
        gap: { base: "8px", lg: "12px" },
        padding: { base: "8px", lg: "12px" },
        overflow: { lg: "hidden" },
      })}
    >
      <Title>Catan</Title>

      {/* left icon rail */}
      <nav
        class={css({
          display: "flex",
          flexDir: { base: "row", lg: "column" },
          alignItems: "center",
          gap: "10px",
          padding: { lg: "6px 0" },
          gridRow: { lg: "1 / 3" },
        })}
      >
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          aria-hidden="true"
          class={css({ margin: { lg: "0 auto" }, display: "block" })}
        >
          <polygon
            points="12,2 21,7 21,17 12,22 3,17 3,7"
            fill={palette.accent}
            stroke="oklch(1 0 0 / 0.4)"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
        <RailButton
          icon="reset"
          label="New game"
          onClick={() => {
            if (snapshot() && !winner() && !confirm("Abandon this game and start a new one?"))
              return;
            newGame();
          }}
        />
        <RailButton
          icon="expand"
          label="Toggle fullscreen"
          onClick={() =>
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen()
          }
        />
        <RailButton icon="help" label="How to play" onClick={() => setHelpOpen(true)} />
      </nav>

      {/* board — the page is the sea, the svg is transparent */}
      <section
        class={css({
          position: "relative",
          gridColumn: { lg: "2" },
          gridRow: { base: "2", lg: "1" },
          minH: { base: "52vh", lg: 0 },
          minW: 0,
          display: "grid",
          placeItems: "center",
        })}
      >
        <Show
          when={snapshot()}
          fallback={
            <p class={css({ color: "token(colors.paper)", fontWeight: 700 })}>
              Setting up the island…
            </p>
          }
        >
          {(s) => (
            <Board
              snap={s()}
              legal={legal()}
              producing={producedTiles()}
              ghost={pendingBuild() === "city" ? "city" : "settlement"}
              onVertex={clickVertex}
              onEdge={clickEdge}
              onTile={clickTile}
            />
          )}
        </Show>
      </section>

      {/* right rail: game log + player cards */}
      <aside
        class={css({
          display: "flex",
          flexDir: { base: "column-reverse", lg: "column" },
          gap: "8px",
          minH: 0,
          gridRow: { base: "4", lg: "1 / 3" },
        })}
      >
        <section
          class={`${panel} ${css({ display: "flex", flexDir: "column", minH: 0, flex: 1 })}`}
        >
          <div class={railHeader}>
            Game log
            <button
              type="button"
              aria-label={logCollapsed() ? "Expand game log" : "Collapse game log"}
              title={logCollapsed() ? "Expand game log" : "Collapse game log"}
              class={css({
                font: "inherit",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "token(colors.inkSoft)",
                display: "grid",
                placeItems: "center",
                padding: "2px",
                borderRadius: "6px",
                transitionProperty: "transform",
                transitionDuration: "150ms",
              })}
              style={{ transform: logCollapsed() ? "rotate(-90deg)" : "none" }}
              onClick={() => {
                setLogCollapsed(!logCollapsed());
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M6 9 L12 15 L18 9 Z" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div
            class={css({
              flex: 1,
              minH: "120px",
              maxH: { base: "170px", lg: "none" },
              fontSize: "13px",
              color: "token(colors.inkSoft)",
              overflowY: "auto",
              padding: "8px 12px",
            })}
            style={{ display: logCollapsed() ? "none" : "block" }}
            ref={(el) => {
              logEl = el;
            }}
          >
            <For each={log()}>
              {(entry, i) => (
                <>
                  <Show when={i() > 0 && entry.turn != null && log()[i() - 1].turn !== entry.turn}>
                    <div
                      class={css({
                        borderTop: "1px solid oklch(0 0 0 / 0.14)",
                        margin: "5px 0 3px",
                        paddingTop: "3px",
                        fontSize: "10px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "token(colors.inkSoft)",
                      })}
                    >
                      {entry.turn != null
                        ? (snapshot()?.players[entry.turn]?.name ?? "Turn")
                        : "Turn"}
                    </div>
                  </Show>
                  <div
                    class={css({
                      display: "flex",
                      alignItems: "baseline",
                      gap: "6px",
                      padding: "2px 0",
                      lineHeight: 1.45,
                    })}
                  >
                    <span
                      aria-hidden="true"
                      class={css({ flexShrink: 0, transform: "translateY(2px)" })}
                      style={{ color: entry.actor ? PLAYER_DOT[entry.actor] : palette.inkSoft }}
                    >
                      <LogIcon kind={entry.icon} />
                    </span>
                    <span class={css({ flex: 1 })}>
                      <Show when={entry.actor}>
                        {(id) => (
                          <b style={{ color: PLAYER_DOT[id()] ?? palette.ink }}>
                            {snapshot()?.players.find((p) => p.id === id())?.name ?? "You"}
                          </b>
                        )}
                      </Show>
                      <For each={entry.parts}>{(part) => <LogPartView part={part} />}</For>
                    </span>
                  </div>
                </>
              )}
            </For>
          </div>
        </section>

        {/* bank strip — real state only: dev deck, road/army holders */}
        <section
          class={`${panel} ${css({
            display: "flex",
            gap: "12px",
            padding: "5px 12px",
            fontSize: "11px",
            fontWeight: 700,
            color: "token(colors.inkSoft)",
            alignItems: "center",
            overflowX: "auto",
            flexShrink: 0,
          })}`}
        >
          <span
            class={css({ display: "inline-flex", alignItems: "center", gap: "4px" })}
            title="Development cards left in the deck"
          >
            <ActionIcon name="dev" size={14} />
            Deck ×{snapshot()?.devCardDeckCount ?? 0}
          </span>
          <span
            class={css({ display: "inline-flex", alignItems: "center", gap: "4px" })}
            title="Longest road"
          >
            <ActionIcon name="road" size={14} />
            {snapshot()?.longestRoadPlayer
              ? (snapshot()?.players.find((p) => p.id === snapshot()?.longestRoadPlayer)?.name ??
                "—")
              : "Road —"}
          </span>
          <span
            class={css({ display: "inline-flex", alignItems: "center", gap: "4px" })}
            title="Largest army"
          >
            <ActionIcon name="knight" size={14} />
            {snapshot()?.largestArmyPlayer
              ? (snapshot()?.players.find((p) => p.id === snapshot()?.largestArmyPlayer)?.name ??
                "—")
              : "Army —"}
          </span>
        </section>

        {/* player cards */}
        <section
          class={css({
            display: "flex",
            flexDir: { base: "row", lg: "column" },
            gap: "6px",
            overflowX: { base: "auto", lg: "visible" },
          })}
        >
          <For each={snapshot()?.players}>
            {(p) => {
              const active = () => current()?.id === p.id;
              const thinking = () => botThinking() === p.name;
              return (
                <div
                  class={`${panel} ${css({ minW: { base: "190px", lg: "0px" } })}`}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "10px",
                    padding: "6px 12px",
                    "border-color": active()
                      ? (PLAYER_DOT[p.id] ?? palette.accent)
                      : "oklch(0 0 0 / 0.12)",
                    "border-width": "2px",
                    transform: active() ? "translateY(-1px)" : "none",
                    transition: "border-color 200ms, transform 200ms",
                  }}
                >
                  <span
                    class={css({
                      width: "34px",
                      height: "34px",
                      borderRadius: "full",
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      fontSize: "16px",
                      color: "token(colors.accentInk)",
                      boxShadow: "inset 0 -2px 0 oklch(0 0 0 / 0.2)",
                    })}
                    style={{ background: PLAYER_DOT[p.id] ?? palette.inkSoft }}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  <span class={css({ flex: 1, minW: 0 })}>
                    <span class={css({ display: "block", fontWeight: 800, lineHeight: 1.2 })}>
                      {p.name}
                      <Show when={thinking()}>
                        <span class={css({ color: "token(colors.inkSoft)", fontWeight: 500 })}>
                          {" "}
                          thinking…
                        </span>
                      </Show>
                    </span>
                    <span
                      class={css({
                        display: "flex",
                        gap: "10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "token(colors.inkSoft)",
                        alignItems: "center",
                      })}
                    >
                      <Stat icon="cards" n={handSizeOf(p)} title="cards in hand" />
                      <Stat icon="road" n={p.roads.length} title="roads" />
                      <Stat
                        icon="settle"
                        n={p.settlements.length + p.cities.length}
                        title="settlements + cities"
                      />
                      <Show when={p.devCards.filter((c) => !c.playedThisTurn).length > 0}>
                        <Stat
                          icon="dev"
                          n={p.devCards.filter((c) => !c.playedThisTurn).length}
                          title="development cards"
                        />
                      </Show>
                      <Show when={p.knightsPlayed > 0}>
                        <Stat icon="knight" n={p.knightsPlayed} title="knights played" />
                      </Show>
                      <Show when={p.hasLongestRoad}>
                        <span
                          class={css({ color: "token(colors.accent)", fontWeight: 800 })}
                          title="Longest road"
                        >
                          LR
                        </span>
                      </Show>
                      <Show when={p.hasLargestArmy}>
                        <span
                          class={css({ color: "token(colors.accent)", fontWeight: 800 })}
                          title="Largest army"
                        >
                          LA
                        </span>
                      </Show>
                    </span>
                  </span>
                  <span
                    class={css({
                      fontWeight: 900,
                      fontSize: "20px",
                      fontVariantNumeric: "tabular-nums",
                    })}
                  >
                    {p.victoryPoints}
                    <span
                      class={css({
                        fontSize: "11px",
                        color: "token(colors.inkSoft)",
                        marginLeft: "3px",
                      })}
                    >
                      VP
                    </span>
                  </span>
                </div>
              );
            }}
          </For>
        </section>
      </aside>

      {/* dock: hand | status + dice | actions */}
      <section
        class={`${panel} ${css({
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "nowrap",
          overflowX: { base: "auto", lg: "visible" },
          justifyContent: { base: "flex-start", lg: "flex-start" },
          gridColumn: { lg: "2" },
          gridRow: { base: "3", lg: "2" },
          padding: "8px 14px",
          minH: { base: "104px", lg: "110px" },
        })}`}
      >
        {/* hand of resource cards */}
        <div class={css({ display: "flex", gap: "6px", flexShrink: 0 })}>
          <For each={RESOURCE_TYPES}>
            {(r) => {
              const n = () => me()?.resources[r] ?? 0;
              return (
                <div
                  class={css({
                    position: "relative",
                    width: "46px",
                    height: "60px",
                    borderRadius: "ctrl",
                    background: "token(colors.paper)",
                    border: "1px solid oklch(0 0 0 / 0.14)",
                    display: "grid",
                    placeItems: "center",
                    boxShadow:
                      "0 2px 0 oklch(0.25 0.05 60 / 0.25), 0 8px 16px oklch(0.15 0.06 235 / 0.25)",
                  })}
                  style={{ opacity: n() > 0 ? 1 : 0.4 }}
                  title={r}
                >
                  <ResourceIcon type={r} size={34} />
                  <span
                    class={css({
                      position: "absolute",
                      bottom: "-6px",
                      right: "-4px",
                      minW: "20px",
                      textAlign: "center",
                      background: "token(colors.ink)",
                      color: "token(colors.paper)",
                      borderRadius: "full",
                      fontWeight: 900,
                      fontSize: "12px",
                      padding: "1px 5px",
                      fontVariantNumeric: "tabular-nums",
                    })}
                  >
                    {n()}
                  </span>
                </div>
              );
            }}
          </For>
          <Show when={me()?.devCards.some((c) => !c.playedThisTurn && c.type !== "victoryPoint")}>
            <div
              class={css({
                display: "flex",
                flexDir: "column",
                gap: "4px",
                justifyContent: "center",
                marginLeft: "6px",
              })}
            >
              <For
                each={me()!.devCards.filter((c) => !c.playedThisTurn && c.type !== "victoryPoint")}
              >
                {(c) => (
                  <button
                    type="button"
                    class={btn()}
                    style="font-size:12px;padding:3px 9px"
                    onClick={() => playCard(c.type)}
                  >
                    {CARD_NAMES[c.type]}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* center: status + dice (or trade composition) */}
        <div
          class={css({
            flexGrow: 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
          })}
        >
          <Show when={!tradeOpen()} fallback={<TradeDock />}>
            <span
              class={css({
                width: "34px",
                height: "34px",
                borderRadius: "full",
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: "16px",
                color: "token(colors.accentInk)",
                boxShadow: "inset 0 -2px 0 oklch(0 0 0 / 0.2), 0 0 0 2px oklch(0 0 0 / 0.12)",
              })}
              style={{ background: PLAYER_DOT[current()?.id ?? ""] ?? palette.inkSoft }}
            >
              {current()?.name.slice(0, 1)}
            </span>
            <span
              class={css({
                minW: "140px",
                maxW: "260px",
                flexShrink: 1,
                textAlign: "center",
              })}
            >
              <span class={css({ display: "block", fontWeight: 900, fontSize: "15px" })}>
                {myTurn() ? "Your turn" : `${current()?.name ?? "…"}'s turn`}
                <Show when={botThinking()}>
                  <span
                    class={css({
                      color: "token(colors.inkSoft)",
                      fontWeight: 600,
                      fontSize: "13px",
                    })}
                  >
                    {" "}
                    thinking…
                  </span>
                </Show>
              </span>
              <span
                class={css({
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "token(colors.inkSoft)",
                })}
              >
                {prompt()}
              </span>
            </span>
            <span
              data-dice
              class={css({ display: "flex", gap: "10px", flexShrink: 0, alignItems: "center" })}
            >
              <Show
                when={snapshot()?.turn.diceRoll}
                fallback={
                  <span class={css({ display: "flex", gap: "10px", opacity: 0.3 })}>
                    <DieFace value={1} size={72} />
                    <DieFace value={1} size={72} />
                  </span>
                }
              >
                {(d) => (
                  <>
                    <DieFace value={d()[0]} size={72} />
                    <DieFace value={d()[1]} size={72} />
                  </>
                )}
              </Show>
            </span>
            <Show when={myTurn() && phase() === "main" && !rolled()}>
              <button
                type="button"
                class={btn({ kind: "primary" })}
                style="padding:12px 22px;font-size:16px"
                onClick={rollDice}
              >
                Roll dice
              </button>
            </Show>
          </Show>
        </div>

        {/* actions — one fixed row of icon tiles like the reference */}
        <div
          class={css({
            display: "flex",
            gap: "6px",
            alignItems: "stretch",
            flexShrink: 0,
          })}
        >
          <ActionTile
            icon="trade"
            label="Trade with the bank"
            short="Trade"
            sel={tradeOpen()}
            disabled={!(myTurn() && phase() === "main" && rolled())}
            onClick={() => setTradeOpen(!tradeOpen())}
          />
          <ActionTile
            icon="dev"
            label={`Buy development card — ${costText("devCard")}`}
            short="Dev"
            disabled={!canBuyDevNow()}
            onClick={buyDevCard}
          />
          <ActionTile
            icon="road"
            label={`Build road — ${costText("road")}`}
            short="Road"
            badge={15 - (me()?.roads.length ?? 0)}
            sel={pendingBuild() === "road"}
            disabled={!canPlaceNow("road")}
            onClick={() => setPendingBuild(pendingBuild() === "road" ? null : "road")}
          />
          <ActionTile
            icon="settle"
            label={`Build settlement — ${costText("settlement")}`}
            short="Settle"
            badge={5 - (me()?.settlements.length ?? 0)}
            sel={pendingBuild() === "settlement"}
            disabled={!canPlaceNow("settlement")}
            onClick={() => setPendingBuild(pendingBuild() === "settlement" ? null : "settlement")}
          />
          <ActionTile
            icon="city"
            label={`Upgrade to city — ${costText("city")}`}
            short="City"
            badge={4 - (me()?.cities.length ?? 0)}
            sel={pendingBuild() === "city"}
            disabled={!canPlaceNow("city")}
            onClick={() => setPendingBuild(pendingBuild() === "city" ? null : "city")}
          />
          <ActionTile
            icon="end"
            label="End turn"
            short="End"
            accent
            disabled={!(myTurn() && phase() === "main" && rolled())}
            onClick={endTurn}
          />
          <Show when={pendingBuild()}>
            <ActionTile
              icon="cancel"
              label="Cancel placement"
              onClick={() => setPendingBuild(null)}
            />
          </Show>
        </div>
      </section>

      {/* robber target picker */}
      <Show when={robberPick()}>
        {(pick) => (
          <Modal>
            <h2 class={modalTitle}>Steal from whom?</h2>
            <For each={pick().targets}>
              {(t) => (
                <button type="button" class={btn()} onClick={() => pickRobberTarget(t.id)}>
                  {t.name} ({handSizeOf(t)} cards)
                </button>
              )}
            </For>
            <button
              type="button"
              class={btn({ kind: "ghost" })}
              style="color:var(--colors-ink-soft)"
              onClick={() => pickRobberTarget(undefined)}
            >
              No one
            </button>
          </Modal>
        )}
      </Show>

      <Show when={mustDiscard()}>
        <DiscardModal />
      </Show>
      <Show when={cardPick()}>{(kind) => <CardModal kind={kind()} />}</Show>

      <Show when={helpOpen()}>
        <Modal>
          <h2 class={modalTitle}>How to play</h2>
          <div class={css({ fontSize: "13px", lineHeight: 1.5, color: "token(colors.inkSoft)" })}>
            <p>
              First to {GAME_CONSTANTS.VICTORY_POINTS_TO_WIN} victory points wins. Roll dice to
              collect resources, then build roads, settlements, and cities or buy development cards.
            </p>
            <ul class={css({ paddingLeft: "18px", margin: "6px 0" })}>
              <li>Settlements and cities earn resources when their hex's number is rolled.</li>
              <li>A roll of 7 moves the robber — players over 7 cards discard half.</li>
              <li>Trade spare resources with the bank (4:1, or better at ports).</li>
              <li>Longest road and largest army are each worth 2 VP.</li>
            </ul>
          </div>
          <button type="button" class={btn({ kind: "primary" })} onClick={() => setHelpOpen(false)}>
            Got it
          </button>
        </Modal>
      </Show>

      <Show when={winner()}>
        {(w) => (
          <Modal>
            <h2 class={modalTitle}>{w().id === HUMAN_ID ? "You win!" : `${w().name} wins`}</h2>
            <button type="button" class={btn({ kind: "primary" })} onClick={() => newGame()}>
              Play again
            </button>
          </Modal>
        )}
      </Show>

      <Show when={lastError()}>
        {(e) => (
          <div
            class={css({
              position: "fixed",
              bottom: "18px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "token(colors.danger)",
              color: "token(colors.accentInk)",
              padding: "10px 18px",
              borderRadius: "full",
              fontWeight: 700,
              fontSize: "14px",
              zIndex: 20,
              boxShadow: "0 6px 20px oklch(0 0 0 / 0.35)",
            })}
          >
            {e()}
          </div>
        )}
      </Show>
    </main>
  );
}

/** Slim icon button for the left rail. */
function RailButton(p: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      onClick={p.onClick}
      class={css({
        width: "38px",
        height: "38px",
        padding: "0",
        borderRadius: "12px",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        border: "1px solid oklch(1 0 0 / 0.22)",
        background: "oklch(1 0 0 / 0.12)",
        color: "token(colors.paper)",
        transitionProperty: "transform, background-color",
        transitionDuration: "150ms",
        _hover: { background: "oklch(1 0 0 / 0.22)" },
        _active: { transform: "scale(0.94)" },
      })}
    >
      <ActionIcon name={p.icon} size={20} />
    </button>
  );
}

/** Square action tile — icon, tiny caption, count badge, tooltip. */
function ActionTile(props: {
  icon: string;
  label: string;
  short?: string;
  badge?: number;
  sel?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      class={css({
        position: "relative",
        width: "54px",
        height: "58px",
        borderRadius: "ctrl",
        display: "flex",
        flexDir: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1px",
        cursor: "pointer",
        border: "1px solid oklch(0 0 0 / 0.22)",
        transitionProperty: "transform, background-color, box-shadow",
        transitionDuration: "150ms",
        transitionTimingFunction: "token(easings.out)",
        _active: { transform: "translateY(1px) scale(0.95)" },
        _disabled: {
          opacity: 0.4,
          cursor: "default",
          filter: "grayscale(0.7)",
          boxShadow: "none",
        },
      })}
      style={{
        background: props.accent
          ? "var(--colors-accent)"
          : props.sel
            ? "var(--colors-paper)"
            : "oklch(0.94 0.025 88 / 0.9)",
        color: props.accent ? "var(--colors-accent-ink)" : "var(--colors-ink)",
        "box-shadow": props.sel
          ? "0 0 0 2px var(--colors-accent)"
          : "0 2px 0 oklch(0.25 0.05 60 / 0.25)",
      }}
    >
      <ActionIcon name={props.icon} size={24} />
      <span
        class={css({
          fontSize: "9px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1,
          opacity: 0.75,
        })}
      >
        {props.short ?? props.label.split(" ")[0]}
      </span>
      <Show when={props.badge != null}>
        <span
          class={css({
            position: "absolute",
            top: "-5px",
            right: "-4px",
            minW: "17px",
            textAlign: "center",
            background: "token(colors.ink)",
            color: "token(colors.paper)",
            borderRadius: "full",
            fontWeight: 800,
            fontSize: "10px",
            padding: "0 4px",
            lineHeight: "17px",
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {props.badge}
        </span>
      </Show>
    </button>
  );
}

/** Icon + number stat for player cards. */
function Stat(props: { icon: string; n: number; title: string }) {
  return (
    <span
      title={props.title}
      class={css({ display: "inline-flex", alignItems: "center", gap: "3px" })}
    >
      <ActionIcon name={props.icon} size={14} />
      {props.n}
    </span>
  );
}

/** Small icon for a log entry's action kind. */
function LogIcon(props: { kind: string }) {
  const size = 13;
  switch (props.kind) {
    case "settle":
      return <ActionIcon name="settle" size={size} />;
    case "city":
      return <ActionIcon name="city" size={size} />;
    case "road":
      return <ActionIcon name="road" size={size} />;
    case "dev":
      return <ActionIcon name="dev" size={size} />;
    case "trade":
      return <ActionIcon name="trade" size={size} />;
    case "dice":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
          />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "robber":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M12 3 C8 3 7 7 7 10 L7 21 L17 21 L17 10 C17 7 16 3 12 3 Z" fill="currentColor" />
        </svg>
      );
    case "gain":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path
            d="M12 4 v10 m-4 -4 l4 4 l4 -4 M5 21 h14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    default:
      return <ActionIcon name="end" size={size} />;
  }
}

function Modal(props: ParentProps) {
  return (
    <div
      class={css({
        position: "fixed",
        inset: 0,
        background: "oklch(0.15 0.05 235 / 0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 10,
      })}
    >
      <div
        class={css({
          background: "token(colors.paper)",
          borderRadius: "card",
          border: "1px solid oklch(0 0 0 / 0.12)",
          padding: "20px",
          minW: "320px",
          maxW: "420px",
          display: "flex",
          flexDir: "column",
          gap: "12px",
          boxShadow: "0 8px 24px oklch(0 0 0 / 0.35)",
        })}
        style="animation: modal-in 180ms cubic-bezier(0.23,1,0.32,1); transform-origin: center"
      >
        {props.children}
      </div>
    </div>
  );
}

/** Inline bank trade, docked in the center of the action bar — no modal. */
function TradeDock() {
  const [give, setGive] = createSignal<ResourceType>("wood");
  const [get, setGet] = createSignal<ResourceType>("ore");
  const me = () => snapshot()?.players.find((p) => p.id === HUMAN_ID);
  const canTrade = () => (me()?.resources[give()] ?? 0) >= tradeRatio(give()) && get() !== give();
  return (
    <>
      <div class={css({ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <button
              type="button"
              class={btn({ sel: give() === r })}
              style="padding:5px 8px"
              disabled={(me()?.resources[r] ?? 0) < tradeRatio(r)}
              title={`Give ${tradeRatio(r)} ${r}`}
              onClick={() => setGive(r)}
            >
              <ResourceIcon type={r} size={24} />
              <b class={css({ fontSize: "12px" })}>{tradeRatio(r)}</b>
            </button>
          )}
        </For>
      </div>
      <span class={css({ fontSize: "18px", color: "token(colors.inkSoft)" })}>→</span>
      <div class={css({ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <button
              type="button"
              class={btn({ sel: get() === r })}
              style="padding:5px 8px"
              disabled={r === give()}
              onClick={() => setGet(r)}
            >
              <ResourceIcon type={r} size={24} />
            </button>
          )}
        </For>
      </div>
      <div class={css({ display: "flex", gap: "6px" })}>
        <button
          type="button"
          class={btn({ kind: "primary" })}
          style="padding:7px 12px;font-size:13px"
          disabled={!canTrade()}
          onClick={() => trade(give(), get(), tradeRatio(give()))}
        >
          Trade
        </button>
        <button
          type="button"
          class={btn({ kind: "ghost" })}
          style="color:var(--colors-ink-soft);padding:7px 10px"
          onClick={() => setTradeOpen(false)}
        >
          ✕
        </button>
      </div>
    </>
  );
}

function DiscardModal() {
  const [sel, setSel] = createSignal<Partial<Record<ResourceType, number>>>({});
  const me = () => snapshot()?.players.find((p) => p.id === HUMAN_ID);
  const total = () => RESOURCE_TYPES.reduce((n, r) => n + (me()?.resources[r] ?? 0), 0);
  const need = () => Math.floor(total() / 2);
  const picked = () => RESOURCE_TYPES.reduce((n, r) => n + (sel()[r] ?? 0), 0);
  const bump = (r: ResourceType, d: number) => {
    const have = me()?.resources[r] ?? 0;
    const cur = sel()[r] ?? 0;
    const next = Math.min(have, Math.max(0, cur + d));
    setSel({ ...sel(), [r]: next });
  };
  return (
    <Modal>
      <h2 class={modalTitle}>Discard {need()} cards</h2>
      <p class={css({ margin: 0, textAlign: "center", color: "token(colors.inkSoft)" })}>
        Picked {picked()} of {need()}
      </p>
      <div class={css({ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <div
              class={css({
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                border: "1px solid token(colors.line)",
                borderRadius: "ctrl",
                padding: "5px 8px",
                background: "token(colors.paperHi)",
              })}
            >
              <ResourceIcon type={r} size={20} />
              <span class={css({ fontSize: "13px" })}>×{me()?.resources[r] ?? 0}</span>
              <button
                type="button"
                class={btn()}
                style="padding:2px 9px"
                onClick={() => bump(r, -1)}
              >
                −
              </button>
              <b class={css({ minW: "14px", textAlign: "center" })}>{sel()[r] ?? 0}</b>
              <button
                type="button"
                class={btn()}
                style="padding:2px 9px"
                onClick={() => bump(r, 1)}
              >
                +
              </button>
            </div>
          )}
        </For>
      </div>
      <button
        type="button"
        class={btn({ kind: "primary" })}
        disabled={picked() !== need()}
        onClick={() => discard(sel())}
      >
        Discard
      </button>
    </Modal>
  );
}

function CardModal(props: { kind: "yearOfPlenty" | "monopoly" }) {
  const [a, setA] = createSignal<ResourceType>("wood");
  const [b, setB] = createSignal<ResourceType>("brick");
  return (
    <Modal>
      <h2 class={modalTitle}>
        {props.kind === "monopoly" ? "Monopoly — take all of…" : "Year of Plenty — take…"}
      </h2>
      <div class={css({ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <button type="button" class={btn({ sel: a() === r })} onClick={() => setA(r)}>
              <ResourceIcon type={r} size={26} /> {r}
            </button>
          )}
        </For>
      </div>
      <Show when={props.kind === "yearOfPlenty"}>
        <p class={css({ margin: 0, textAlign: "center", color: "token(colors.inkSoft)" })}>and</p>
        <div
          class={css({ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" })}
        >
          <For each={RESOURCE_TYPES}>
            {(r) => (
              <button type="button" class={btn({ sel: b() === r })} onClick={() => setB(r)}>
                <ResourceIcon type={r} size={26} /> {r}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class={css({ display: "flex", gap: "8px", justifyContent: "center" })}>
        <button
          type="button"
          class={btn({ kind: "primary" })}
          onClick={() =>
            props.kind === "monopoly" ? pickMonopoly(a()) : pickYearOfPlenty(a(), b())
          }
        >
          Play
        </button>
        <button
          type="button"
          class={btn({ kind: "ghost" })}
          style="color:var(--colors-ink-soft)"
          onClick={() => setCardPick(null)}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
