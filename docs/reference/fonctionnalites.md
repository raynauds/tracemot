# Fonctionnalités

## Modes de jeu

Trois grilles prédéfinies (`GAME_MODES`), nommées « nombre de mots × nombre de lettres » : 5×5 (grille 5×5), 20×5 (grille 10×10) et 8×8 (grille 8×8). Le mode se change à chaud depuis la chip « ▦ » du header (même feuille/popover que la difficulté) : la grille Pixi, la caméra et le registre sont reconstruits et une partie est relancée, confirmé par un toast. Le mode choisi est mémorisé (`localStorage`).

## Génération de la grille

Découpe en pavage (backtracking randomisé, élagage par composantes connexes) puis vérification d'exclusivité contre le dictionnaire complet, avec réparation hill-climbing : le mot impliqué dans un tracé parasite est mis en concurrence avec plusieurs remplaçants, le meilleur est retenu. En pratique la grille converge au premier tirage : quelques ms en 5×5, ~15-30 ms en 8×8, ~150-250 ms en 20×5. Le harnais `npm run check:solver` (Node, `tools/solver-check.mjs`) vérifie les invariants sur N grilles par mode et difficulté, avec un énumérateur de tracés indépendant du solveur.

## Dictionnaires

Cinq fichiers de mots dans `public/dictionnaires/` :

- `dictionnaire.txt` - dictionnaire complet, valide les mots joués.
- `1_dico_entree_enfant.txt`, `2_dico_entree_ado.txt`, `3_dico_entree_adulte.txt`, `4_dico_entree_non_connu.txt` - quatre paliers de vocabulaire, disjoints entre eux, d'où sont tirés les mots cachés selon la difficulté.

## Tracé

Au doigt ou à la souris (events fédérés Pixi), avec backtrack, vibration sur mobile et ligne d'encre suivant le tracé, rendue en WebGL par PixiJS. Feedbacks Pixi-natifs : distribution en cascade, rebond d'une case rejoignant le tracé, flash et secousse au refus, tampon à la validation.

## Caméra : zoom & pan

La grille est rendue plein écran par Pixi et cadrée par une caméra. Zoom à la molette (centré sur le pointeur), au pinch tactile ou via les boutons flottants + / − / tout voir ; pan par glissé hors case, au clavier (flèches, ZQSD/WASD) et auto-pan quand le tracé approche un bord. Sur écran tactile, les boutons + / − sont masqués (le pinch les remplace) ; seul « tout voir » reste.

Le zoom est borné entre le dézoom maximum (grille entière plus une marge tout autour, `VIEW_MARGIN`) et 3×3 cases. Le zoom affiché au chargement est distinct de ces bornes : c'est le cadrage « tout voir », plus serré, qui vise `FIT_MARGIN_PX` de marge horizontale (la grille remplit la largeur sur mobile) tout en gardant la marge verticale du dézoom maximum (pour ne pas coller au header sur desktop).

## Registre des mots

Aperçu du tracé en cours, motif de refus affiché (n lettres requises selon le mode, déjà trouvé, absent du dictionnaire), animations de validation.

## Règle du jeu

Un bouton « ? » dans le header ouvre le panneau de règle (même voile et même feuille/popover que la difficulté). Il s'ouvre automatiquement à la première visite seulement : la mécanique n'étant pas devinable, elle est présentée d'emblée, puis ne revient plus (`localStorage`).

## Mode debug

`DEBUG = true` dans `src/game/config.ts` : liste tous les mots trouvables de la grille, survol pour voir leur tracé.
