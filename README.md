# Catan

A simple Settlers-of-Catan-style game — you vs two AI bots — built on SolidJS 2
(Vite+ toolchain, streaming SSR, server functions).

## Run it

```bash
vp install
vp dev
```

Open the printed URL. A new game starts on load; you play blue against bots
Ada and Bruno.

## Bot brains

Bots choose moves through TypeSafe AI's `typesafe-ai/jev` evaluation model,
called via Vercel AI Gateway. Jev isn't a chat model — it scores a shared
state against typed questions, so each bot turn is one `choice` evaluation
over the enumerated legal moves (see `src/game/moves.ts` and
`src/server/bot-ai.ts`). Jev bills per input token only (~$0.042/1M).

Add a gateway key to `.env` to enable it:

```
AI_GATEWAY_API_KEY=...
```

Without a key the server function returns null and bots play a priority
heuristic — the game works fully offline.

## Rules engine

Game state and rules come from the `catan-game-engine` npm package —
setup snake draft, dice, building, bank/port trades, dev cards, robber and
discards, longest road, largest army. `src/game/controller.ts` bridges it
into Solid: the engine mutates board objects in place, so `takeSnapshot`
copies tiles/vertices/edges to fresh identities each action (keyed `<For>`
diffs on identity).

Player-to-player trading is intentionally not implemented.

### Patched dependency

`patches/catan-game-engine@0.3.0.patch` fixes the engine's port vertex
lookup — upstream maps legacy `q_r_vN` ids to a format that never exists,
so `vertex.port` was always null and every bank trade was 4:1. The patch
resolves the legacy id through the canonical coordinate id, making 2:1/3:1
ports work.
