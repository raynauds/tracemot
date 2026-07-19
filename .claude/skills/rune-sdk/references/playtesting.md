# Playtesting

## Testing in Rune App

Source: https://rune.ai/sdk/playtesting/testing-in-app

Rune lets you playtest your game in the actual Rune app before it's public — a great way to try the real multiplayer experience with friends and team members (see `publishing.md` → "Collaboration") before release.

Upload with:

```sh
npx rune@latest upload
```

The game then appears in the app even though it isn't publicly available yet — see `publishing.md` → "Publishing Your Game" for details.

Create a room in the app and select your game. You can invite people who aren't on your team too — they won't see your game in their list, but can join and play once you've selected it.

### Playing New Versions Before Release

Once published, everyone gets the latest **active** version. To keep developing afterward, your team members instead see the latest **draft/in-review** version — so you can playtest the newest changes in the app before they go live to everyone.

---

## Simulating Multiplayer

Source: https://rune.ai/sdk/playtesting/simulating-multiplayer

The Rune SDK works with common dev tools (Vite, Webpack, Create React App). Opening the URL from your build tool shows your game running inside a mock Rune app.

To simulate multiplayer during development, Rune runs many instances of your game side-by-side in the **Dev UI**, where you can emulate network latency, game restarts, etc.

### Run on Your Phone

Connect to the URL from your dev tool on your phone to see the Dev UI there too. You can also emulate mobile via Chrome DevTools.

The real Rune community plays your game in the actual Rune app as a genuine multiplayer experience — see "Testing in Rune App" above for playtesting with friends while still a draft/in-review.

### Sharing Playtesting Links

Upload your game (`publishing.md` → "Publishing Your Game") to get a **playtest link** you can share with other devs. It shows the Dev UI so they can simulate multiplayer and try edge cases themselves — works even before the game has been reviewed.

---

## Best Practices (Gameplay)

Source: https://rune.ai/sdk/playtesting/best-practices-gameplay

Advice for making the game a great experience for players.

### Ease Players Into Your Game

As the dev, your game feels obvious to you — it isn't to a new player. Start with extremely simple, intuitive gameplay.

### Support Solo Play

Many players try a game alone before sharing it with friends. Supporting solo play increases pickup by the community.

### Support Two Players

Most Rune rooms have exactly two players. Games that are fun with just one other person tend to be most successful.

### Support Spectating

Players can spectate — e.g. joining after `maxPlayers` is hit, or after `Rune.gameOver()` has been called. Identify spectators via `yourPlayerId === undefined` (see `how-it-works.md` → "Player Info"). Spectators should see all gameplay but have no action UI.

### Avoid UI Like Menu Screens, Pause Buttons, Audio Buttons, etc.

Rune's own UI already provides a universal play/pause/restart control, so you don't need a menu screen or pause button — this gets players into the action faster. Same for audio controls — Rune has in-app UI for that.

### Use Icons Instead of Text

Most players prefer visual explanations over reading. Aim for a game understandable without reading any text.

### Translate Text For Non-English Players

Many Rune players don't read English. Internationalizing increases your game's chances of success — the biggest non-English audiences speak Spanish, Russian, and Portuguese (see `how-it-works.md` → "Translating In-Game Text"). Your game's description is auto-translated already (see `publishing.md` → "Game Info").

### Use Rune Avatars

Players recognize friends by avatar and like seeing their own inside your game — see `how-it-works.md` → "Player Info" → "Avatars".

### Persist Player Progress Across Game Sessions

Players enjoy persistent progress (unlocks, high scores). Use Rune's persistence API (`advanced-features.md` → "Persisted Data") — it's reliable and syncs across a user's devices automatically. Avoid cookies/localStorage/IndexedDB, which the OS may reset.

### Polish Your Rune Profile

Set your name, avatar, and description in the Rune app's Profile tab — it's publicly visible for games you've created or contributed to.

---

## Best Practices (Tech)

Source: https://rune.ai/sdk/playtesting/best-practices-technical

How to code your game to perform its best on Rune.

### Use Rune Loading Animation

Rune shows a loading animation. Don't build your own loading screen — wait to call `Rune.initClient()` until your game has fully finished loading, so players only see one progress bar.

### Keep Loading Time Short

Load quickly. Load large, non-gameplay-critical assets asynchronously in the background.

### Send Player Input rather than Player State in Actions

Send input (e.g. "turning left"), not resulting state (e.g. absolute position) — this minimizes network data and lets other clients simulate ahead, which works better under bad network conditions. Only send an action when input actually changes; don't repeatedly resend the same input.

### No Ads, Branding and Links

Rune has no ads. Leave ads/branding/links out of your game to keep focus on gameplay.

### No Network Requests or External Resources

Don't use network requests or external resources — protects player privacy/security and guarantees your game keeps running even if some external service goes down.

### Gameplay Should not be Affected by Screen Size

Scale from small narrow phones (e.g. 280×653) to wide tablets (e.g. 1280×800); gameplay area can shrink to as little as 450px tall on small phones. Gameplay should be unaffected by aspect ratio/resolution — fill the entire screen.
