# Getting Started

Source: https://rune.ai/sdk/getting-started/quick-start

## Quick Start

Build a multiplayer game for the Rune platform and its millions of players. Rune handles netcode, servers, voice chat, matchmaking, spectating, and much more.

Get started by running:

```sh
npx rune@latest create
```

After this, you'll have a multiplayer Tic Tac Toe game running locally.

Alternatively, follow the guide to port an existing game to Rune (see `how-it-works.md` → "Porting Existing Game").

### Uploading & Playing In The App

Now that you have Tic Tac Toe running locally, upload it to try it in the Rune app:

```sh
npm run upload
```

That's it. The game now shows up inside Rune and can be played with friends.

### Game Logic

Rune games are split into two parts: **logic** & **rendering**.

The logic code lives in `logic.js`. The `setup` function creates an initial `game` state that's synced across players. Example for Tic Tac Toe — a 3x3 grid:

```js
function setup() {
  const game = {
    cells: new Array(9).fill(null), // 3x3 cell grid
    // ... rest of the game state
  }
  return game
}
```

To modify the `game` state synced between players, define **actions** called from the client code. Example action to mark a cell:

```js
function claimCell(cellIndex, { game, playerId }) {
  game.cells[cellIndex] = playerId
  // ... rest of the logic, like checking for win condition
}
```

Finally, provide the setup function, actions, and other game info to `Rune.initLogic()`:

```js
Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 2,
  setup,
  actions: {
    claimCell,
  },
})
```

Other `initLogic()` options are described in the full API reference (`api-reference.md`). A more in-depth explanation of how the logic code works is in `how-it-works.md` → "Syncing Game State".

### Rendering & Inputs

The game rendering code lives in `client.js`. It reacts to `game` state changes and updates the rendering accordingly:

```js
function onChange({ game, players, yourPlayerId, action }) {
  const { cells, lastMovePlayerId } = game

  // ... update your game visuals according to latest received game state.
  // Also play sound effects, update styles, etc.
}

Rune.initClient({ onChange })
```

The client code also calls actions based on user input:

```js
const button = // ... get the cell
  button.addEventListener("click", () => Rune.actions.claimCell(cellIndex))
```

More on rendering in `how-it-works.md` → "Syncing Game State" (Rendering section).

### What Next?

Rune supports games far beyond Tic Tac Toe: real-time multiplayer, complex physics, beautiful graphics and more. Good next steps:

- Look at example games (see `examples-and-determinism.md`)
- Join the Rune Discord server: https://discord.gg/rune-ai
- Learn how Rune works underneath: `how-it-works.md` → "Syncing Game State"
- Read about the Creator Fund / making money: `publishing.md` → "Making Money"

## Top Games on Rune

Source: https://rune.ai/sdk/getting-started/top-games-on-rune

Discover the most popular games built by the Rune developer community — browsable in the Rune app (https://www.rune.ai). To get your own game featured there, check the publishing guide (`publishing.md` → "Publishing Your Game").
