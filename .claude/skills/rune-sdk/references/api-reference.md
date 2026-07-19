# API Reference

Source: https://rune.ai/sdk/reference/api-reference

Rune methods for writing multiplayer games. The SDK splits into two parts:

- **Game logic** — must live in a file called `logic.js`
- **UI integration** — can live anywhere; the docs refer to it as `client.js`

## Game Logic

### `Rune.initLogic(options)`

Call directly at the top level of `logic.js`. Contains all logic to control game state and handle player lifecycle events. All options except `events` are required.

```js
// logic.js
Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: (allPlayerIds) => {
    const scores = {}
    for (let playerId of allPlayerIds) {
      scores[playerId] = 0
    }
    return { scores, currentPlayerIndex: 0, currentPlayerStartedAt: 0 }
  },
  actions: {
    myAction: (payload, { game, playerId, allPlayerIds }) => {
      if (game.currentPlayer !== allPlayerIds[game.currentPlayerIndex]) {
        throw Rune.invalidAction()
      }
      game.scores[playerId]++
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % allPlayerIds.length
      game.currentPlayerStartedAt = Rune.gameTime()
      if (isVictoryOrDraw(game)) {
        Rune.gameOver({ everyone: 100 })
      }
    },
  },
  events: {
    playerJoined: (playerId, { game }) => {
      game.scores[playerId] = 0
    },
    playerLeft: (playerId, { game }) => {
      delete game.scores[playerId]
    },
  },
  update: ({ game, allPlayerIds }) => {
    if ((Rune.gameTime() - game.currentPlayerStartedAt) / 1000 > 30) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % allPlayerIds.length
      game.currentPlayerStartedAt = Rune.gameTime()
    }
  },
  updatesPerSecond: 10,
  inputDelay: 30,
  landscape: false,
  persistPlayerData: false,
})
```

#### `minPlayers: number`

Minimum players required, 1–4. See `advanced-features.md` → "Joining and Leaving" → "Minimum and Maximum Players".

#### `maxPlayers: number`

1–4, must be ≥ `minPlayers`. If below 4, extra room members become spectators. See same section as above.

#### `setup(allPlayerIds: string[]): any`

Returns the initial game state (synced across players). Receives `allPlayerIds` — the players present at game start.

#### `actions: { [string]: (payload, { game: object, playerId: string, allPlayerIds: string[] }) => void}`

Functions exposed to the UI layer, callable as `Rune.actions.myAction(payload)`. Responsible for validating the action (`Rune.invalidAction()`), mutating `game`, and ending the game (`Rune.gameOver()`) when appropriate.

#### `events: { playerJoined? | playerLeft?: (playerId: string, { game: any, allPlayerIds: string[] }) => void }` *(optional)*

By default a game ends when a player leaves. Define `playerJoined`/`playerLeft` to support dynamic joins/leaves — see `advanced-features.md` → "Joining and Leaving".

#### `ai: { promptResponse: ({requestId: string, response: string }) => void }` *(optional, preview API)*

Called when an AI prompt has been processed. See `advanced-features.md` → "AI".

#### `update({game: object, allPlayerIds: string[]}) => void` *(optional)*

Executed on an interval (default: every second). See `advanced-features.md` → "Real-Time Games" → "Update Function".

#### `updatesPerSecond?: number`

How often `update` runs. Allowed: 1–30. Default: 1. See `advanced-features.md` → "Real-Time Games".

#### `inputDelay?: number`

Milliseconds a user action is delayed before running locally. Allowed: 0–250. Default: 25. Higher values mean players stay more in sync (fewer rollbacks) but feel less snappy locally.

#### `landscape?: boolean`

Set `true` for landscape orientation. A game is either portrait or landscape, not both.

#### `persistPlayerData?: boolean`

Enables storing player data across sessions. See `advanced-features.md` → "Persisted Data".

#### `reactive?: boolean`

Default `true`. Setting to `false` improves game logic performance but disables referential equality in the `game` state passed to `onChange`.

### `Rune.invalidAction()`

Throw this inside an action handler to reject an action the player shouldn't be allowed to take — cancels the action and rolls back any local optimistic updates. Completely safe to use throughout your game.

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game, playerId }) => {
      if (!isValidAction(payload)) {
        throw Rune.invalidAction()
      }
    },
  },
})
```

Reference usage: Tic Tac Toe example — https://github.com/rune/rune/blob/staging/examples/tic-tac-toe/logic.js

### `Rune.gameOver(options)`

Call when the game has ended — Rune overlays a standardized game-over popup; you don't need to build your own. See `advanced-features.md` → "Game Over" for full guide.

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game }) => {
      if (isGameOver(game)) {
        const winner = getWinner(game)
        const loser = getLoser(game)
        Rune.gameOver({
          players: {
            [winner.playerId]: "WON",
            [loser.playerId]: "LOST",
          },
          delayPopUp: true,
        })
      }
    },
  },
})
```

**Only one of `players` and `everyone` may be provided at the same time.**

