# Advanced Features

Contents: Real-Time Games · Randomness · Physics · Persisted Data · Joining and Leaving · Game Over · Reducing Stutter · AI

## Real-Time Games

Source: https://rune.ai/sdk/advanced/real-time-games

Rune synchronizes clocks across clients + server, making time-based logic easy. Get synchronized time with `Rune.gameTime()` or `Rune.worldTime()`, and build fast-paced games with an `update()` loop running many times per second.

### Game Time

`Rune.gameTime()` returns milliseconds passed since the start of the game, with 1-second precision by default — fine for most casual games. Example: tracking how long a player took to answer.

```javascript
// logic.js
function allPlayersDone(game) { /* ... */ }
function setNewQuestionAndAnswer(game) { /* ... */ }

Rune.initLogic({
  setup: (allPlayerIds) => {
    return {
      scores: Object.fromEntries(allPlayerIds.map((id) => [id, 0])),
      roundStartAt: 0,
      question: "A group of otters is called what?",
      correctAnswer: "A raft",
    }
  },
  actions: {
    guess: ({ answer }, { game, playerId }) => {
      if (answer === game.correctAnswer) {
        const timeTaken = Rune.gameTime() - game.roundStartAt
        game.scores[playerId] += Math.max(30 - timeTaken, 0)
      }
      if (allPlayersDone(game)) {
        game.roundStartAt = Rune.gameTime()
        setNewQuestionAndAnswer(game)
      }
    },
  },
})
```

### World Time

`Rune.worldTime()` returns a real-world timestamp (ms since Jan 1, 1970), 1-second precision — useful for daily challenges / time-based events, e.g. detecting a holiday window:

```javascript
Rune.initLogic({
  setup: () => {
    return {
      holidaysEvent:
        Rune.worldTime() > new Date(2024, 11, 20).getTime() &&
        Rune.worldTime() < new Date(2025, 0, 7).getTime(),
    }
  },
})
```

Or tracking time since a player last played:

```javascript
function initPersistPlayer(game, playerId) {
  if (Object.keys(game.persisted[playerId]).length === 0) {
    game.persisted[playerId] = { gameLastPlayedAt: Rune.worldTime() }
  }
}

Rune.initLogic({
  persistPlayerData: true,
  setup: (allPlayerIds, { game }) => {
    allPlayerIds.forEach((playerId) => {
      initPersistPlayer(game, playerId)
      const msSinceLastGame = Rune.worldTime() - game.persisted[playerId].gameLastPlayedAt
      const timeInMinutesSinceLastGame = Math.floor(msSinceLastGame / 1000 / 60)
      // Do something with timeInMinutesSinceLastGame (daily rewards, restore energy)
    })
    return {/* ... */}
  },
  update: ({ game }) => {
    allPlayerIds.forEach((playerId) => {
      game.persisted[playerId].gameLastPlayedAt = Rune.worldTime()
    })
  },
})
```

More examples: Rune's time tech demo — https://github.com/rune/rune/tree/staging/tech-demos/world-time

### Update Function

Provide an `update` function in `logic.js` to run logic on an interval. When state changes there, `onChange` in `client.js` fires with an `update` event. Example — pass the turn after 30s of inactivity:

```javascript
Rune.initLogic({
  update: ({ game }) => {
    if (Rune.gameTime() - game.roundStartAt > 30) {
      game.roundStartAt = Rune.gameTime()
      setNewQuestionAndAnswer(game)
    }
  },
})
```

By default `update` runs once per second — fine for most party games. Fast games (e.g. a Paddle/Pong clone updating ball + paddle positions) need a higher rate via `updatesPerSecond`:

```javascript
Rune.initLogic({
  update: ({ game }) => {
    game.ballPosition += game.ballSpeed
    // ... remaining game logic
  },
  updatesPerSecond: 30,
})
```

`update` runs synchronized across all clients and the server; only actions are sent over the network, keeping real-time games bandwidth-efficient even on mobile. Stuttering can still occur due to latency/frame-rate variance — see "Reducing Stutter" below.

### The `timeSync` Event

Network packets can be delayed. If the server executes an action at a different game time than the client's optimistic guess, and that difference matters to game state, the originating client receives an `onChange` call with a `timeSync` event to reconcile.

