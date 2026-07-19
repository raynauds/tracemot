# Publishing

## Publishing Your Game

Source: https://rune.ai/sdk/publishing/publishing-your-game

### Upload

```bash
npx rune@latest upload
```

You can then playtest with friends in the actual Rune app (`playtesting.md` → "Testing in Rune App"). To release to the wider Rune community, your game needs a **Game Preview** image (see "Game Info" below — Rune can also make one for you).

Run the upload command again to push a new version.

### Sit Back, Relax

If you mark the game as ready for release during upload, the Rune team reviews it for best-practice compliance and correctness — usually **under 2–3 weekdays**. Following the gameplay best practices (`playtesting.md`) speeds up review.

---

## Dev Dashboard

Source: https://rune.ai/sdk/publishing/dashboard

Shows how your games are performing, lets you dive into errors, and shows Creator Fund earnings (`making-money` below).

### Stats

Per-game, per-time-period stats: player counts, next-day return %, total time spent playing together, and more advanced stats like room-size distribution (solo vs. group play).

### Game Errors

Rune tracks in-game errors, similar to Crashlytics for Android — see the most common errors and how they trend over time, including stack trace + device info, to help you fix issues quickly.

### OP Level

Shows how many of the gameplay best practices (`playtesting.md` → "Best Practices (Gameplay)") your game achieves — "OP" = "overpowered". It's a guide, not an algorithmic ranking input directly — but following it and improving your metrics does make your game more likely to be showcased in the app.

---

## Game Info

Source: https://rune.ai/sdk/publishing/game-info

Every Rune game has a title, description, and preview image.

### Game Title and Description