- **`players: Record<string, "WON" | "LOST" | "TIE" | number>`** — game result keyed by player ID: `WON`/`LOST`/`TIE`, or an integer score (higher is better). Cannot mix WON/LOST/TIE with scores. Every player present when the game ends must be included.
- **`everyone: "WON" | "LOST" | "TIE" | number`** — same result for every player. A score value shows a team-score game-over popup.
- **`minimizePopUp?: boolean`** — show the popup minimized as a small bottom bar (for a custom end-game UI).
- **`delayPopUp?: boolean`** — don't show the popup until `Rune.showGameOverPopUp()` is called client-side.

### `Rune.gameTime()`

Milliseconds elapsed since game start. See `advanced-features.md` → "Real-Time Games" → "Game Time".

### `Rune.worldTime()`

Milliseconds since epoch, 1-second precision. See `advanced-features.md` → "Real-Time Games" → "World Time".

### `Rune.ai.promptRequest({ messages: [{ role: string, content: string | { type: "image_data" | "text", image_url?: string, text?: string }}] })` *(preview API)*

Sends a generative AI request. See `advanced-features.md` → "AI".

```js
Rune.ai.promptRequest({ messages: [{ role: "user", content: "Who are you" }] })
```

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — preview-only API; production availability, rate limits, and pricing aren't finalized in the source docs (see `advanced-features.md` → "AI" → "Rate Limiting and Costs"). Confirm current status before depending on it.

## Client

### `Rune.initClient(options)`

Call once your game is fully ready to render — but don't start actual gameplay until `onChange` fires.

```js
// client.js
Rune.initClient({
  onChange: ({
    game,
    previousGame,
    futureGame,
    yourPlayerId,
    players,
    allPlayerIds,
    action,
    event,
    rollbacks,
  }) => {
    render(game)
  },
})
```

#### `onChange: () => void` — argument fields

- **`game: object`** — current game state; update the UI to reflect it.
- **`previousGame: object`** — previous game state; usually ignorable, useful for detecting specific value changes.
- **`futureGame?: object`** — predicted future state; only present if the game uses `update`. Used for interpolation — see `advanced-features.md` → "Reducing Stutter".
- **`yourPlayerId?: string`** — the current user's player ID; `undefined` if they're a spectator.
- **`players: Record<string, { playerId: string, displayName: string, avatarUrl: string }>`** — *Deprecated.* Use `allPlayerIds` + `Rune.getPlayerInfo` instead.
- **`allPlayerIds?: string[]`** — IDs of all current players.
- **`action?: { name: string, playerId: string, params: any }`** — present if this update was triggered by a `Rune.actions.*` call; usually ignore this and rely on `game` instead.
- **`event?: { name: string, params: any }`** — possible events: `playerJoined`, `playerLeft`, `stateSync`, `update`, `timeSync`.
- **`ai?: { name: string, params: any }`** *(preview API)* — possible callback: `promptResponse`.

### `Rune.actions.*(payload)`

Every function passed in `actions` to `Rune.initLogic()` is exposed here as `Rune.actions.myActionName`. **This is the only way to update game state** in a way that propagates to every player. Call with a single argument of any type (an object is recommended).

```js
// client.js
button.onClick = () => {
  Rune.actions.markCell({ myId: "button" })
}
```

### `Rune.showGameOverPopUp()`

Call in `client.js` to show the game-over popup when you passed `delayPopUp: true` to `Rune.gameOver()`.

### `Rune.showInvitePlayers()`

Opens the invite modal inside the Rune app — useful for incentivizing players to invite friends.

### `Rune.showShareImage(image)`

Opens the image-share modal in the Rune app, for sharing to apps like WhatsApp/Twitter. The image must be a **base64-encoded PNG containing the Rune logo** (so people know where the game came from) — generate it via canvas.

### `Rune.gameTime()`

Same as the logic-side function — milliseconds since game start. See `advanced-features.md` → "Real-Time Games" → "Game Time".

### `Rune.worldTime()`

Same as the logic-side function — ms since epoch, 1-second precision. See `advanced-features.md` → "Real-Time Games" → "World Time".

### `Rune.getPlayerInfo(playerId)`

Returns `{ displayName, avatarUrl, playerId }` for a player. Works even for players no longer in the game (returns placeholder info).

### `Rune.timeSinceLastUpdate()`

Milliseconds elapsed since the last `update` call — useful for smoothly rendering timers or interpolating between two positions.

### `Rune.msPerUpdate`

How many milliseconds between `update` calls. Only present if the game uses `update`.

### `Rune.interpolator()`

Returns an interpolator instance for smoothing fast-moving positions across variable frame rates. See `advanced-features.md` → "Reducing Stutter".

### `Rune.interpolatorLatency()`

Returns an interpolator instance tuned for smoothing other players' latency-affected movements. See `advanced-features.md` → "Reducing Stutter".

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — the source docs never give a full parameter/return-type signature for either interpolator function beyond the `{ maxSpeed }` option seen in one example. Treat any assumption about additional options or exact units as unverified until tested in the Dev UI.

### `Rune.t(stringToTranslate, optionalValuesToInterpolate)`

Returns the string translated into the player's language at runtime, if available; otherwise renders `stringToTranslate` as-is. Reference values from the second argument using `{{ }}` in the string:

```js
Rune.t("Your Score is {{ score }}", { score: numericScore.toLocaleString() })
```

See `how-it-works.md` → "Translating In-Game Text" for the full extraction/translation workflow. Must be called with a string literal (not a variable) since translations are statically extracted.