Example: `logic.js` records `clickedAt: Rune.gameTime()` on a `click` action.

- Player A clicks at game-time second 4 → sees `game.clickedAt = 4` optimistically.
- Server processes it at second 5.
- All clients learn the action executed at second 5.
- Player A's `onChange` fires again with `timeSync` to reconcile: both players end up with `game.clickedAt = 5` (server holds the truth).

### Further Reading

- Pinpoint example game's use of time: https://github.com/rune/rune/blob/staging/examples/pinpoint/src/logic.ts
- "Reducing Stutter" (below) for fast-paced games

---

## Randomness

Source: https://rune.ai/sdk/advanced/randomness

**TLDR:** just use `Math.random()`.

Randomness (e.g. rolling a die in Yahtzee) introduces two problems: true randomness is **not deterministic**, incompatible with Rune's distributed state model; and true randomness with optimistic updates **opens the door to cheating** by sophisticated players.

### Deterministic Random

Rune implements a deterministic pseudorandom number generator: the server tells each client how to compute "random" numbers, and verifies for every action that the client generated them the told way. This preserves fast optimistic updates while making cheating hard, since each client only knows how to generate its own numbers, not others'.

### Things to Keep in Mind

You can keep using `Math.random()` as normal in the vast majority of cases, with two caveats:

**Keep all shared state in `logic.js`.** Only code called from within `Rune.initLogic()`/`logic.js` gets the deterministic random. Any initialization/generation code must run in `setup()` so all players see the same result.

**Shared random.** If randomness needs to be deterministic based on the *order* actions are taken (regardless of *who* took them):
- Set a shared random state in `setup()` using `Math.random()`, feeding your own number generator, or
- Generate all randomness-dependent state in `setup()` (e.g. the board of a collaborative Minesweeper).

See `examples-and-determinism.md` for the low-level technical explanation of how Rune patches `Math.random`, `Math.*` precision, and `Array.sort` to be deterministic.

---

## Physics

Source: https://rune.ai/sdk/advanced/physics

Physics in multiplayer is hard: you need fully cross-platform deterministic code, synchronized inputs, and rollback support. Real-time multiplayer games (see "Real-Time Games" above) with shared physics can be a lot of fun, though.

### Options

1. **Rune-compatible physics engines**, e.g. Propel.js (recommended) — https://github.com/kevglass/propel-js/
2. **Custom physics code** built specifically for the game
3. **Client-side physics** (not recommended)

### Rune-Compatible Physics Engines

