---
name: rune-sdk
description: "Use this skill for ANY task involving the Rune SDK — building, porting, or debugging multiplayer games for the Rune platform (rune.ai). Covers Rune.initLogic()/Rune.initClient(), the logic.js/client.js split, predict-rollback netcode and game state syncing, deterministic game logic restrictions (no Date/fetch/async/try-catch/eval/this/regex in logic.js), actions vs events, Rune.gameOver(), Rune.gameTime()/worldTime(), real-time games with update()/updatesPerSecond, reducing stutter via Rune.interpolator()/interpolatorLatency(), randomness with Math.random(), physics integration, persisted player data (game.persisted), joining/leaving/spectating, player info and avatars (Rune.getPlayerInfo), in-game text translation (Rune.t()), the Rune AI preview API (Rune.ai.promptRequest), the rune CLI (create/upload/extract-translations/update-info/update-members), playtesting/Dev UI, publishing, team collaboration, and the Creator Fund / making money. Trigger this skill whenever the user mentions Rune, rune-sdk, rune.ai, logic.js + client.js together, Rune.initLogic, Rune.actions, or asks how to make a game multiplayer on Rune — even if they don't say 'SDK' explicitly. This skill is generic SDK documentation and is not tied to any specific game project."
license: MIT
---

Rune is a multiplayer game **SDK**, not a game engine: you write game logic in a restricted, deterministic subset of JavaScript/TypeScript and render with whatever framework you like (plain JS, React, Vue, PixiJS, Svelte, WASM, or even Unity/Godot/Defold for rendering only). Rune handles netcode, servers, matchmaking, voice chat, and spectating via a custom **predict-rollback** framework: the same deterministic logic runs on every client and on the server, clients apply actions optimistically for snappy local feel, and the server is the source of truth that resolves conflicts via rollback.

## Quick Start

```sh
npx rune@latest create      # scaffold a working multiplayer Tic Tac Toe
npm run upload               # push it into the real Rune app to try with friends
```

A Rune game is always split into exactly two files:

```js
// logic.js — deterministic, synced across all clients + server
Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 2,
  setup: (allPlayerIds) => ({ cells: new Array(9).fill(null) }),
  actions: {
    claimCell: (cellIndex, { game, playerId }) => {
      if (game.cells[cellIndex]) throw Rune.invalidAction()
      game.cells[cellIndex] = playerId
      // ... check win condition, then Rune.gameOver({ ... })
    },
  },
})
```

```js
// client.js — rendering, can use any UI framework, runs locally only
Rune.initClient({
  onChange: ({ game, yourPlayerId, action }) => {
    // re-render UI to reflect game state — must be synchronous
  },
})

button.addEventListener("click", () => Rune.actions.claimCell(cellIndex))
```

**The single most important mental model:** `logic.js` is the only place allowed to mutate `game` state, it must be pure/deterministic (see Restrictions below), and it runs identically on every client *and* the server. `client.js` only reads state via `onChange` and calls `Rune.actions.*` — it never mutates `game` directly.

## A Note on `[TODO: CONFIRMER ...]` Markers

The reference files contain a handful of `[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION]` markers. These flag spots where the official Rune docs are thin, ambiguous, or silent on an exact behavior (not gaps in this skill's coverage of the docs — the docs themselves don't say). If a task touches one of these areas, don't guess or extrapolate silently: implement your best understanding, then actually test it in the Dev UI (`references/playtesting.md`) or ask the user to confirm the real behavior before relying on it further.

## Core Concepts (read the linked reference for depth)

| Concept | What it is | Reference |
|---|---|---|
| `setup()` | Builds the initial synced `game` state | `references/how-it-works.md` |
| `actions` | Player-triggered functions that mutate `game`, called via `Rune.actions.x()` | `references/how-it-works.md`, `references/api-reference.md` |
| `events` | Rune-triggered lifecycle hooks: `playerJoined`, `playerLeft`, `stateSync`, `update`, `timeSync` | `references/advanced-features.md` |
| `Rune.gameOver()` | Ends the game with a standardized popup (winners/losers/ties or scores) | `references/advanced-features.md` |
| `Rune.gameTime()` / `worldTime()` | Synchronized in-game clock / real-world clock | `references/advanced-features.md` |
| `update()` + `updatesPerSecond` | Interval-driven logic for real-time games (e.g. Pong-likes) | `references/advanced-features.md` |
| Interpolators | Smooth rendering across variable frame rate + network latency | `references/advanced-features.md` |
| `game.persisted` | Cross-session player data storage (≤100KB/player) | `references/advanced-features.md` |
| `Rune.t()` | Runtime string translation (en/pt/ru/es) | `references/how-it-works.md`, `references/publishing.md` |
| `Rune.ai.promptRequest` | Preview LLM API fed to GPT-4o mini | `references/advanced-features.md` |

