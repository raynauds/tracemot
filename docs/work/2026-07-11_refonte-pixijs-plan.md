# Plan d'implémentation : refonte PixiJS (grille plein écran, zoom & pan)

Met en œuvre [2026-07-11_grille-plein-ecran-zoom-pan.md](2026-07-11_grille-plein-ecran-zoom-pan.md).

## Décisions verrouillées

- **Build** : passage à **Vite** + `npm i pixi.js` (v8). Le projet quitte le « zéro-build ».
- **Périmètre Pixi** : PixiJS ne rend que **la scène grille** (fond plein écran) : cases, lettres, tracé, tracés fantômes. Tout le chrome (header, sélecteur de difficulté, registre, consigne, victoire, statut, debug) **reste en HTML/CSS** en surimpression.
- **Registre « Mots trouvés »** : panneau flottant repliable, **ancré au bord droit**, ouvert par défaut sur desktop, **replié en pastille** (compteur `n / N`) sur mobile.
- **Animations** : repensées **Pixi-natif** (Ticker + interpolations sur `alpha`/`scale`/`tint`/`position`), pas de portage ISO des keyframes CSS.
- **Zoom max** : `ZOOM_MAX_CELLS = 3` (≈ 3×3 cases plein écran).
- **Grille** : reste 5×5 (génération inchangée), mais rendu/tracé/caméra/UI **paramétrés par `rows`/`cols`**, zéro hypothèse 5×5.

## Architecture cible

| Module | Sort |
| --- | --- |
| `dictionary.js`, `solver.js`, `rules.js` | **Inchangés** (logique pure). |
| `config.js` | Ajout des constantes caméra + géométrie monde + **palette numérique**. |
| `state.js` | Inchangé (le `path` reste des indices de cases). L'état caméra vit dans `camera.js`. |
| `dictionary.js` — chemins fetch | `docs/dictionnaires/…` → `dictionnaires/…` (assets déplacés en `public/`). |
| `render.js` | **Scindé** : garde le chrome DOM (registre, chip difficulté, chrono, consigne, statut, victoire). La partie grille/tracé part dans `scene.js`. |
| `scene.js` | **Nouveau** : `Application` Pixi, couches, cellules, tracé, animations. |
| `camera.js` | **Nouveau** : modèle caméra (scale + position sur le container monde), fit/clamp/zoom/pan, conversions écran↔monde. |
| `input.js` | **Réécrit** : arbitrage des gestes (tracé / pan / pinch / molette / clavier / boutons). |
| `main.js` | Orchestration : `await` init Pixi, câblage caméra/boutons ; le reste identique. |

### Graphe de scène

```
app.stage  (eventMode: 'static', hitArea = app.screen)
└─ world            (Container)  ← transform caméra (scale + position)
   ├─ cellsLayer    (Container)  ← fonds de cases (Graphics roundRect)
   ├─ traceLayer    (Container)  ← tracés fantômes puis tracé actif (Graphics)
   └─ lettersLayer  (Container)  ← Text des lettres (au-dessus du trait)
```

Choix délibéré : lettres **au-dessus** du trait pour rester lisibles, trait au-dessus des fonds → ligne d'encre continue. (Diffère du DOM actuel où le SVG est derrière les cases, mais rend mieux à grande échelle.)

## Modèle caméra (`camera.js`)

État : `{ scale, x, y }` appliqué à `world` (`world.scale.set(scale)`, `world.position.set(x, y)`).