Rune ensures any JS game logic is cross-platform deterministic via a set of rules (see `how-it-works.md` → "Server-Side Logic") and by patching non-deterministic functions (deep dive: `examples-and-determinism.md`, sourced from https://developers.rune.ai/blog/making-js-deterministic-for-fun-and-glory/). A compatible engine like Propel.js benefits from this and stays deterministic/synced across clients and server.

### Custom Physics

Many successful games build custom physics/collision tailored to their exact scenarios — simpler, and free to be "fun" rather than physically correct. See the platformer tech demo for an example of building custom physics: `examples-and-determinism.md`.

### Client-Side Physics

Possible by running physics locally per client and syncing only the inputs, relying on the physics engine being deterministic across JS engines/platforms. **Not recommended** — complicated and prone to desyncs between clients.

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — the source docs stop at this high level (pick Propel.js, roll your own, or don't) and give no worked example of collision/bounce logic for a specific game shape (e.g. a ball/puck bouncing off walls and paddles). If a task needs real collision code, prototype it and verify determinism/no-desync behavior with multiple simulated clients in the Dev UI rather than assuming it just works.

---

## Persisted Data

Source: https://rune.ai/sdk/advanced/persisted-data

Many games benefit from storing player data across sessions (map progress, items, etc). Rune makes this easy.

Enable it via `persistPlayerData: true` in `Rune.initLogic()`:

```js
Rune.initLogic({
  persistPlayerData: true,
  // ... remaining arguments
})
```

### Storing Player Data

Store data per player in `game.persisted[playerId]`. `game.persisted` is always available and contains all active players; each has an object you can store arbitrary (incl. deeply nested) data in. Anything stored there persists regardless of game end, restart, or the player leaving.

Example — incrementing session count:

```js
Rune.initLogic({
    persistPlayerData: true,
    setup: (allPlayerIds, { game }) => {
        for (const playerId of allPlayerIds) {
            game.persisted[playerId].sessionCount = (game.persisted[playerId].sessionCount || 0) + 1
        }
        // ... remaining setup code
    },
    playerJoined: (playerId, { game }) => {
      // update count for any players joining during the game
      game.persisted[playerId].sessionCount = (game.persisted[playerId].sessionCount || 0) + 1
    },
    // ... remaining arguments
})
```

You can also modify `game.persisted` inside actions and the `update()` loop — e.g. collecting/using a health potion:

```js
Rune.initLogic({
  persistPlayerData: true,
  actions: {
    pickUpItem: (droppedItemId, { game, playerId }) => {
      game.persisted[playerId].inventory.push(game.droppedItems[droppedItemId])
    },
    useItem: (inventoryId, { game, playerId }) => {
      game.persisted[playerId].inventory[inventoryId] = undefined
      game.playerHealth[playerId] += 100
    },
  },
  // ... remaining arguments
})
```

Unused persisted items (e.g. an unused health potion) automatically carry over into the player's next session. Persisted data is capped at **100 KB of JSON-serializable data per player**.

### Backwards Compatibility

Rune persists data forever, across game versions — a player may show up in `game.persisted` with 1-year-old data from many versions ago. Recommended: use TypeScript, keep types used in old versions around, and assume any persisted key can be `undefined` in your logic. **Be very careful that your game doesn't break on old data.**

### Testing Persistence

The Dev UI (`playtesting.md` → "Simulating Multiplayer") lets you view/manipulate `game.persisted` to test cross-session behavior — e.g. set one player to level 99 and verify a fresh level-1 player joining still works.

Also playtest in the app: an unpublished game version loads persisted data from the last *published* version (if any), but never writes new data — so a broken draft can't corrupt real player data.

### TypeScript Support

Provide a `Persisted` type to `RuneClient`:

```typescript
type Persisted = {
  sessionCount: number
  inventory: Item[]
}

declare global {
  const Rune: RuneClient<GameState, GameActions, Persisted>
}
```

### Example Games

- Cube Rush stores best time achieved — https://github.com/rune/rune/tree/staging/examples/cube-rush
- Sudoku stores play sessions to decide onboarding — https://github.com/rune/rune/tree/staging/examples/sudoku
- Pinpoint stores play sessions to decide onboarding — https://github.com/rune/rune/tree/staging/examples/pinpoint

### Future Plans (as published)

Rune plans to add automatic leaderboards (score submission) and achievements players can show off on their profile.

---

## Joining and Leaving

Source: https://rune.ai/sdk/advanced/joining-leaving

Handles variable player counts, join/leave, etc. By default Rune auto-handles this (extra room members become spectators, etc.); games can opt into richer handling.

### Events

Rune `events` are triggered by room changes (as opposed to `actions`, always game-initiated). Current events: `playerJoined`, `playerLeft`, `stateSync`, `update`, `timeSync` (`update`/`timeSync` covered in `advanced-features.md` → "Real-Time Games").

Whenever an event fires, `onChange` is called with `event` as a parameter so the game can visually reflect the change. The game can optionally provide `playerJoined`/`playerLeft` callbacks in `logic.js` to also mutate game state on those events.

| | Actions | Events |
| --- | --- | --- |
| Defined and called by | Game Dev | Rune |
| Quantity | Any number | Predefined (currently 5) |
| Update game state? | Yes | If using optional callback |
| Might be rolled back? | Yes | No |

### Spectating

Rooms often have more people than a game's `maxPlayers`; the rest become spectators. Spectators:

- Run the same game code as everyone else, i.e. get `onChange` calls on new actions/events
- Cannot perform any actions (enforced by the SDK)
- Do not trigger `playerJoined`/`playerLeft` events
- Are not included in the `players` argument to `onChange`
- Are shown differently in the room UI
- Have `yourPlayerId: undefined` in `onChange`

So the number of "players" the SDK sees can be less than the number of users in the room — by design.

### Minimum and Maximum Players

`initLogic()` takes `minPlayers` (int, 1–4). The game can't start below this. If a player leaves and the count drops below `minPlayers`, the game ends — if a `playerLeft` callback is provided, it may declare a winner among remaining players via `Rune.gameOver()`. (Providing `playerLeft` is required anyway to support players leaving mid-game — see below.)

`maxPlayers` works similarly at the top end — anyone joining beyond it becomes a spectator.

### Supporting Players Joining Midgame

Some games (e.g. card games like Hearts, where cards are dealt at the start) can't sensibly admit a new player mid-hand — by default, late joiners become spectators until restart/new game. Other games (collaborative crosswords, an open-world exploration game) are fine with dynamic joins.

Provide a `playerJoined` callback in `initLogic()` to opt in and initialize per-player state on join, e.g.:

```jsx
Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: (allPlayerIds) => {
    const scores = {}
    for (playerId in allPlayerIds) {
      scores[playerId] = 0
    }
    return { scores }
  },
  actions: /* ... */,
  events: {
    playerJoined: (playerId, { game }) => {
      game.scores[playerId] = 0
    }
  }
})
```

### Supporting Players Leaving Midgame

By default, Rune ends the game if a player leaves; players can then restart or pick another game.

Provide a `playerLeft` callback in `initLogic()` to instead "clean up" state and let the game continue for remaining players — e.g. skip a departed player's turn in turn-based games.

A player only counts as "left" once they leave the room — a broken connection gets a **30-second** reconnect grace period, so temporary connectivity loss doesn't end the game.

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — without a `playerLeft` callback, the docs say the game "ends" but don't describe exactly what the remaining player sees (does the default game-over popup appear automatically, and with what result — a tie? undefined?). Test this directly in the Dev UI by dropping a simulated player before assuming a specific UI outcome.

### Moving to Spectator and Back

An active player can choose to become a spectator (e.g. to step away) — this triggers `playerLeft` and removes them from the game. They can rejoin later via the UI (if the game supports dynamic joins and isn't at `maxPlayers`) — rejoining triggers `playerJoined`, starting fresh like any new player.

---

## Game Over

Source: https://rune.ai/sdk/advanced/game-over

Call `Rune.gameOver(options)` when your game ends to tell Rune, which then overlays a standardized game-over popup — you don't need to build your own "game over" screen (unless you want a custom one, see "Minimizing Game Over Popup").

The popup content depends on the options: whether the game has winners/losers, or assigns each player a score.

### Coop Games

For a shared goal/outcome across all players, use `everyone`:

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game }) => {
      Rune.gameOver({ everyone: 300 })
    },
  },
})
```

### Winners, Losers And Ties

Rune supports any combination of winners/losers/ties — single, many, or everyone winning/losing/tying. The UI adapts based on whether the current viewer is a winner, loser, tie, or spectator.

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
        })
      }
    },
  },
})
```

