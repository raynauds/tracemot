# Fonctionnalités

## Trois écrans : accueil, carte et partie

L'**accueil** (`src/render/home.ts`) est le premier écran, et le seul à porter la marque : le titre du jeu, une ligne d'état, un bouton primaire qui reprend au point de reprise (`resumePoint()`, cherché d'abord dans le dernier mode consulté) et un accès à la carte. Le libellé suit l'avancement — `COMMENCER` au premier lancement, `REPRENDRE` ensuite, et le primaire disparaît quand tout est validé. Une chip « i » y ouvre la règle complète. Sa structure est statique dans `index.html` ; le module n'écrit que ce qui varie, et re-dérive tout du stockage à chaque affichage.

La **carte de progression** (`src/render/map.ts`) vient ensuite : on y choisit un mode et un niveau, sa grille prégénérée est chargée, et la **partie** démarre plein écran. Une flèche de retour ramène d'un écran (partie → carte, carte → accueil). `src/main.ts` orchestre ce cycle (`showHome`, `startLevel`, `backToMap`).

## Modes de jeu

Une série de grilles carrées **N×N** (`GAME_MODES`, `@tracemot/core`) : `5x5`, `6x6`, `7x7`, `8x8` — N mots de N lettres sur une grille N×N. L'identifiant du mode *est* sa forme. Les modes se débloquent à l'étoile (voir [progression](regles-et-difficultes.md)) ; le mode par défaut, seul ouvert au premier lancement, est `5x5`. Le dernier mode consulté est mémorisé (`localStorage`, `tracemot.lastMode`).

## Niveaux prégénérés

Le runtime **ne génère plus rien** et ne charge aucun dictionnaire. Toutes les grilles sont produites **hors-ligne** par le studio (`npm run generate:levels`, voir [stack-et-architecture.md](stack-et-architecture.md)) et versionnées en un JSON par mode dans `public/levels/<mode>.json` (lettres + solution + tracés). `src/game/level-loader.ts` les charge par `fetch` (cache de promesses). Servir le jeu en HTTP est donc requis : ouvrir en `file://` échoue et affiche un overlay d'erreur qui renvoie à la carte.

## Tracé

Au doigt ou à la souris (events fédérés Pixi, `src/input/input.ts`), avec backtrack, vibration sur mobile et ligne d'encre suivant le tracé, rendue en WebGL par PixiJS. Un doigt qui rate une case au passage la récupère : quand la case visée est alignée avec la dernière case tracée (même ligne ou même colonne), tout le segment qui les sépare est parcouru dans l'ordre — tout ou rien, une case inerte ou déjà tracée dans le segment annule le saut. Le backtrack suit la même règle et se déroule d'autant de cases. Feedbacks Pixi-natifs (`src/render/scene.ts`) : distribution en cascade, rebond d'une case rejoignant le tracé, flash et secousse au refus, tampon à la validation.

## Caméra : zoom & pan

La grille est rendue plein écran par Pixi et cadrée par une caméra (`src/render/camera.ts`). Zoom à la molette (centré sur le pointeur), au pinch tactile ou via les boutons flottants + / − / tout voir ; pan par glissé hors case et au clavier (flèches, ZQSD/WASD). Sur écran tactile, les boutons + / − sont masqués (le pinch les remplace) ; seul « tout voir » reste.

Le zoom est borné entre le dézoom maximum (grille entière plus une marge tout autour, `VIEW_MARGIN`) et 3×3 cases (`ZOOM_MAX_CELLS`). Le zoom affiché au chargement est distinct de ces bornes : c'est le cadrage « tout voir », qui vise `FIT_MARGIN_PX` de marge horizontale tout en gardant la marge verticale du dézoom maximum.

## Registre des mots

Panneau flottant (`src/render/render.ts`) : aperçu du tracé en cours, motif de refus affiché (`N LETTRES REQUISES`, `DÉJÀ TROUVÉ`, `INCORRECTE`), animations de validation. Repliable en pastille compteur *n / N* — ouvert par défaut sur desktop, replié sur mobile (le repli n'est pas mémorisé, il suit la largeur d'écran).

## Écran de victoire

Quand tous les mots du niveau sont trouvés (`src/main.ts:triggerWin`). Un **défi** gagné pour la première fois annonce l'étoile obtenue (*n / 12*) et ce qu'elle débloque. L'écran propose ensuite les suites du niveau (`nextChoices`) : le niveau suivant (`SUIVANT`), le défi qui vient de s'ouvrir (`DÉFI`), ou un repli `CONTINUER` vers le premier niveau jouable ; plus le retour à la carte.

## Règle du jeu

Une chip « i » ouvre le panneau de règle, sur l'accueil comme dans le header de partie (même composant `.diff-panel`). En partie, il s'ouvre automatiquement au tout premier niveau lancé seulement : la mécanique n'étant pas devinable, elle est présentée d'emblée, puis ne revient plus (`localStorage`, `tracemot.rule-seen`).

## Explications sur la carte

Le même composant sert d'explication *in situ* : sur la carte, tout ce qui **nomme un palier** répond au clic — le compteur d'étoiles (ce qu'une étoile vaut), chaque jalon de difficulté (ce que la difficulté change, et ce qui l'ouvre si elle est verrouillée), l'onglet du mode verrouillé (ce qu'il faut pour l'atteindre, et ce qu'on y trouvera). Un seul panneau ouvert à la fois ; le voile, la croix et Échap ferment. Le jalon est le seul endroit où les descriptions des difficultés (`difficultyDesc`, `render/i18n.ts`) sont affichées.

Les **cases restent inertes** : une case allumée lance son niveau, une case pointillée ne fait rien. Sa raison d'être verrouillée est unique et déjà lisible (la case précédente n'est pas validée) ; un défi verrouillé la porte même en toutes lettres (« TERMINEZ LA LIGNE »).
