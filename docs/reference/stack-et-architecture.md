# Stack et architecture

## Stack

JS + HTML + CSS, modules ES natifs. Build **Vite**, une seule dépendance runtime : **PixiJS v8** (`pixi.js`). La grille (cases, lettres, tracé) est rendue en WebGL par Pixi ; le chrome (header, difficulté, règle, registre, zoom, victoire, debug) reste en HTML/CSS en surimpression. Ressources externes : les polices Google Fonts (Source Serif 4, IBM Plex Mono). Assets servis tels quels depuis `public/` (dictionnaires).

## Modules

Tout le code vit sous `js/` :

- `config.js` - réglages (dont modes de jeu, géométrie du monde Pixi et palette numérique).
- `geometry.js` - géométrie d'une grille rows × cols (indices, voisins orthogonaux), partagée par le solveur, la scène et l'input.
- `state.js` - état partagé (dont le mode actif et sa géométrie, figés au chargement).
- `dictionary.js` et `solver.js` - logique pure, sans DOM ni état (chargement des dictionnaires, génération et résolution de la grille) ; réutilisée telle quelle par le harnais Node `tools/solver-check.mjs`.
- `rules.js` - validation d'un mot.
- `scene.js` - scène Pixi : `Application`, couches, cases, lettres, tracé, tracés fantômes, animations et feedbacks (deal, pop, flash, shake, stamp).
- `camera.js` - modèle caméra (scale + position du container monde) : fit, clamp, zoom, pan, conversions écran ↔ monde.
- `tween.js` - petit moteur d'interpolations sur le Ticker Pixi.
- `render.js` - chrome DOM (registre, difficulté, règle, chrono, statut, victoire).
- `input.js` - arbitrage des gestes (tracé / pan / pinch / molette / clavier / auto-pan) via les events fédérés Pixi.
- `debug.js` - chargé si `DEBUG`.
- `main.js` - orchestration (dont `await` de l'init Pixi).

## Configuration

Tous les réglages sont dans `js/config.js` :

- `GAME_MODES` / `ACTIVE_MODE` - modes de jeu : forme de la grille (`rows` × `cols`) et puzzle (`wordCount` mots de `wordLength` lettres), avec l'invariant `wordCount × wordLength = rows × cols` validé au chargement. Tout le reste (solveur, registre, compteur, victoire, caméra) dérive du mode actif.
- `DEBUG` - active le mode debug (voir [fonctionnalites.md](fonctionnalites.md)).
- Difficultés : `ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY`, quotas par palier dans `DIFFICULTY_QUOTAS` (bornes en fraction du nombre de mots du mode).
- Génération : `MAX_GRID_TRIES`, `MAX_GRID_REPAIRS`, `REPAIR_CANDIDATES` (réparation hill-climbing).
- Monde Pixi et caméra : `CELL_SIZE`, `CELL_GAP`, `VIEW_MARGIN` (jusqu'où on peut dézoomer et écarter la grille de l'interface), `FIT_MARGIN_PX` (marge visée par le cadrage d'ouverture), `ZOOM_MAX_CELLS`, `ZOOM_STEP`, `KEY_PAN_SPEED`, `EDGE_PAN_MARGIN`, `EDGE_PAN_MAX_SPEED`, plus la palette numérique (`PAPER`, `CARD`, `INK`…).

## Persistance

Deux clés `localStorage`, en lecture/écriture tolérante aux échecs : `tracemot.difficulty` (niveau choisi) et `tracemot.rule-seen` (la règle a déjà été présentée). Le repli du registre, lui, n'est pas mémorisé : il dépend de la largeur d'écran.
