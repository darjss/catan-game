import { Title } from "@solidjs/meta";
import { For, Show, createMemo, createSignal, onSettled } from "solid-js";
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
  isBot,
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
import { RESOURCE_ICON, RESOURCE_TYPES, type ResourceType } from "../game/model";

const CARD_NAMES: Record<string, string> = {
  knight: "Knight",
  roadBuilding: "Road Building",
  yearOfPlenty: "Year of Plenty",
  monopoly: "Monopoly",
  victoryPoint: "Victory Point",
};

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
    <main class="game">
      <Title>Catan</Title>
      <header class="topbar">
        <h1>Catan</h1>
        <p class="prompt">{prompt()}</p>
        <button type="button" class="ghost" onClick={() => newGame()}>
          New game
        </button>
      </header>

      <div class="layout">
        <section class="board-wrap">
          <Show when={snapshot()} fallback={<p class="loading">Setting up the island…</p>}>
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

        <aside class="sidebar">
          <section class="players">
            <For each={snapshot()?.players}>
              {(p) => (
                <div
                  class={{
                    player: true,
                    active: current()?.id === p.id,
                    thinking: botThinking() === p.name,
                  }}
                >
                  <span class="pname">
                    {p.name}
                    {isBot(p.id) ? " 🤖" : ""}
                  </span>
                  <span class="pvp">{p.victoryPoints} VP</span>
                  <span class="pmeta">
                    {p.id === HUMAN_ID
                      ? RESOURCE_TYPES.map((r) => `${RESOURCE_ICON[r]}${p.resources[r]}`).join(" ")
                      : `${RESOURCE_TYPES.reduce((n, r) => n + (p.resources[r] ?? 0), 0)} cards`}
                    {p.devCards.filter((c) => !c.playedThisTurn).length > 0 &&
                      ` · ⭐${p.devCards.filter((c) => !c.playedThisTurn).length}`}
                    {p.hasLongestRoad && " · 🛤 longest"}
                    {p.hasLargestArmy && " · ⚔ army"}
                  </span>
                </div>
              )}
            </For>
          </section>

          <Show when={snapshot()?.turn.diceRoll}>
            {(d) => (
              <div class="dice">
                <span>{d()[0]}</span>
                <span>{d()[1]}</span>
              </div>
            )}
          </Show>

          <Show when={myTurn() && phase() === "main"}>
            <section class="actions">
              <Show when={!rolled()}>
                <button type="button" class="primary" onClick={rollDice}>
                  Roll dice
                </button>
              </Show>
              <Show when={rolled()}>
                <div class="action-grid">
                  <button
                    type="button"
                    class={{ active: pendingBuild() === "road" }}
                    onClick={() => setPendingBuild(pendingBuild() === "road" ? null : "road")}
                  >
                    Road
                  </button>
                  <button
                    type="button"
                    class={{ active: pendingBuild() === "settlement" }}
                    onClick={() =>
                      setPendingBuild(pendingBuild() === "settlement" ? null : "settlement")
                    }
                  >
                    Settlement
                  </button>
                  <button
                    type="button"
                    class={{ active: pendingBuild() === "city" }}
                    onClick={() => setPendingBuild(pendingBuild() === "city" ? null : "city")}
                  >
                    City
                  </button>
                  <button type="button" onClick={buyDevCard}>
                    Dev card
                  </button>
                  <button type="button" onClick={() => setTradeOpen(true)}>
                    Trade
                  </button>
                  <button type="button" class="primary" onClick={endTurn}>
                    End turn
                  </button>
                </div>
                <Show
                  when={me()?.devCards.some((c) => !c.playedThisTurn && c.type !== "victoryPoint")}
                >
                  <div class="cards">
                    <For
                      each={me()!.devCards.filter(
                        (c) => !c.playedThisTurn && c.type !== "victoryPoint",
                      )}
                    >
                      {(c) => (
                        <button type="button" class="card" onClick={() => playCard(c.type)}>
                          ▶ {CARD_NAMES[c.type]}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={pendingBuild()}>
                  <button type="button" class="ghost" onClick={() => setPendingBuild(null)}>
                    Cancel
                  </button>
                </Show>
              </Show>
            </section>
          </Show>

          <section class="log">
            <For each={log()}>{(line) => <div>{line}</div>}</For>
          </section>
        </aside>
      </div>

      {/* robber target picker */}
      <Show when={robberPick()}>
        {(pick) => (
          <div class="modal-backdrop">
            <div class="modal">
              <h2>Steal from whom?</h2>
              <For each={pick().targets}>
                {(t) => (
                  <button type="button" onClick={() => pickRobberTarget(t.id)}>
                    {t.name} ({RESOURCE_TYPES.reduce((n, r) => n + (t.resources[r] ?? 0), 0)} cards)
                  </button>
                )}
              </For>
              <button type="button" class="ghost" onClick={() => pickRobberTarget(undefined)}>
                No one
              </button>
            </div>
          </div>
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
          <div class="modal-backdrop">
            <div class="modal">
              <h2>{w().id === HUMAN_ID ? "You win! 🎉" : `${w().name} wins`}</h2>
              <button type="button" class="primary" onClick={() => newGame()}>
                Play again
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={lastError()}>{(e) => <div class="toast">{e()}</div>}</Show>
    </main>
  );
}

function TradeModal() {
  const [give, setGive] = createSignal<ResourceType>("wood");
  const [get, setGet] = createSignal<ResourceType>("ore");
  const me = () => snapshot()?.players.find((p) => p.id === HUMAN_ID);
  const canTrade = () => (me()?.resources[give()] ?? 0) >= tradeRatio(give()) && get() !== give();
  return (
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Trade with the bank</h2>
        <div class="trade-row">
          <For each={RESOURCE_TYPES}>
            {(r) => (
              <button
                type="button"
                class={{ chip: true, sel: give() === r }}
                disabled={(me()?.resources[r] ?? 0) < tradeRatio(r)}
                onClick={() => setGive(r)}
              >
                {RESOURCE_ICON[r]} {tradeRatio(r)}:1
              </button>
            )}
          </For>
        </div>
        <p>for</p>
        <div class="trade-row">
          <For each={RESOURCE_TYPES}>
            {(r) => (
              <button
                type="button"
                class={{ chip: true, sel: get() === r }}
                disabled={r === give()}
                onClick={() => setGet(r)}
              >
                {RESOURCE_ICON[r]}
              </button>
            )}
          </For>
        </div>
        <div class="modal-actions">
          <button
            type="button"
            class="primary"
            disabled={!canTrade()}
            onClick={() => trade(give(), get(), tradeRatio(give()))}
          >
            Trade {tradeRatio(give())} {give()} for 1 {get()}
          </button>
          <button type="button" class="ghost" onClick={() => setTradeOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
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
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Discard {need()} cards</h2>
        <p>
          Picked {picked()} of {need()}
        </p>
        <div class="trade-row">
          <For each={RESOURCE_TYPES}>
            {(r) => (
              <div class="chip discard-chip">
                <span>
                  {RESOURCE_ICON[r]} ×{me()?.resources[r] ?? 0}
                </span>
                <button type="button" onClick={() => bump(r, -1)}>
                  −
                </button>
                <b>{sel()[r] ?? 0}</b>
                <button type="button" onClick={() => bump(r, 1)}>
                  +
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          class="primary"
          disabled={picked() !== need()}
          onClick={() => discard(sel())}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function CardModal(props: { kind: "yearOfPlenty" | "monopoly" }) {
  const [a, setA] = createSignal<ResourceType>("wood");
  const [b, setB] = createSignal<ResourceType>("brick");
  return (
    <div class="modal-backdrop">
      <div class="modal">
        <h2>{props.kind === "monopoly" ? "Monopoly — take all of…" : "Year of Plenty — take…"}</h2>
        <div class="trade-row">
          <For each={RESOURCE_TYPES}>
            {(r) => (
              <button type="button" class={{ chip: true, sel: a() === r }} onClick={() => setA(r)}>
                {RESOURCE_ICON[r]} {r}
              </button>
            )}
          </For>
        </div>
        <Show when={props.kind === "yearOfPlenty"}>
          <p>and</p>
          <div class="trade-row">
            <For each={RESOURCE_TYPES}>
              {(r) => (
                <button
                  type="button"
                  class={{ chip: true, sel: b() === r }}
                  onClick={() => setB(r)}
                >
                  {RESOURCE_ICON[r]} {r}
                </button>
              )}
            </For>
          </div>
        </Show>
        <div class="modal-actions">
          <button
            type="button"
            class="primary"
            onClick={() =>
              props.kind === "monopoly" ? pickMonopoly(a()) : pickYearOfPlenty(a(), b())
            }
          >
            Play
          </button>
          <button type="button" class="ghost" onClick={() => setCardPick(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