### Player Scores

If the game assigns each player a score, Rune shows a leaderboard in the popup, highlighting the current player. The highest score wins.

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game, allPlayerIds }) => {
      if (isGameOver(game)) {
        Rune.gameOver({
          players: {
            [allPlayerIds[0]]: 21981,
            [allPlayerIds[1]]: 8911,
            [allPlayerIds[2]]: 20109,
            [allPlayerIds[3]]: 323,
          },
        })
      }
    },
  },
})
```

**Only one of `players` and `everyone` may be provided at a time.** Mixing `WON`/`LOST`/`TIE` with numeric scores within `players` is not allowed. All players present in the game when it ends must be included in `players`.

### Minimizing Game Over Popup

Pass `minimizePopUp: true` to force the popup to start minimized as a small bottom bar — useful if you're building a custom end-game screen.

### Delaying Game Over Popup

Pass `delayPopUp: true` to stop Rune from showing the popup immediately — e.g. to let an end-game animation play or the final state be seen first. Call `Rune.showGameOverPopUp()` in `client.js` when ready. If you never call it, Rune shows the popup automatically after a few seconds anyway.

---

## Reducing Stutter

Source: https://rune.ai/sdk/advanced/reducing-stutter

Applies to fast-paced multiplayer games running an `update` loop many times per second. Most games (including most real-time games) **don't need this** — build first, add interpolation only if it turns out to be necessary. See "Real-Time Games" above and "Full Games" examples for inspiration on simpler cases first.

### Rendering At Variable Frame Rate

Example: Paddle updates ball/paddle position many times per second via `update` + `updatesPerSecond`:

```javascript
Rune.initLogic({
  update: ({ game }) => {
    game.ballPosition += game.ballSpeed
    // ... remaining game logic
  },
  updatesPerSecond: 30,
})
```

The update loop runs at a **fixed tick rate**, but devices render at varying frame rates depending on power/game intensity. To render smoothly at a variable frame rate, interpolate positions of fast-moving `game`-state objects between `update` calls.

Example: `updatesPerSecond: 10` (state updates every 100ms). Ball at position 0 at t=0ms, position 10 at t=100ms. If the phone renders at t=60ms, it should show position 6 (60% of the way).

Rune exposes `futureGame` — the game state after one more `update()` run, i.e. a glimpse into the future — and `Rune.interpolator()`, which computes the ball's position at any point in time between `game` and `futureGame`:

```javascript
const ballInterpolator = Rune.interpolator()

