# Catan

A Settlers-of-Catan-style board game — you vs three AI bots — built on SolidJS 2
(Vite+ toolchain, streaming SSR, server functions, Panda CSS).

**Play it: https://catan.darjs.dev**

Board-first tabletop UI: SVG island over raster terrain art, icon action dock,
structured game log, player stats, and full narrow-screen support.

## Run it

```bash
vp install
vp dev
```

Open the printed URL. A new game starts on load; you play against bots Ada,
Bruno, and Cleo.

## Persistence

Games survive reloads. Every mutation (human or bot) is recorded as an action
log in `localStorage` alongside the game's seed; on load the log replays onto a
fresh `Game`. Same seed + same actions = identical game, dice and robber steals
included. A failed replay quarantines the save under `catan:game:v3:failed`
rather than deleting it.

## Bot brains

Bots choose moves through TypeSafe AI's `typesafe-ai/jev` evaluation model,
called via Vercel AI Gateway. Jev isn't a chat model — it scores a shared
state against typed questions, so each bot turn is one `choice` evaluation
over the enumerated legal moves (see `src/game/moves.ts` and
`src/server/bot-ai.ts`). Jev bills per input token only (~$0.042/1M).

- https://typesafe.ai
- https://vercel.com/docs/ai-gateway

Add a gateway key to `.env` to enable it:

```
AI_GATEWAY_API_KEY=...
```

Without a key the server function returns null and bots play a priority
heuristic — the game works fully offline.

## Rules engine

Game state and rules come from the [`catan-game-engine`](https://github.com/JeFaisLeCafe/catan-game-engine)
npm package — setup snake draft, dice, building, bank/port trades, dev cards,
robber and discards, longest road, largest army. `src/game/controller.ts`
bridges it into Solid: `takeSnapshot` copies board Maps into a fresh
serializable snapshot each action, and the UI reads the snapshot signal.

Player-to-player trading is intentionally not implemented.

### Patched dependency

`patches/catan-game-engine@0.3.0.patch` (applied via pnpm
`patchedDependencies`) fixes two upstream issues:

- **Port vertex lookup** — upstream maps legacy `q_r_vN` ids to a format that
  never exists, so `vertex.port` was always null and every bank trade was 4:1.
  The patch resolves the legacy id through the canonical coordinate id, making
  2:1/3:1 ports work.
- **Nondeterministic RNG** — upstream rolled dice and picked stolen cards with
  `new SeededRandom(Date.now())`, which made replays diverge. The patch seeds
  every draw from the game seed plus a draw counter on state, so action-log
  replay is exact.

## Deploy

Cloudflare Workers via Wrangler (`wrangler deploy`), static assets through the
`ASSETS` binding, server functions for the Jev call.