- **Point monde → écran** : `s = p * scale + pos`. **Écran → monde** : `p = (s - pos) / scale`, ou `world.toLocal(globalPoint)`.
- **Géométrie grille** (échelle 1) : `pitch = CELL_SIZE + CELL_GAP` ; `gridW = cols*CELL_SIZE + (cols-1)*CELL_GAP` ; idem `gridH`.
- **fitScale** = `min(screenW/gridW, screenH/gridH) * FIT_PADDING`. C'est le **scale minimum** (« on ne voit jamais moins que la grille entière »).
- **maxScale** = `min(screenW, screenH) / (ZOOM_MAX_CELLS * pitch)`.
- **Clamp position** (viewport ⊆ grille) : pour chaque axe, `x ∈ [screenW - gridW*scale, 0]`. Intervalle vide (grille plus étroite que l'écran, cas du fit) → **centrage** : `x = (screenW - gridW*scale)/2`. Idem `y`. Une seule fonction `clamp(scale, x, y)` centralise fit **et** bornes de pan.
- **Zoom centré pointeur** : garder le point monde sous le pointeur fixe. `world = (ptr - pos)/scale` ; nouveau `scale'` (clampé) ; `pos' = ptr - world*scale'` ; puis `clamp`.
- **fit()** : `scale = fitScale`, position centrée. Vue initiale + bouton « tout voir ».

Recalcul de `fitScale`/`maxScale`/clamp à chaque **resize** (`app.renderer.on('resize', …)` ou `ResizePlugin`).

## Config additionnelle (`config.js`)

```
CELL_SIZE = 100, CELL_GAP = 10          // unités monde
FIT_PADDING = 0.92
ZOOM_MAX_CELLS = 3
ZOOM_STEP = 1.25                        // boutons + / −
KEY_PAN_SPEED = 900                     // px/s (flèches, ZQSD/WASD)
EDGE_PAN_MARGIN = 64                    // px : bande de bord déclenchant l'auto-pan
EDGE_PAN_MAX_SPEED = 700                // px/s à fond de bande
```

**Palette numérique** (portée depuis `style.css`, Pixi veut des `0xRRGGBB`) :

```
PAPER 0xf6f1e7  CARD 0xfdfbf5  CARD_HOVER 0xf3ecdc  INK 0x26221c
VERMILION 0xb3402a  MUTED 0x6e6656  LINE 0xd8cfbc  GHOST 0xb9af9c
```

États de case → couleurs : normal `CARD`+bord `INK` ; `sel` fond `INK`/texte `PAPER` ; `head` fond `VERMILION`/texte `PAPER` ; `disabled` fond `PAPER`/bord `LINE`/texte `GHOST`. Trait actif `INK`, trait fantôme `GHOST`.

## Phases

### Phase 0 — Socle Vite (aucun Pixi)

- `npm init` + `npm i -D vite` + `npm i pixi.js` ; scripts `dev`/`build`/`preview`.
- `index.html` reste l'entrée (racine) ; `js/` inchangé.
- Déplacer `docs/dictionnaires/*.txt` → `public/dictionnaires/` ; ajuster les 5 chemins de `dictionary.js` (`TIER_FILES` + `dictionnaire.txt`).
- `.gitignore` : `node_modules/`, `dist/`.
- **Recette** : `npm run dev` sert le jeu **strictement identique à aujourd'hui** (grille DOM actuelle), dictionnaires chargés, difficulté/tracé/victoire OK. `npm run build && npm run preview` idem. Aucun code de rendu touché.

### Phase 1 — Scène Pixi minimale (rendu statique)

- `scene.js` : `new Application()` + `await app.init({ resizeTo: window, background: PAPER, antialias: true, autoDensity: true, resolution: devicePixelRatio })`. Canvas en fond, `position: fixed; inset: 0`.
- Construire `world` + les 3 couches ; `buildGrid()` place cellules (fond `Graphics.roundRect`, `Text` de lettre) selon `rows/cols`.
- `renderNewGame` (grille) repris en Pixi : pose des lettres, reset des états. Le chrome (registre, chrono…) reste piloté par `render.js`.
- Caméra en **fit** fixe (pas encore d'interaction).
- **Recette** : la grille s'affiche plein écran, centrée, lettres nettes ; rejouer redistribue ; le chrome HTML fonctionne au-dessus.

### Phase 2 — Caméra interactive

- Implémenter `camera.js` (modèle ci-dessus) + `applyToWorld()`.
- Molette → `zoomAt(pointer, factor)`. Boutons flottants **+ / − / tout voir** (voir Phase 7 pour le style) câblés sur `zoomAt(center, ±STEP)` et `fit()`.
- **Recette** : molette zoome vers le pointeur, jamais sous le fit ni au-delà de 3×3 cases ; boutons OK ; resize recadre proprement.

### Phase 3 — Tracé en espace monde

- Tracé = `Graphics` dans `traceLayer`, redessiné à chaque extension (`moveTo`/`lineTo` sur les centres de cases, `stroke({ width, color: INK })`). Largeur en unités **monde** (constante) → épaissit/affine avec le zoom naturellement.
- Hit-test case : `world.toLocal(e.global)` → `col = round?` via `pitch`, avec **tolérance rayon** (≈ `CELL_SIZE/2`, reprise de la logique actuelle `hypot(dx,dy) > rect.width/2`).
- Règles de tracé **inchangées** (adjacence orthogonale, backtrack, cases `usedCells` inertes) — logique reprise telle quelle de `input.js`, seule la source de coordonnées change.
- `renderFoundTraces` (fantômes `GHOST`) + `updateSelection` (tint `sel`/`head`) portés en Pixi.
- **Recette** : tracé souris + tactile équivalent à aujourd'hui, aperçu dans le registre (DOM) inchangé, validation/refus OK.

### Phase 4 — Arbitrage des gestes (`input.js` réécrit)

Machine à états sur les pointeurs actifs (`Map<pointerId, …>`), events fédérés sur `app.stage` + `wheel` sur le canvas + `keydown` sur `window` :

| Situation | Mode |
| --- | --- |
| 1er pointeur, bouton principal, **part d'une case** libre | `trace` |
| Pointeur **hors case**, ou bouton du milieu | `pan` |
| **2e pointeur** posé | bascule `pinch` (abandonne un tracé en cours) |
| molette / boutons +/− | zoom |
| flèches, ZQSD/WASD | pan clavier (Ticker) |

- `pan` : translation caméra par delta écran (clampé).
- `pinch` : `scale *= dist/dist0` autour du **milieu des deux doigts** + pan par delta du milieu.
- Remplace `elementFromPoint` + `releasePointerCapture` par le hit-test `toLocal`. `touch-action: none` sur le canvas.
- **Recette** : tableau gestes de la spec respecté sur desktop et mobile ; pas de conflit tracé/pan ; `contextmenu`/`dragstart` neutralisés.

### Phase 5 — Auto-pan pendant le tracé

- Callback `Ticker` actif seulement en mode `trace` : si la **position écran** du pointeur (mémorisée au dernier move) entre dans `EDGE_PAN_MARGIN`, ajouter une vitesse caméra ∝ pénétration (plafonnée `EDGE_PAN_MAX_SPEED`), clampée aux bornes. Réévaluer la case sous le pointeur après déplacement pour continuer le mot.
- **Recette** : en approchant un bord pendant un tracé, la caméra suit doucement et le mot peut continuer hors de la vue initiale ; s'arrête aux limites de la grille.

### Phase 6 — Animations Pixi-natives

Petit utilitaire `tween.js` (liste de tweens sur le Ticker partagé : `{ target, from, to, duration, ease, onUpdate, onComplete }`) — approche idiomatique sans lib.

- **Distribution (« deal »)** : à `renderNewGame`, chaque cellule `alpha 0→1` + `scale 1.18→1`, **stagger** `index * 18ms` (repris du `--i` CSS), ease-out.
- **Case rejoignant le tracé (« pop »)** : `scale 1→1.09→1` sur ~160 ms + tint immédiat vers `head`.
- **Refus** : **flash** = tint des cases du tracé vers `VERMILION` puis retour (~400 ms) ; **shake** = offset écran transitoire amorti (sinus décroissant) ajouté à `world.position` **après clamp** chaque frame (secousse visuelle, ne casse pas la caméra).
- **Mot validé (« stamp »)** : sur les cases, tint vers `disabled` + `scale 1.12→1` ; le tracé fantôme apparaît en fondu (`alpha 0→1`). Le tampon du registre reste géré en CSS (DOM).
- **Recette** : chaque feedback est présent, cohérent avec Pixi, fluide au zoom.

### Phase 7 — UI en surimpression + nettoyage

- `index.html` : retirer `.board-zone`/`.board`/`.grid`/`<svg>` ; le canvas Pixi devient le fond. Header, consigne, contrôles zoom → overlays `position: fixed`.
- **Registre** : panneau flottant ancré à droite, bouton plier/déplier ; sur mobile (`max-width: 860px`) replié en pastille `n / N`, dépliable en tiroir. Réutiliser le markup `.word-list` existant.
- **Statut** (chargement/erreur) et **victoire** (`.win` + confettis) → overlays plein écran au-dessus du canvas.
- Boutons flottants **+ / − / tout voir** en coin (mono, bordure `INK`, style chip).
- `style.css` : supprimer tout le bloc grille/case/trace/`.board` ; conserver et repositionner header, difficulté, registre, consigne, victoire, debug.
- **Recette** : maquette cohérente desktop + mobile ; rien ne masque la grille ; safe-area mobile respectée.

### Phase 8 — Debug & docs

- `debug.js` : le survol d'un mot (`setDebugHint`) surligne son tracé — porter en tint Pixi (`debug-hint`). Panneau debug lui-même reste DOM.
- Mettre à jour `docs/reference/stack-et-architecture.md` (Vite + Pixi, plus « aucun build ») et `fonctionnalites.md` si besoin.

## Points de vigilance

- **Netteté des lettres au zoom** : un `Text` Pixi est une texture ; zoomer l'agrandit → flou. Rendre le `Text` à une résolution couvrant `maxScale` (`style.resolution` ≈ `maxScale * dpr`) **ou** passer en `BitmapText`. À trancher en Phase 1 (défaut : `resolution` relevé ; `BitmapText` si insuffisant sur grandes grilles futures).
- **Arbitrage gestes multi-input** (souris/tactile/stylet) : source principale de bugs — couvrir perte de focus (`blur`), pointer manquant, 2e doigt en plein tracé, bouton relâché hors canvas (cas déjà gérés dans l'`input.js` actuel, à re-traiter).
- **Shake vs caméra** : appliquer la secousse comme offset visuel post-clamp, jamais dans l'état caméra persistant.
- **Assets Vite** : les `.txt` doivent être en `public/` (servis tels quels), sinon 404 en build.
- **Coût** : Phases 4 et 5 (gestes + auto-pan) concentrent le risque ; Phases 0-3 sont mécaniques.

## Ordre de livraison

0 → 1 → 2 → 3 sont séquentielles et chacune laisse le jeu jouable. 4-5 forment le cœur interactif. 6-8 sont de la finition. Chaque phase a un critère de recette autonome.
