# How It Works

Contents: Philosophy · Syncing Game State · Server-Side Logic · Player Info · Supported Games · Translating In-Game Text · Porting Existing Game

## Philosophy

Source: https://rune.ai/sdk/how-it-works/philosophy

Rune wants to enable millions of developers to build multiplayer games played by a massive community, by handling netcode, servers, voice chat, matchmaking, spectating, etc., and otherwise staying out of the way.

The SDK lets you write game logic in JavaScript/TypeScript and use **any** HTML5-compatible rendering framework/library for UI + graphics — pure JS, React, Vue, PixiJS, Svelte, custom WASM-compiled code, or even game engines like Unity, Godot, or Defold for rendering. Rune is deliberately an SDK, not a game engine, to stay flexible.

Rune synchronizes game state using a custom **predict-rollback** framework: the game is simulated in parallel on all clients and the server, so it stays snappy for local inputs even on high-latency mobile connections. The server-authoritative approach also resolves conflicts via rollback — e.g. if two players shoot each other, the server decides who shot first and rolls back the action for whoever got shot; that player is informed their action was rolled back so the game can reflect it.

Questions/suggestions go to the Rune Discord: https://discord.gg/rune-ai

Related pages: "Syncing Game State", "Server-Side Logic", "Randomness" (`advanced-features.md`), API Reference (`api-reference.md`).

---

## Syncing Game State

Source: https://rune.ai/sdk/how-it-works/syncing-game-state

Explains, via the Tic Tac Toe example, how game state syncs across players using Rune's predict-rollback netcode.

### Separation into Game Logic and Rendering

Multiplayer games are split into game logic and rendering, which lets Rune run dedicated servers with only game logic.

**Game Logic** — lives in a single file, `logic.js`, initialized via `Rune.initLogic()` with `minPlayers`, `maxPlayers`, `setup`, and `actions`.

- `minPlayers`/`maxPlayers` bound how many players the logic needs to consider; everything outside that range is handled by Rune (e.g. extra people become spectators automatically — see "Joining and Leaving" in `advanced-features.md`).
- `setup` returns the initial `game` state (synced across players) and receives the `players` argument (info about players at game start).
- `actions` are functions a player can call to modify game state. An action receives a payload object plus `{ game, playerId }` (the player who performed it).
- **Only `logic.js` can modify `game` state.** `setup` and `actions` must be pure functions: no reading/writing anything outside their own function definition.

```js
Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 2,
  setup: () => {
    return {
      cells: Array(9).fill(null),
      lastPlayerTurn: undefined, // Allow either player to start
    }
  },
  actions: {
    markCell: ({ cellId }, { game, playerId }) => {
      // Check it's not the other player's turn and unmarked cell
      if (game.lastPlayerTurn !== playerId || game.cells[cellId]) {
        throw Rune.invalidAction()
      }
      game.cells[cellId] = playerId
      game.lastPlayerTurn = playerId

      const winner = isVictoryOrDraw(game)
      if (winner !== undefined) {
        Rune.gameOver()
      }
    },
  },
})
```

**Rendering** — lives in `client.js`, calling `Rune.initClient` with an `onChange` callback. Every time an action fires, `onChange` is called with read-only info (old/new state, the action/event, players, etc.) to update animations, graphics, UI, sound. `onChange` is guaranteed to always be called, even on laggy clients.

`client.js` also binds UI to actions, e.g. tapping a cell calls `Rune.actions.markCell({ cellId })`.

```js
const onChange = ({
  previousGame,
  game,
  action,
  event,
  players,
  yourPlayerId,
  rollbacks,
}) => {
  // TODO: Update animations, graphics, UI, sound effects
}

Rune.initClient({ onChange })
```

### High-Level Game Syncing Flow

1. A client performs an action (e.g. clicking a cell). It optimistically updates local `game` state by calling the action function and calls `onChange` to update graphics.
2. The action is immediately sent to the server, which runs the same action function — checking validity and whether the game ends.
3. If valid, the server updates its groundtruth `game` state and broadcasts the action to all clients. If invalid, it's ignored.
4. Each client (including the one who sent it) computes the new `game` state from the action payload + the matching `actions` function. Sending just the action (not the whole state) is cheap bandwidth-wise. The sender also gets the same action payload back as acknowledgement.

### Restrictions