## Critical Restrictions (logic.js)

Because `logic.js` runs on every client **and** the server and must produce byte-identical results everywhere, Rune forbids in that file: mutating anything outside function scope, `async`/`await`, `try`/`catch` (throwing is fine), `eval`, `this`, non-deterministic built-ins (`Date`, `fetch`), and regular expressions. `Math.random()` is the one exception — Rune patches it to be deterministic. The Rune CLI and its ESLint plugin warn about violations. Full explanation of *why* and *how* (down to the seeded PRNG and patched `Math` functions): `references/how-it-works.md` ("Server-Side Logic") and `references/examples-and-determinism.md`.

Hard numeric limits: max 10 actions/player/second · actions run `<10ms` and `<1MB` memory · `game` state `<1MB`, JSON-serializable · action payloads `<25KB` · `logic.js` file `<1MB` · `minPlayers`/`maxPlayers` between 1–4 · `updatesPerSecond` 1–30 · `inputDelay` 0–250ms · persisted data ≤100KB/player.

## When to Read Which Reference File

This skill mirrors the structure of the official Rune SDK docs (rune.ai/sdk). Don't load everything — jump to the file that matches the task:

- **`references/getting-started.md`** — first-time setup, the `npx rune@latest create` flow, what `logic.js`/`client.js` do at a beginner level.
- **`references/how-it-works.md`** — the mental model: predict-rollback syncing flow, the full `logic.js`/`client.js` contract, determinism restrictions and why they exist, player info/avatars, what kinds of games Rune supports, translating in-game text, and porting an existing (non-multiplayer) game to Rune.
- **`references/advanced-features.md`** — real-time games (`update`/`updatesPerSecond`, `gameTime`/`worldTime`, `timeSync`), randomness, physics engine integration, persisted player data, joining/leaving/spectating semantics, `Rune.gameOver()` in depth, reducing stutter with interpolators, and the AI preview API.
- **`references/playtesting.md`** — Dev UI / mock multiplayer simulation, testing inside the real Rune app, and the gameplay + technical best-practices checklists Rune reviewers look for.
- **`references/publishing.md`** — uploading/publishing, the Dev Dashboard, game title/description/preview image requirements, full `rune` CLI command reference, team collaboration/roles, and Creator Fund economics.
- **`references/api-reference.md`** — the complete flat API surface (every `Rune.*` function and every `initLogic`/`initClient` option with its exact signature). Reach for this when you need precise argument shapes rather than conceptual explanation.
- **`references/examples-and-determinism.md`** — links to official example games/tech demos on GitHub, plus a low-level technical deep dive (from Rune's engineering blog) on exactly how Rune patches JS `Math`/`Array.sort`/`Math.random` to be cross-platform deterministic. Read this when debugging a suspected desync or evaluating a physics engine for determinism.

## Typical Workflows

**Building a new game from scratch:** `getting-started.md` → sketch `setup`/`actions` per `how-it-works.md` → check `api-reference.md` for exact option shapes → playtest via Dev UI (`playtesting.md`) → `rune upload` (`publishing.md`).

**Porting an existing single-player game:** `how-it-works.md` ("Porting Existing Game") for the two setup approaches, then move all state-mutating logic into `logic.js` and check it against the determinism restrictions before anything else.

**Adding real-time movement / reducing visible jitter:** `advanced-features.md` ("Real-Time Games" then "Reducing Stutter") — implement without interpolation first, only add `Rune.interpolator()`/`interpolatorLatency()` if the Dev UI shows it's actually needed.

**Debugging a state desync between clients:** check the `logic.js` file against the restrictions list above and in `how-it-works.md`, then read `examples-and-determinism.md` for what specifically Rune patches (and thus what's *not* covered if you're calling into an external library outside the dependency whitelist).

**Getting ready to publish:** `playtesting.md` best-practices checklists (Rune reviewers check these) → `publishing.md` for the preview image spec, CLI commands, and team roles.
