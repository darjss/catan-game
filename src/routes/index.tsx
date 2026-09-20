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
import Board from "../components/Board";
import {
  HUMAN_ID,
  botThinking,
  buyDevCard,
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
  robberPick,
  rollDice,
  setCardPick,
  setPendingBuild,
  setTradeOpen,
  snapshot,
  trade,
  tradeOpen,
  tradeRatio,
} from "../game/controller";
import { RESOURCE_TYPES, type ResourceType } from "../game/model";
import { DieFace, ResourceIcon } from "../assets/art";
import { palette } from "../palette";

const CARD_NAMES: Record<string, string> = {
  knight: "Knight",
  roadBuilding: "Road Building",
  yearOfPlenty: "Year of Plenty",
  monopoly: "Monopoly",
  victoryPoint: "Victory Point",
};

const btn = cva({
  base: {
    font: "inherit",
    fontWeight: 700,
    borderRadius: "ctrl",
    padding: "8px 12px",
    cursor: "pointer",
    border: "1px solid token(colors.line)",
    background: "token(colors.paperHi)",
    color: "token(colors.ink)",
    transitionProperty: "transform, background-color, box-shadow",
    transitionDuration: "150ms",
    transitionTimingFunction: "token(easings.out)",
    _hover: { background: "token(colors.paper)" },
    _active: { transform: "scale(0.96)" },
    _disabled: { opacity: 0.45, cursor: "default" },
  },
  variants: {
    kind: {
      plain: {},
      primary: {
        background: "token(colors.accent)",
        color: "token(colors.accentInk)",
        borderColor: "token(colors.accentDeep)",
        _hover: { background: "token(colors.accentDeep)" },
      },
      ghost: {
        background: "transparent",
        borderColor: "transparent",
        color: "token(colors.inkSoft)",
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

const panel = css({
  background: "token(colors.paper)",
  borderRadius: "card",
  padding: "12px 14px",
  boxShadow: "0 4px 14px oklch(0 0 0 / 0.18)",
});

export default function Home() {
  onSettled(() => {
    newGame();
  });

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
  // Dice tumble into the tray on every roll — WAAPI so identical rolls replay.
  createEffect(
    () => snapshot()?.turn.diceRoll,
    (r) => {
      if (!r) return;
      document.querySelectorAll("[data-dice] > *").forEach((el, i) =>
        el.animate(
          [
            { transform: "translateY(-14px) rotate(-18deg) scale(0.85)", opacity: 0 },
            { transform: "translateY(2px) rotate(4deg) scale(1.02)", opacity: 1, offset: 0.6 },
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
    if (!rolled()) return "Your turn — roll the dice";
    const pb = pendingBuild();
    if (pb === "knight") return "Knight: tap a hex for the robber";
    if (pb === "roadBuilding1") return "Road Building: tap an edge for road 1";
    if (pb === "roadBuilding2") return "Road Building: tap an edge for road 2";
    if (pb) return `Tap a glowing ${pb === "road" ? "edge" : "spot"} to build — or cancel below`;
    return "Your turn — build, trade, or end turn";
  };

  return (
    <main
      class={css({
        maxW: "1280px",
        margin: "0 auto",
        padding: "16px 20px 40px",
        minH: "100vh",
        display: "flex",
        flexDir: "column",
      })}
    >
      <Title>Catan</Title>
      <header
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "14px",
          marginBottom: "14px",
        })}
      >
        <h1
          class={css({
            margin: 0,
            fontSize: "26px",
            fontWeight: 900,
            color: "token(colors.paper)",
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: "9px",
          })}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <polygon
              points="12,2 21,7 21,17 12,22 3,17 3,7"
              fill={palette.accent}
              stroke="oklch(1 0 0 / 0.4)"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          Catan
        </h1>
        <p
          class={css({
            flex: 1,
            margin: 0,
            fontSize: "14px",
            fontWeight: 700,
            color: "token(colors.ink)",
            background: "token(colors.paper)",
            borderRadius: "full",
            padding: "7px 16px",
            textAlign: "center",
            boxShadow: "0 2px 8px oklch(0 0 0 / 0.15)",
          })}
        >
          <Show when={myTurn()} fallback={prompt()}>
            <span
              class={css({
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "full",
                background: "token(colors.accent)",
                marginRight: "8px",
                verticalAlign: "baseline",
              })}
            />
            {prompt()}
          </Show>
        </p>
        <button
          type="button"
          class={btn({ kind: "ghost" })}
          style="color: var(--colors-paper); opacity: 0.85"
          onClick={() => newGame()}
        >
          New game
        </button>
      </header>

      <div
        class={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 320px" },
          gap: "16px",
          alignItems: "start",
        })}
      >
        <section
          class={css({
            borderRadius: "20px",
            padding: "6px",
            boxShadow: "0 6px 24px oklch(0 0 0 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.15)",
          })}
        >
          <Show
            when={snapshot()}
            fallback={
              <p
                class={css({ padding: "40px", textAlign: "center", color: "token(colors.paper)" })}
              >
                Setting up the island…
              </p>
            }
          >
            {(s) => (
              <Board
                snap={s()}
                legal={legal()}
                onVertex={clickVertex}
                onEdge={clickEdge}
                onTile={clickTile}
              />
            )}
          </Show>
        </section>

        <aside class={css({ display: "flex", flexDir: "column", gap: "12px", minH: 0 })}>
          <section class={css({ display: "flex", flexDir: "column", gap: "8px" })}>
            <For each={snapshot()?.players}>
              {(p) => {
                const active = () => current()?.id === p.id;
                const thinking = () => botThinking() === p.name;
                return (
                  <div
                    class={panel}
                    style={{
                      border: `2px solid ${active() ? (PLAYER_DOT[p.id] ?? palette.accent) : "transparent"}`,
                      padding: "10px 14px",
                      transform: active() ? "translateY(-1px)" : "none",
                      "box-shadow": active()
                        ? "0 8px 20px oklch(0 0 0 / 0.28)"
                        : "0 4px 14px oklch(0 0 0 / 0.18)",
                      transition: "border-color 200ms, transform 200ms, box-shadow 200ms",
                    }}
                  >
                    <div
                      class={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      })}
                    >
                      <span
                        class={css({
                          width: "12px",
                          height: "12px",
                          borderRadius: "full",
                          flexShrink: 0,
                        })}
                        style={{ background: PLAYER_DOT[p.id] ?? palette.inkSoft }}
                      />
                      <span class={css({ fontWeight: 800, flex: 1 })}>
                        {p.name}
                        <Show when={thinking()}>
                          <span class={css({ color: "token(colors.inkSoft)" })}> thinking…</span>
                        </Show>
                      </span>
                      <span
                        class={css({
                          fontWeight: 900,
                          fontSize: "17px",
                          color: "token(colors.accent)",
                          fontVariantNumeric: "tabular-nums",
                        })}
                      >
                        {p.victoryPoints} VP
                      </span>
                    </div>
                    <div
                      class={css({
                        display: "flex",
                        gap: "10px",
                        fontSize: "13px",
                        color: "token(colors.inkSoft)",
                        marginTop: "4px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      })}
                    >
                      <Show
                        when={p.id === HUMAN_ID}
                        fallback={
                          <span>
                            {RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0)} cards
                          </span>
                        }
                      >
                        <For each={RESOURCE_TYPES}>
                          {(r) => (
                            <span
                              class={css({
                                display: "inline-flex",
                                gap: "3px",
                                alignItems: "center",
                              })}
                            >
                              <ResourceIcon type={r} size={15} />
                              {p.resources[r]}
                            </span>
                          )}
                        </For>
                      </Show>
                      <Show when={p.devCards.filter((c) => !c.playedThisTurn).length > 0}>
                        <span>{p.devCards.filter((c) => !c.playedThisTurn).length} dev</span>
                      </Show>
                      <Show when={p.hasLongestRoad}>
                        <span class={css({ fontWeight: 700, color: "token(colors.accent)" })}>
                          longest road
                        </span>
                      </Show>
                      <Show when={p.hasLargestArmy}>
                        <span class={css({ fontWeight: 700, color: "token(colors.accent)" })}>
                          largest army
                        </span>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </section>

          <Show when={snapshot()?.turn.diceRoll}>
            {(d) => (
              <div
                data-dice
                class={panel}
                style={{
                  display: "flex",
                  gap: "10px",
                  "justify-content": "center",
                  padding: "12px",
                }}
              >
                <DieFace value={d()[0]} size={44} />
                <DieFace value={d()[1]} size={44} />
              </div>
            )}
          </Show>

          <Show when={myTurn() && phase() === "main"}>
            <section class={css({ display: "flex", flexDir: "column", gap: "8px" })}>
              <Show when={!rolled()}>
                <button
                  type="button"
                  class={btn({ kind: "primary" })}
                  style="width:100%;padding:13px;font-size:17px"
                  onClick={rollDice}
                >
                  Roll dice
                </button>
              </Show>
              <Show when={rolled()}>
                <div
                  class={css({
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                  })}
                >
                  <button
                    type="button"
                    class={btn({ sel: pendingBuild() === "road" })}
                    onClick={() => setPendingBuild(pendingBuild() === "road" ? null : "road")}
                  >
                    Road
                  </button>
                  <button
                    type="button"
                    class={btn({ sel: pendingBuild() === "settlement" })}
                    onClick={() =>
                      setPendingBuild(pendingBuild() === "settlement" ? null : "settlement")
                    }
                  >
                    Settlement
                  </button>
                  <button
                    type="button"
                    class={btn({ sel: pendingBuild() === "city" })}
                    onClick={() => setPendingBuild(pendingBuild() === "city" ? null : "city")}
                  >
                    City
                  </button>
                  <button type="button" class={btn()} onClick={buyDevCard}>
                    Dev card
                  </button>
                  <button type="button" class={btn()} onClick={() => setTradeOpen(true)}>
                    Trade
                  </button>
                  <button type="button" class={btn({ kind: "primary" })} onClick={endTurn}>
                    End turn
                  </button>
                </div>
                <Show
                  when={me()?.devCards.some((c) => !c.playedThisTurn && c.type !== "victoryPoint")}
                >
                  <div class={css({ display: "flex", flexWrap: "wrap", gap: "6px" })}>
                    <For
                      each={me()!.devCards.filter(
                        (c) => !c.playedThisTurn && c.type !== "victoryPoint",
                      )}
                    >
                      {(c) => (
                        <button
                          type="button"
                          class={btn()}
                          style="font-size:13px;padding:5px 10px"
                          onClick={() => playCard(c.type)}
                        >
                          {CARD_NAMES[c.type]}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={pendingBuild()}>
                  <button
                    type="button"
                    class={btn({ kind: "ghost" })}
                    onClick={() => setPendingBuild(null)}
                  >
                    Cancel
                  </button>
                </Show>
              </Show>
            </section>
          </Show>

          <section
            class={panel}
            style={{
              "font-size": "13px",
              color: "var(--colors-inkSoft)",
              "max-height": "240px",
              "overflow-y": "auto",
              display: "flex",
              "flex-direction": "column-reverse",
            }}
          >
            <For each={log()}>{(line) => <div class={css({ padding: "2px 0" })}>{line}</div>}</For>
          </section>
        </aside>
      </div>

      {/* robber target picker */}
      <Show when={robberPick()}>
        {(pick) => (
          <Modal>
            <h2 class={modalTitle}>Steal from whom?</h2>
            <For each={pick().targets}>
              {(t) => (
                <button type="button" class={btn()} onClick={() => pickRobberTarget(t.id)}>
                  {t.name} ({RESOURCE_TYPES.reduce((n, r) => n + (t.resources[r] ?? 0), 0)} cards)
                </button>
              )}
            </For>
            <button
              type="button"
              class={btn({ kind: "ghost" })}
              onClick={() => pickRobberTarget(undefined)}
            >
              No one
            </button>
          </Modal>
        )}
      </Show>

      <Show when={tradeOpen()}>
        <TradeModal />
      </Show>
      <Show when={mustDiscard()}>
        <DiscardModal />
      </Show>
      <Show when={cardPick()}>{(kind) => <CardModal kind={kind()} />}</Show>

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

const PLAYER_DOT: Record<string, string> = palette.player;

const modalTitle = css({ margin: 0, fontSize: "19px", fontWeight: 800 });

function Modal(props: ParentProps) {
  return (
    <div
      class={css({
        position: "fixed",
        inset: 0,
        background: "oklch(0 0 0 / 0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 10,
      })}
    >
      <div
        class={css({
          background: "token(colors.paper)",
          borderRadius: "card",
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

function TradeModal() {
  const [give, setGive] = createSignal<ResourceType>("wood");
  const [get, setGet] = createSignal<ResourceType>("ore");
  const me = () => snapshot()?.players.find((p) => p.id === HUMAN_ID);
  const canTrade = () => (me()?.resources[give()] ?? 0) >= tradeRatio(give()) && get() !== give();
  return (
    <Modal>
      <h2 class={modalTitle}>Trade with the bank</h2>
      <div class={css({ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <button
              type="button"
              class={btn({ sel: give() === r })}
              disabled={(me()?.resources[r] ?? 0) < tradeRatio(r)}
              onClick={() => setGive(r)}
            >
              <ResourceIcon type={r} /> {tradeRatio(r)}:1
            </button>
          )}
        </For>
      </div>
      <p class={css({ margin: 0, textAlign: "center", color: "token(colors.inkSoft)" })}>for</p>
      <div class={css({ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" })}>
        <For each={RESOURCE_TYPES}>
          {(r) => (
            <button
              type="button"
              class={btn({ sel: get() === r })}
              disabled={r === give()}
              onClick={() => setGet(r)}
            >
              <ResourceIcon type={r} />
            </button>
          )}
        </For>
      </div>
      <div class={css({ display: "flex", gap: "8px", justifyContent: "center" })}>
        <button
          type="button"
          class={btn({ kind: "primary" })}
          disabled={!canTrade()}
          onClick={() => trade(give(), get(), tradeRatio(give()))}
        >
          Trade {tradeRatio(give())} {give()} for 1 {get()}
        </button>
        <button type="button" class={btn({ kind: "ghost" })} onClick={() => setTradeOpen(false)}>
          Cancel
        </button>
      </div>
    </Modal>
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
              <ResourceIcon type={r} size={15} />
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
              <ResourceIcon type={r} /> {r}
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
                <ResourceIcon type={r} /> {r}
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
        <button type="button" class={btn({ kind: "ghost" })} onClick={() => setCardPick(null)}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