- Game logic must be written in a restricted subset of JavaScript — see "Server-Side Logic" below. The client-side renderer can use anything.
- Max **10 actions per player per second**.
- Actions must be **synchronous**, execute in **<10 ms**, consume **<1 MB** memory.
- The `onChange` function must be **synchronous**. It may trigger async functions, but cannot `await` them.
- The `game` state must be **<1 MB**; any `action` payload must be **<25 KB**.
- The `game` state must be **JSON-serializable** (no classes/functions/self-references).
- `logic.js` must be **<1 MB** total (it's fetched by the server and run inside a VM).

More on why predict-rollback is necessary: `api-reference.md`/"Server-Side Logic" below. See "Supported Games" in this file for what's buildable under these constraints.

### StateSync Event

Rune games must support initializing at any moment, since a player/spectator can join at any time (start, mid-match, after game over). This uses the `stateSync` event, also fired on restart, reconnect after disconnect, or crash recovery.

If your game is fully reactive (always re-renders from `onChange`'s `game` argument), you don't need to worry about `stateSync`. If it has side effects, you need to specifically handle it.

Test by adding players/spectators joining at various times — see "Simulating Multiplayer" in `playtesting.md`.

### Detecting Game Restart

When a new game session starts (game start, restart, new player connecting to an ongoing game), `onChange` is called with the `stateSync` event carrying `isNewGame: true` — useful for initializing assets/UI/state for a new game.

---

## Server-Side Logic

Source: https://rune.ai/sdk/how-it-works/server-side-logic

Rune uses a **server-authoritative** approach to keep games smooth and prevent cheating: your `logic.js` runs on every client **and** on Rune's servers (see "Syncing Game State" above). To guarantee everyone sees the same thing, Rune restricts what you can write in `logic.js`.

The primary goal is **determinism**: running the code multiple times with the same input must produce the same result. The main sources of non-determinism are things like `Date.now()` and shared state (counters, cache variables).

The Rune SDK checks your code for unsafe patterns, including:

- Mutation/assignment of variables outside the current function scope
- `async`/`await` syntax (logic must be synchronous)
- `try`/`catch` syntax (can interfere with SDK logic — `throw`ing is still allowed)
- `eval` (potentially harmful, could bypass other rules)
- `this` keyword (classes could have hidden side effects)
- Non-deterministic runtime built-ins such as `Date` and `fetch`
- Regular expressions (they are stateful)

**Notable exception:** `Math.random()` — Rune makes it deterministic (see "Randomness" in `advanced-features.md`).

The Rune CLI warns about potentially unsafe code when uploading. See `examples-and-determinism.md` for the deeper technical explanation of *how* Rune patches JS to be deterministic (Math precision, seeded PRNG, deterministic sort).

### Why This Approach (Deterministic Code)?

All modern multiplayer engines use predict-rollback netcode with deterministic physics/logic (e.g. Rocket League, Mortal Kombat). It's extremely bandwidth-efficient — only action payloads are sent, not full game state — and lets clients simulate ahead of the server, enabling real-time games even over bad mobile connections. This only works because the exact same deterministic logic runs on both clients and server.

### External Dependencies

You can import external libraries (e.g. for physics or pathfinding) into your game logic. Many libraries have side effects that violate the constraints above, so Rune maintains a list of known-supported libraries:
https://github.com/rune/rune/blob/staging/packages/vite-plugin-rune/src/dependency-whitelist.ts

Using an unlisted library triggers a CLI warning during development. If you successfully build and upload with it, Rune asks that you contribute it to that whitelist.

### Editor Integration (ESLint plugin)

Rune has an ESLint plugin that flags unsafe code directly in your editor. Already configured if you used `npx rune@latest create`. Otherwise, add it to `eslint.config.mjs`:

```js
import runePlugin from "rune-sdk/eslint.js"

export default [
   //other config
   ...runePlugin.configs.recommended,
]
```

By default the plugin lints files named `logic.js`/`logic.ts` or files inside a `logic` folder. To lint additional files explicitly:

```js
import runePlugin from "rune-sdk/eslint.js"

export default [
  {
    files: ["**/logic.ts", "**/logic.js"],
    ...runePlugin.configs.logicModuleConfig,
  },
]
```

ESLint plugin source: https://github.com/rune/rune/tree/staging/packages/eslint-plugin-rune

---

## Player Info

Source: https://rune.ai/sdk/how-it-works/player-info

Shows each player's name/avatar inside your game.

### Getting Player Info

`onChange` receives an `allPlayerIds` array (IDs of all players currently playing). Use `Rune.getPlayerInfo(playerId)` to get:

- `displayName: string`
- `avatarUrl: string`
- `playerId: string` (same as the key you passed, for convenience)

Passing the ID of a player no longer in the game still returns placeholder info.

### Avatars

Every Rune player has a personalized avatar you can reuse in your game: players recognize which friend controls which character, it's easy to show players in UI/leaderboards, and it's consistent with other Rune games. A placeholder avatar image is available for use while the real one loads over the network (right-click → save from the docs page).

### Your Player ID

`onChange` provides the current client's player ID as `yourPlayerId` — pass it to `getPlayerInfo()` for your own info.

**Important:** `yourPlayerId` is `undefined` if the client is a spectator.

---

## Supported Games

Source: https://rune.ai/sdk/how-it-works/supported-games

You can build any game that follows the overall game guidelines (`syncing-game-state` restrictions above) and server-side logic guidelines. Rune handles netcode, servers, voice chat, matchmaking, etc. — you focus on the game.

### Examples of Supported Games

- Tic Tac Toe, Chess, Connect Four, Battleships, and other board games
- 8 Ball Pool, Golf Around!, Football Tactics & Glory, and other turn-based sports games
- Crosswords, Sudoku, and other co-op games with simultaneous playing
- Catan, Yahtzee, Monopoly and other strategy games with randomness
- Pet Simulator, Powerwash Simulator, The Game of Life, and other simulation games
- Worms World Party, Bowmasters, and other physics-based games
- Codenames, Guess Who, Werewolf, and other party games
- SimCity, Age of Empires, Tetris, Plants vs. Zombies and other strategy games
- Cookie Clicker, Egg Inc, Tap Titans, and other idle games
- Snake, Bomberman, Pac-Man, and other fast-paced arcade games

Pretty much any multiplayer game is possible with Rune.

### Roadmap (as published)

- Networked 3D physics
- Continuous SDK optimization and expanding server presence for lower CPU usage / latency

---

## Translating In-Game Text

Source: https://rune.ai/sdk/how-it-works/translating-game-text

Rune has a global audience, so keep in-game text minimal and prefer visual elements. When text is unavoidable, use `Rune.t()` to render it translated into the player's language.

### Identifying Text to Translate

In client code only (not `logic.js`, not raw HTML), wrap strings with `Rune.t()`:

```js
innerMessageElement.textContent = Rune.t("Extra Move!")
```

Translations are **statically extracted**, so passing a variable instead of a string literal does not work.

**Incorrect:**
```js
const youWon = "You Won"
innerMessageElement.textContent = Rune.t(youWon)
```

**Correct:**
```js
const youWon = Rune.t("You Won")
innerMessageElement.textContent = youWon
```

#### Using Interpolated Values

Add placeholders and pass values as a second argument:

```js
Rune.t("You gained {{ score }} points", {
  score: numericScore.toLocaleString(),
})
```

### Extracting Text to Translate

```bash
npx rune@latest extract-translations
```

Finds all `Rune.t()` calls and inserts/updates a `<script id="rune-translation-data" type="application/json">` tag in the `<head>` of `index.html`, with entries for the 4 most widely used Rune languages:

```html
<script id="rune-translation-data" type="application/json">
  {
    "en": { "(You)": "", "tap to play": "" },
    "es": { "(You)": "", "tap to play": "" },
    "pt": { "(You)": "", "tap to play": "" },
    "ru": { "(You)": "", "tap to play": "" }
  }
</script>
```

This script tag must appear **above** where the Rune SDK is loaded in `index.html` for translations to load.

### Filling In Translations

Currently supported languages: **English, Portuguese, Russian, Spanish**.

The extraction command generates a JSON structure with empty-string values per key; fill them in manually, via translation software, or by handing the JSON to an LLM. Re-running the extraction command afterward preserves filled-in translations, only adding new keys / removing keys no longer referenced.

Example before/after for Spanish:

```json
"es": { "(You)": "", "tap to play": "" }
```
```json
"es": { "(You)": "(Tú)", "tap to play": "toca para jugar" }
```

Once filled in, use the Dev UI (`playtesting.md`) to switch languages via the dropdown and verify.

### Important

Only English, Portuguese, Russian, and Spanish translations are currently supported by Rune.

---

## Porting Existing Game

Source: https://rune.ai/sdk/how-it-works/existing-game

Two approaches to adapt an existing game for multiplayer on Rune.

### Approach 1: Rune Template (recommended)

Handles boilerplate and gives you Rune-specific ESLint & Vite plugins out of the box.

```sh
npx rune@latest create
```

This scaffolds an example game with logic + rendering files. Copy your existing game logic and rendering code into `logic.ts` and `client.ts` respectively. See `getting-started.md` for an intro to these files, or the "Syncing Game State" section above for depth.

Enable ESLint in your editor — the template already ships the necessary config.

### Approach 2: Manual Setup

Requires care, especially with TypeScript or a bundler, since you must end up exporting a `logic.js` file.

1. Create `logic.js` with all game logic, calling `Rune.initLogic()` (see `getting-started.md` → "Game Logic").
2. Create `client.js` responsible for rendering, calling `Rune.initClient()` (see `getting-started.md` → "Rendering & Inputs").
3. Load the SDK before any other script in `index.html`, followed by the two files:

```html
<script src="https://cdn.jsdelivr.net/npm/rune-sdk@4/multiplayer-dev.js"></script>
<script src="./logic.js"></script>
<script src="./client.js"></script>
```

4. Set up Rune's ESLint plugin (see "Server-Side Logic" → "Editor Integration" above).
5. Move all game logic into `logic.js`; make `client.js` import all rendering code.

Reference example: Tic Tac Toe manual setup — https://github.com/rune/rune/tree/staging/examples/tic-tac-toe

### Questions?

Ask on the Rune Discord: https://discord.gg/rune-ai