function onChange({ game, futureGame }) {
  ballInterpolator.update({
    game: game.ballPosition,
    futureGame: futureGame.ballPosition,
  })
}

function render() {
  const ballPosition = ballInterpolator.getPosition()
  // ... draw the ball using the game's graphics engine
}

Rune.initClient({ onChange })
```

Some scenarios shouldn't interpolate into the future — e.g. when a point is scored in Paddle and the ball resets, don't blend toward the "future" pre-reset position. Skip calling `update()` on the interpolator in that case:

```javascript
// Replaces function in previous code block
function onChange({ game, futureGame }) {
  if (game.totalScore === futureGame.totalScore) {
    ballInterpolator.update({
      game: game.ballPosition,
      futureGame: futureGame.ballPosition,
    })
  }
}
```

### Interpolating Other Players' Movements

Network latency means you'll receive other players' actions some time after they happened — if they move fast, you need to interpolate their positions client-side (`client.js`) for smoothness.

**First implement without interpolation. Test in the Dev UI whether it's actually needed before adding this complexity.**

Example Paddle setup:

```javascript
Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 2,
  updatesPerSecond: 30,
  setup: (allPlayerIds) => {
    const paddles = [
      { position: START_POSITION, speed: 0 },
      { position: START_POSITION, speed: 0 },
    ]
    const players = [
      { id: allPlayerIds[0], score: 0 },
      { id: allPlayerIds[1], score: 0 },
    ]
    return { paddles, players, totalScore: 0 }
  },
  update: ({ game }) => {
    for (let i = 0; i < 2; i++) {
      game.paddles[i].position += game.paddles[i].speed
      if (game.paddles[i].position < 0) {
        game.paddles[i].position = 0
        game.paddles[i].speed = 0
      }
      if (game.paddles[i].position + PADDLE_WIDTH > GAME_WIDTH) {
        game.paddles[i].position = 0
        game.paddles[i].speed = 0
      }
    }
    // ... remaining game logic
  },
  actions: {
    // ... player inputs to move paddles by changing paddle speed
  },
})
```

Because of latency, the opponent paddle's `position` in `game` can jump around. Without interpolation it'd teleport. Use `Rune.interpolatorLatency({ maxSpeed })` to smoothly move the rendered position toward the true position over time; `getPosition()` also accounts for variable frame-rate rendering (see previous section), covering both concerns in one call:

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — the source docs never spell out the unit/scale of `maxSpeed` (position-units per update tick? per second? per ms?), nor whether `interpolator()`/`interpolatorLatency()` accept any options beyond what's shown in these examples. Verify empirically in the Dev UI before tuning this for a real game.

```javascript
import { playerSpeed } from "./logic.js"

let opponentInterpolator = Rune.interpolatorLatency({ maxSpeed: playerSpeed })

function onChange({ game, futureGame, yourPlayerId }) {
  const opponent = game.players.findIndex((p) => p.id !== yourPlayerId)
  opponentInterpolator.update({
    game: game.paddles[opponent].position,
    futureGame: futureGame.paddles[opponent].position,
  })
}

