# Fonctionnalités

## Modes de jeu

Trois grilles prédéfinies (`GAME_MODES`) : 5×5 (5 mots de 5 lettres), 10×5 (10 mots de 5 lettres) et 8×8 (8 mots de 8 lettres). Le mode se change à chaud depuis la chip « ▦ » du header (même feuille/popover que la difficulté) : la grille Pixi, la caméra et le registre sont reconstruits et une partie est relancée, confirmé par un toast. Le mode choisi est mémorisé (`localStorage`).

## Génération de la grille

Découpe en pavage (backtracking randomisé) puis vérification d'exclusivité contre le dictionnaire complet, avec remplacement d'un mot impliqué tant qu'un tracé parasite subsiste. ~30-50 ms par grille en pratique.

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

Aperçu du tracé en cours, motif de refus affiché (5 lettres requises, déjà trouvé, absent du dictionnaire), animations de validation.

## Règle du jeu

Un bouton « ? » dans le header ouvre le panneau de règle (même voile et même feuille/popover que la difficulté). Il s'ouvre automatiquement à la première visite seulement : la mécanique n'étant pas devinable, elle est présentée d'emblée, puis ne revient plus (`localStorage`).

## Mode debug

`DEBUG = true` dans `js/config.js` : liste tous les mots trouvables de la grille, survol pour voir leur tracé.