Keep both short and fun. Descriptions are **auto-translated** into the most widely used Rune languages — if a translation looks off, DM the team on Discord (https://discord.gg/rune-ai) for a manual override.

### Game Preview Image

Design guidelines:

- PNG format
- 686×960 resolution
- No transparency
- No rounded edges
- No text

The **bottom 240px** is reserved for text/dev info overlay — keep your focal point above that area.

### Update Game Info

```sh
npx rune@latest update-info
```

### Wanna Skip Making a Game Preview Image?

Not required for initial playtesting uploads — only needed before releasing to the full Rune community. The Rune team can make one for you — ask on Discord.

---

## CLI Reference

Source: https://rune.ai/sdk/publishing/cli

### Install

```bash
npm install -g rune
```

Requires Node.js **14.17+**.

### Commands

#### `rune create`

Creates a new example game from the Vite template.

```bash
rune create
# or
rune create my-game
```

Follow terminal instructions to run the game in the mock Rune app — same interface as `playtesting.md` → "Simulating Multiplayer".

#### `rune extract-translations`

Finds `Rune.t()` calls not yet present in the `<head>` translation script tag and adds them as keys (empty-string values) for 4 languages: English (`en`), Portuguese (`pt`), Russian (`ru`), Spanish (`es`).

Writes into `index.html`:

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

Fill in the empty strings with translations. **Don't change the `type` or `id` attributes** — Rune relies on them to load your translations. See `how-it-works.md` → "Translating In-Game Text" for the full workflow.

#### `rune upload`

Uploads your game for publishing (see "Publishing Your Game" above):

```bash
cd my-game && rune upload
# or
rune upload my-game
```

First run logs you in via email; guides you through the upload process. Re-run to push a new version.

#### `rune list`

Lists your games on Rune.

#### `rune update-info`

Updates title, description, or game preview.

#### `rune update-members`

Updates the game's team (e.g. adds a member) — see "Collaboration" below.

#### `rune logout`

Logs out of the CLI.

#### `rune help`

Displays help text.

---

## Collaboration

Source: https://rune.ai/sdk/publishing/collaboration

Creating a game makes you its admin. Admins can add other Rune users as team members with roles: **Playtester**, **Developer**, or **Admin**. Manage via:

```sh
npx rune@latest update-members
```

- List existing members
- Invite new members by their Rune tag
- Change an existing member's role
- Remove an existing member

Invited members get an email invitation to accept before becoming a team member.

### Team Roles

Each game has its own independent set of Playtesters/Developers/Admins. All members can playtest draft/in-review versions in the Rune app. Only **Developers and Admins** can publish new versions (`publishing-your-game.md`... i.e. "Publishing Your Game" above). A game can have multiple Admins.

Developers and Admins show up in the game's team list in the Rune app; Playtesters do not.

### Playtesting in Rune App

As a team member, you can play your game in the Rune app before it's published — see `playtesting.md` → "Testing in Rune App".

---

## Making Money

Source: https://rune.ai/sdk/publishing/making-money

> Promo note from the source doc: to celebrate the creator fund launch, all games earned 5x credits until end of March 2025 — check current terms before relying on this multiplier.

[TODO: CONFIRMER LE COMPORTEMENT AVEC L'UTILISATEUR PENDANT L'IMPLEMENTATION] — this whole "Making Money" section (multipliers, per-region credit table, payout thresholds) is a snapshot of Rune's terms at doc-fetch time and money-related terms change. Before making any decision that hinges on exact payout numbers, re-verify against https://dash.rune.ai/ or https://www.rune.ai/creator-fund-terms rather than trusting the figures below as current.

Rune runs a **Creator Fund** that pays indie devs based on game metrics. Rune provides optimized servers and a large audience, so you don't pay for infrastructure or ads — you focus on making great games.

### No Ads, No Player Charges

Rune doesn't show ads or charge players, and doesn't otherwise make money from games on the platform. The Creator Fund is funded directly by Rune, so developers receive 100% of what's available. More earning mechanisms and player-side enhancements are planned as the platform grows.

### Payouts Based on Metrics

Earnings are based on:

- Players who return the next day to play again
- Players who share your game externally
- Time players spend actively playing your game

Amounts scale by player region (below). Building games people love returning to and sharing directly increases Creator Fund earnings.

Rune provides built-in sharing via `Rune.showShareImage()` (see `api-reference.md`) to help with this.

### Player Regions

Four segments (T1–T4) grouped by per-capita GDP — e.g. US is T1, Estonia T2, Mexico T3, Mozambique T4. Translating your game into Spanish, Russian, Portuguese (the most popular non-English Rune languages) increases your reachable player base and therefore earnings.

### Application and Monthly Payouts

Apply for the Creator Fund once a game hits **100+ hours/month** and a **5%+ return rate**. Review takes up to 5 business days. If you have one popular game and other low-return-rate games, you can apply using the popular game's return rate.

Games earn **credits** daily based on the metrics above; credits convert to dollars at **1 USD = 10,000 credits**. Payouts happen monthly for the prior month's accrued credits (batched to minimize transaction fees, like YouTube). If a month's earnings are below the **$10 minimum**, they roll over to the next month.

Full terms: https://www.rune.ai/creator-fund-terms

### Earnings per Metric (credits, as published)

| Region | Plays again next day | Shares your game | Plays for 1 hour |
| --- | --- | --- | --- |
| T1 | 35 | 400 | 5 |
| T2 | 22.75 | 260 | 3.25 |
| T3 | 14 | 160 | 2 |
| T4 | 7 | 80 | 1 |

- "Plays again" and "playtime" credits accumulate per player per day — a dedicated player keeps earning credits for your game.
- "Shares" credits are awarded **once per player** (anti-scam measure).
- Playtime under an hour is scaled proportionally.
- The 5x launch promo (see note above) applied on top of these base numbers until end of March 2025 — verify current status.

### See Stats and Earnings

Dev Dashboard: https://dash.rune.ai/ — shows stats/errors relative to other Rune games, plus a detailed breakdown of Creator Fund earnings and how they were calculated.

### Actively Playing

Only **active playtime** counts for all metrics — time with the app minimized, or after 5+ minutes without interaction, doesn't count. Anti-abuse measures: advanced device tracking against ban evasion, a **1-minute daily minimum** and **120-minute daily maximum** playtime per player counted toward payouts (so e.g. a 24-hour auto-clicker session earns far less than hoped), and shares counted once per player. Rune reserves the right to act against cheating/scamming.

### It's Your Game

Rune is a platform (10M+ installs), not a publisher — you retain full control over development and distribution of your game, including making a Rune multiplayer version of a game you already built as singleplayer.

### Future Plans (as published)

Rune doesn't yet generate revenue and doesn't promise a full salary from game dev — but hopes the Creator Fund helps motivate your journey, the way first earnings from itch.io/Ko-fi feel meaningful. Planned: in-game purchases using a shared Rune-wide currency, with Rune taking a small platform cut once a game starts generating purchase revenue.