function render() {
  const opponentPosition = opponentInterpolator.getPosition()
  // ... draw the opponent's paddle using the game's graphics engine
}

Rune.initClient({ onChange })
```

Some scenarios need an *immediate* jump with no interpolation — e.g. paddle positions reset when a point is scored. Detect this by comparing `game` to `previousGame` (state as of the last `onChange` call), then call `moveTo()` on the interpolator, which also zeroes its internal speed:

```javascript
function onChange({ previousGame, game }) {
  const opponent = game.players.findIndex((p) => p.id !== yourPlayerId)
  if (previousGame.totalScore < game.totalScore) {
    opponentInterpolator.moveTo(game.paddles[opponent].position)
  }
}
```

### Demo and Example Game

Full Paddle example code: https://github.com/rune/rune/blob/staging/examples/paddle

---

## AI

Source: https://rune.ai/sdk/advanced/ai

**This is a preview API for developers to test only. Production use is coming soon.**

Rune provides an API for submitting LLM prompts based on user actions, with responses fed back into game logic — useful for fun, surprising gameplay powered by generative AI.

### Using AI in Your Game

Call `Rune.ai.promptRequest` (see `api-reference.md`) with a list of messages. Under the hood this is fed to **GPT-4o mini** via OpenAI. The response comes back through the `ai.promptResponse` callback.

#### Simple Text Prompts

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game }) => {
      Rune.ai.promptRequest({
        messages: [{ role: "user", content: "What is Rune.ai?" }],
      })
    },
  },
  ai: {
    promptResponse: ({ requestId, response }) => {
      console.log(response)
    },
  },
})
```

Message `role` maps to the OpenAI API convention (https://platform.openai.com/docs/guides/completions) — both `user` and `system` roles are supported.

#### Conversational Prompts

The AI API is **stateless** — pass the full message history each request to maintain context. Store prompts/responses in game state:

```js
// logic.js
Rune.initLogic({
  setup: () => ({ messages: [] }),
  actions: {
    myAction: (payload, { game }) => {
      const message = { role: "user", content: payload.userQuestion }
      game.messages.push(message)
      Rune.ai.promptRequest({ messages: game.messages })
    },
  },
  ai: {
    promptResponse: ({ requestId, response }, { game }) => {
      console.log(response)
      game.messages.push({ role: "assistant", content: response })
    },
  },
})
```

#### Image-Based Prompts

Images must be passed as **data URIs** — external URLs are not supported:

```js
// logic.js
Rune.initLogic({
  actions: {
    myAction: (payload, { game }) => {
      const dataUri = /* Generate data URI, e.g., from canvas */
      Rune.ai.promptRequest({
        messages: [
          { role: "user", content: { type: "text", text: "What is Rune.ai?" } },
          { role: "user", content: { type: "image_data", image_url: dataUri } },
        ],
      })
    },
  },
  ai: {
    promptResponse: ({ requestId, response }) => {
      console.log(response)
    },
  },
})
```

### What Makes a Good Prompt

1. **Be explicit** — define clear boundaries to avoid unexpected behavior, e.g.: *"You are a cow. You may only respond with the word 'Moo' or slight variations. Do not answer in human language or about topics a cow wouldn't know."*
2. **Provide examples** — include input/output examples and anti-examples.
3. **Use ratings, not yes/no** — e.g. *"Rate the player's interest in the conversation on a scale of 1 to 10."*
4. **Favor unstructured output** — avoid asking for structured JSON for now; ask for a specific plain format and parse the result.
5. **Animate during prompts** — responses take time; add animation/visual feedback to keep players engaged.
6. **Account for player behavior** — players will probe the limits of your AI; anticipate and define acceptable behavior in the prompt.

### Rate Limiting and Costs

**Preview API, free during testing.** In production, AI API usage will deduct Rune credits from Creator Fund earnings (see `publishing.md` → "Making Money").

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — the entire `Rune.ai.*` surface is marked preview-only in the source docs (no rate limits, no production pricing, no guarantee the underlying model stays GPT-4o mini). Before building a feature that depends on it, confirm with the user whether it's actually enabled/stable for their use case — don't assume it behaves the same as documented once "production use" ships.
