# Stack et architecture

## Stack

TypeScript (v7) + HTML + CSS, modules ES natifs. Build **Vite** (`tsc --noEmit` pour le typage, script `npm run check` agrégé sur les workspaces). Une seule dépendance runtime externe : **PixiJS v8** (`pixi.js`). La grille (cases, lettres, tracé) est rendue en WebGL par Pixi ; le chrome (accueil, header, carte, règle, registre, zoom, victoire) reste en HTML/CSS en surimpression. Les polices sont **auto-hébergées** en WOFF2 (`public/fonts/`, déclarées dans `src/theme/fonts.css`, préchargées, boot attendant `document.fonts.ready`) — aucune requête externe.

## Monorepo (3 packages)

npm workspaces, `packages/*` :

- **`@traceword/core`** (`packages/core/src`) — domaine pur, zéro DOM/Pixi/thème, réutilisable en Node : `config.ts` (modes, difficultés, paramètres solveur), `geometry.ts` (grille rows × cols, voisins orthogonaux), `levels.ts` (types des niveaux + arithmétique des identifiants : sections, lignes, défis A/B/C, ordre canonique).
- **`@traceword/studio`** (`packages/studio/src`) — **outillage hors-ligne** de génération des niveaux : `dictionary.ts`, `solver.ts` (pavage par backtracking, réparation hill-climbing, exclusivité contre le dictionnaire complet), `seeded-random.ts`, `scripts/generate-levels.ts`, harnais `tools/solver-check.mjs`. Les cinq dictionnaires vivent ici (`dictionnaires/`), jamais servis au runtime.
- **`@traceword/game`** (`packages/game/src`) — l'app navigateur (Vite + Pixi), voir ci-dessous.

## Modules du jeu (`packages/game/src`)

Découpé en couches : `game/` = runtime du domaine côté jeu, `render/` = tout ce qui touche Pixi et le DOM, `input/` = gestes. `game/` n'importe jamais `render/` ni `input/`.

- `main.ts` — composition root : `await` de l'init Pixi, cycle accueil → carte → partie, validation des mots ; seul endroit qui branche toutes les couches.
- `game/config.ts` — **présentation** : timings, géométrie du monde Pixi et palette numérique (dérivée du thème). Le domaine (modes, barèmes) est dans `@traceword/core`.
- `game/state.ts` — état de la partie ; adopté par niveau via `applyLevel` (la géométrie change à chaque niveau — un défi double le côté).
- `game/level-loader.ts` — chargement `fetch` des grilles prégénérées (`public/levels/*.json`), cache de promesses.
- `game/progress.ts` — progression : étoiles, déblocage sections/modes, suites de victoire, point de reprise (`firstPlayableLevel`, `resumePoint`), persistance dérivée.
- `game/rules.ts` — validation d'un mot contre la solution du niveau.
- `render/scene.ts` — scène Pixi : `Application`, couches, cases, lettres, tracé, tracés fantômes, feedbacks (deal, pop, flash, shake, stamp).
- `render/camera.ts` — modèle caméra (scale + position du container monde) : fit, clamp, zoom, pan, conversions écran ↔ monde.
- `render/tween.ts` — petit moteur d'interpolations sur le Ticker Pixi.
- `render/render.ts` — chrome DOM de la **partie** : header (id de niveau, retour carte, chip règle), registre, statut, victoire.
- `render/home.ts` — accueil : premier écran, point de reprise, règle. Sur le modèle de `render.ts` (structure statique dans `index.html`), pas de `map.ts`.
- `render/map.ts` — carte de progression. `render/icons.ts` — icônes SVG.
- `input/input.ts` — arbitrage des gestes (tracé / pan / pinch / molette / clavier) via les events fédérés Pixi.
- `theme/` — `tokens.ts` (source unique de la palette et des polices) → `tokens.css` **généré** (`npm run generate:tokens`, `check:tokens` vérifie la synchro) ; `base.css`, `fonts.css`, `DESIGN.md`. Un `.css` par composant sous `render/`.

## Configuration

Domaine dans `@traceword/core/config.ts` : `GAME_MODES` / `DEFAULT_MODE` / `MODE_ORDER` et `defiMode()` (grille doublée), avec l'invariant `wordCount × wordLength = rows × cols` validé au chargement pour chaque mode et son défi ; `DIFFICULTY_QUOTAS` (les libellés des rangs Bronze→Platine sont côté client, `render/i18n.ts`) ; paramètres du solveur (`MAX_GRID_TRIES`, `GRID_REPAIRS_PER_WORD`, `REPAIR_CANDIDATES`, `LETTER_WEIGHTS`).

Présentation dans `game/config.ts` : `CELL_SIZE`, `CELL_GAP`, `VIEW_MARGIN`, `FIT_MARGIN_PX`, `ZOOM_MAX_CELLS`, `ZOOM_STEP`, `KEY_PAN_SPEED`, timings, et la palette numérique (`PAPER`, `CARD`, `INK`…) dérivée de `theme/tokens.ts`.

## Persistance

Clés `localStorage` (lecture/écriture tolérante aux échecs, `game/progress.ts`) : `traceword.progress.<mode>` (niveaux validés — seule donnée stockée), `traceword.lastMode`, `traceword.seenModes`, `traceword.schema` (version) et `traceword.rule-seen`. `migrateStorage()` purge au démarrage les clés du jeu libre disparu (`traceword.mode`, `traceword.difficulty`) et toute progression d'un schéma antérieur.

## Scripts

Racine (délégués aux workspaces) : `dev` / `build` / `preview` (game), `generate:levels` (studio — produit les JSON), `generate:tokens` / `check:tokens` (thème), `check:solver` (studio) et `check:progress` (game — invariants), `check` (typage agrégé).
