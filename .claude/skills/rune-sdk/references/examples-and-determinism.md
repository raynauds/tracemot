# Examples & Determinism Deep Dive

## Full Games

Source: https://rune.ai/sdk/examples/games

Full games freely available to build on. Browse all multiplayer example games in Rune's GitHub repo:
https://github.com/rune/rune/tree/staging/examples/

See `how-it-works.md` → "Supported Games" for the categories of games Rune supports.

Games referenced elsewhere in this documentation, with direct links:

- Tic Tac Toe (manual-setup reference) — https://github.com/rune/rune/tree/staging/examples/tic-tac-toe
- Cube Rush (persisted best time) — https://github.com/rune/rune/tree/staging/examples/cube-rush
- Sudoku (persisted onboarding state) — https://github.com/rune/rune/tree/staging/examples/sudoku
- Pinpoint (persisted onboarding state + time usage) — https://github.com/rune/rune/tree/staging/examples/pinpoint / https://github.com/rune/rune/blob/staging/examples/pinpoint/src/logic.ts
- Paddle (real-time game with interpolation) — https://github.com/rune/rune/blob/staging/examples/paddle

## Tech Demos

Source: https://rune.ai/sdk/examples/tech-demos

Simple examples showing a particular feature or style of game built on Rune. Browse all tech demos in Rune's GitHub repo:
https://github.com/rune/rune/tree/staging/tech-demos/

Referenced elsewhere in this documentation:

- World Time tech demo (`Rune.worldTime()` usage patterns) — https://github.com/rune/rune/tree/staging/tech-demos/world-time
- Custom physics for a platformer game — see `advanced-features.md` → "Physics" (linked from this tech-demos page)

## Other Reference Repos

- Dependency whitelist for external libraries usable in `logic.js` — https://github.com/rune/rune/blob/staging/packages/vite-plugin-rune/src/dependency-whitelist.ts
- Rune's ESLint plugin source — https://github.com/rune/rune/tree/staging/packages/eslint-plugin-rune
- Propel.js — a Rune-compatible deterministic physics engine — https://github.com/kevglass/propel-js/

---

## Determinism Deep Dive: How Rune Makes JavaScript Deterministic

Source: https://developers.rune.ai/blog/making-js-deterministic-for-fun-and-glory/

Background reading for `how-it-works.md` → "Server-Side Logic" and `advanced-features.md` → "Randomness"/"Physics" — explains *how* (not just *that*) Rune enforces determinism.

### Core Problem

JavaScript is not deterministic across runtimes: different engines/browsers can produce slightly different results for the same mathematical operations. In a networked game relying on input-based synchronization (predict-rollback), those tiny differences compound across game-state updates and cause state divergence between clients — i.e. desyncs.

### Math Function Patching

MDN itself warns that many `Math` functions have implementation-dependent precision, meaning different browsers/engines can return different results for the same input.

Rune patches nearly the entire `Math` object to round to single-precision floating point, covering:

`abs, acos, acosh, asin, asinh, atan, atan2, atanh, cbrt, ceil, clz32, cos, cosh, exp, expm1, floor, hypot, log, log10, log1p, log2, max, min, pow, round, sign, sin, sinh, sqrt, tan, tanh, trunc`

This keeps the functions useful for gameplay while guaranteeing identical results across devices.

### Random Number Generation

`Math.random()`'s spec deliberately excludes seeding, so Rune replaces it with a seeded PRNG — **mulberry32**:

```javascript
function randomNumberGeneratorFromHash(hash) {
  return function () {
    let t = (hash += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

For rollback-capable networking, seeds are tracked independently, hashed from update-loop names via **xmur3**. This is the mechanism behind the "just use `Math.random()`" guidance in `advanced-features.md` → "Randomness" — Rune substitutes this deterministic generator underneath the standard API.

### Array Sorting

Native JS sort behavior isn't guaranteed identical across engines. Rune overrides `Array.prototype.sort` with a deterministic default comparator:

```javascript
const defaultCmp = (x, y) => {
  if (x === undefined && y === undefined) return 0
  if (x === undefined) return 1
  if (y === undefined) return -1
  const xString = toString(x)
  const yString = toString(y)
  if (xString < yString) return -1
  if (xString > yString) return 1
  return 0
}
```

### Implementation via Monkey Patching

Rune patches built-ins at runtime inside the sandboxed logic execution:

```javascript
globalThis.Array.prototype.sort = arraySort
```

The original implementation can be restored afterward (e.g. via `try`/`finally`) to avoid leaking the patch into unrelated code.

### Developer Safeguards

Rune's ESLint plugin (see `how-it-works.md` → "Server-Side Logic" → "Editor Integration") flags common non-deterministic patterns during development — e.g. unchecked global-scope access or locale-dependent operations — before they cause a production desync.

### Why This Matters for Your Game

- You rarely need to think about any of this — write normal JS, use `Math.random()` normally, and Rune's patches keep it deterministic transparently.
- It explains **why** certain things are restricted in `logic.js` (see `how-it-works.md` → "Server-Side Logic"): the restrictions exist specifically to keep the sandboxed patching reliable, not as arbitrary limitations.
- It's directly relevant if you're integrating a **physics engine** (`advanced-features.md` → "Physics") — only engines that don't rely on non-deterministic built-ins (or that Rune has verified, like Propel.js) will stay in sync across clients and server.
