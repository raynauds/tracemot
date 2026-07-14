# Spec fonctionnelle : niveaux prédéfinis et déblocage progressif

Le jeu libre actuel (choix d'un mode + difficulté → grille aléatoire) est remplacé par une progression en niveaux : chaque mode contient 100 niveaux prédéfinis, organisés en sections de difficulté croissante, débloqués de proche en proche sur une carte. Les sélecteurs de mode et de difficulté du header disparaissent au profit d'un écran de sélection de niveau.

## Modes

Série N×N : un mode = N mots de N lettres sur une grille N×N.

| Mode | Puzzle              | Boss                        |
| ---- | ------------------- | --------------------------- |
| 5×5  | 5 mots de 5 lettres | 10×10, 20 mots de 5 lettres |
| 6×6  | 6 mots de 6 lettres | 12×12, 24 mots de 6 lettres |
| 7×7  | 7 mots de 7 lettres | 14×14, 28 mots de 7 lettres |
| 8×8  | 8 mots de 8 lettres | 16×16, 32 mots de 8 lettres |

- Le boss d'un mode N×N est une grille 2N×2N contenant 4×N mots de N lettres.
- « Boss » est le terme interne ; au joueur, il est présenté comme **« Défi »** (cf. rendu carte).
- Les modes actuels `maxi` et `longs` disparaissent en tant que modes jouables : le 10×10 devient le format boss du 5×5, le 8×8 devient un mode de la série.
- **Déblocage de mode** : le mode N+1 est débloqué dès qu'un boss quelconque du mode N est validé (1-25 ou 2-25 ou …). Au premier lancement, seul le 5×5 est accessible.

## Structure d'un mode

4 sections × 25 niveaux = 100 niveaux. Une section = une difficulté, dans l'ordre des 4 premières difficultés existantes (« Brûlant » n'est pas utilisé) :

| Section | Difficulté (quotas actuels) |
| ------- | --------------------------- |
| 1-\*    | 1 · Doux                    |
| 2-\*    | 2 · Équilibré               |
| 3-\*    | 3 · Relevé                  |
| 4-\*    | 4 · Corsé                   |

Numérotation `s-n` : section `s` (1–4), niveau `n` (1–25). Les niveaux 1 à 24 sont des grilles normales du mode ; le niveau 25 est le boss. Le boss utilise les quotas de difficulté de sa section (le 1-25 est un 10×10 doux, le 2-25 un 10×10 équilibré, etc.).

### Disposition sur la carte

- 24 niveaux normaux en 4 lignes × 6 colonnes, numérotés ligne par ligne : 1-1…1-6 / 1-7…1-12 / 1-13…1-18 / 1-19…1-24. Chaque case fait 1 unité de côté et affiche le numéro `n` seul (1–24), la section donnant le contexte.
- Le boss (« Défi ») : en desktop, grande case d'environ 4×4 unités collée à droite du bloc 4×6 ; en mobile, bandeau pleine largeur sous la grille de la section. L'adjacence logique (colonne 6) est la même dans les deux dispositions.
- Les sections sont empilées verticalement : la dernière ligne de la section `s` touche colonne à colonne la première ligne de la section `s+1` (1-19↔2-1, 1-20↔2-2, …, 1-24↔2-6).
- **Carte continue, sans encadrés** : pas de cadre autour des sections. Chaque section est introduite par un jalon inline — séparateur horizontal portant le nom de la difficulté et un compteur de section (« 12 validés », « 25 ✓ » quand elle est complète, boss compris).
- **Croissance additive** : seules les lignes contenant au moins une case visible sont rendues, sans espace réservé pour les lignes entièrement cachées. En bas de carte, une frange de brouillard (dégradé vers le fond + mention « · · · LA CARTE CONTINUE · · · ») suggère la suite.

### Adjacence

Purement géométrique sur la carte : haut / bas / gauche / droite.

- Dans une section : voisins immédiats du bloc 4×6.
- Entre sections : dernière ligne de `s` ↔ première ligne de `s+1`, colonne à colonne.
- Boss : adjacent aux 4 cases de la colonne 6 de sa section (s-6, s-12, s-18, s-24).

## États des cases

Trois informations dérivées, jamais stockées (seule la liste des niveaux validés est persistée) :

| État                   | Règle                                                             | Rendu (légende joueur)                                                             |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Validée**            | Le niveau figure dans la progression persistée.                   | Fond vert pâle, coche ✓ vermillon, cliquable (rejeu). « VALIDÉ »                   |
| **Active non validée** | Adjacente à une case validée, ou racine (1-1 d'un mode débloqué). | Fond blanc, bordure pleine + ombre portée, cliquable, lance le niveau. « JOUABLE » |
| **Visible désactivée** | Adjacente à une case active (validée ou non).                     | Contour pointillé grisé, numéro estompé, non cliquable. « À DÉBLOQUER »            |
| **Cachée**             | Tout le reste.                                                    | Absente de la carte.                                                               |

Une légende en pied de carte reprend les trois états visibles (VALIDÉ / JOUABLE / À DÉBLOQUER).

Cas particulier du boss : **visible** dès qu'une de ses cases adjacentes est active, mais **actif** seulement quand les 24 niveaux normaux de sa section sont validés. La case affiche « DÉFI », le format (« 10×10 · 20 MOTS DE 5 LETTRES ») et une mention d'état : « TERMINEZ LES 24 NIVEAUX » (visible désactivé), « PRÊT À JOUER » (actif), « ✓ VALIDÉ » (validé).

Le jalon d'une section (séparateur, titre, compteur) apparaît dès qu'au moins une de ses cases est visible.

### Déroulé attendu (exemples de référence)

- **Premier lancement** : 1-1 active non validée ; 1-2 et 1-7 visibles désactivées ; le reste caché.
- **Après 1-1** : 1-1 validée ; 1-2 et 1-7 actives ; 1-3, 1-8, 1-13 visibles désactivées.
- **Après 1-1…1-6** : 1-1…1-6 validées ; 1-7…1-12 actives ; 1-13…1-18 visibles désactivées ; boss 1-25 visible désactivé (adjacent à 1-6 active, mais 24 niveaux non validés) ; le reste caché.
- Dès qu'une case de la dernière ligne de 1-_ est **active**, les cases correspondantes de 2-_ deviennent visibles désactivées ; dès qu'elle est **validée**, la case 2-\* en dessous devient active.

## Écran de sélection

En DOM (HTML/CSS), plein écran par-dessus le canvas, dans le style papier existant. Pixi reste dédié à la grille de jeu.

- Header : titre « Tracemot », onglets de mode, et compteur « N VALIDÉS » (portée à trancher, cf. points ouverts).
- Onglets de mode : les modes débloqués, plus le prochain mode grisé avec cadenas (les modes plus lointains sont cachés). Un mode débloqué mais jamais visité porte une pastille vermillon sur son onglet.
- Sous le header, une ligne d'accroche en italique : « Choisissez un niveau. Chaque grille validée révèle la suite de la carte. » ; au premier lancement : « Tracez tous les mots de la grille pour valider le niveau et révéler la suite. »
- Sous l'onglet actif : les sections visibles, empilées, avec leur nom de difficulté (« Doux », « Équilibré », …).
- Cliquer une case active (validée ou non) lance le niveau.
- C'est l'écran d'accueil de l'application. En partie, le header affiche l'identifiant du niveau (ex. « 5×5 · 1-12 ») et un bouton retour vers la carte.

## Partie

- Lancer un niveau charge sa grille prédéfinie : aucune génération au runtime.
- **Validation d'un tracé** : longueur requise, pas déjà trouvé, et le mot appartient à la **liste des mots du niveau** (plus de vérification contre le dictionnaire complet — les grilles sont pré-vérifiées sans tracé parasite, donc tout mot valide traçable est un mot de la solution). Motif de refus : « INCORRECTE ».
- Le dictionnaire complet n'est plus chargé au runtime (sauf en mode DEBUG pour le panneau des mots trouvables).
- **Victoire** : le niveau est ajouté à la progression, l'écran de victoire propose le retour à la carte (où les nouvelles cases débloquées apparaissent).
- **Rejeu** : un niveau validé est relançable librement (même grille) ; aucun impact sur la progression, pas de score ni de chrono enregistré pour l'instant.

## Données de niveaux

Toutes les grilles sont prédéfinies, générées hors-ligne et versionnées dans le repo.

- **Script de génération** (`scripts/generate-levels.ts`, exécuté en local, jamais au runtime) : réutilise le solveur et les dictionnaires actuels pour produire, par mode, 96 grilles normales (24 × 4 difficultés) + 4 grilles boss.
- **Pré-vérification** dans le script : pavage parfait (wordCount × wordLength = rows × cols) et **aucun tracé parasite** — aucun mot du dictionnaire complet de la longueur requise n'est traçable en dehors de la solution. Une grille qui échoue est régénérée.
- **Format** : un fichier JSON par mode (ex. `levels/5x5.json`), chargé à l'ouverture de l'onglet du mode. Par niveau : identifiant (`"1-1"`), lettres de la grille, mots de la solution, et tracés de la solution (indices de cases — peu coûteux à stocker, utile pour de futurs indices et pour le debug).

## Persistance

localStorage uniquement :

- `tracemot.progress.<modeId>` : liste des identifiants de niveaux validés (ex. `["1-1","1-2"]`). Tout l'état de la carte (visible / actif / validé, boss, déblocage des modes) se recalcule à partir de ces listes.
- `tracemot.lastMode` : dernier mode consulté, pour rouvrir la carte au bon onglet.
- Les clés actuelles `tracemot.mode` et `tracemot.difficulty` deviennent obsolètes (les sélecteurs disparaissent).

## Impacts sur l'existant

- `config.ts` : `GAME_MODES` passe à la série 5×5…8×8 + formats boss ; `ENABLED_MODES`, `ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY` et les sélecteurs associés (`bindModeBar`, `bindDifficultyBar`, toasts) disparaissent du runtime. `DIFFICULTY_QUOTAS` et les labels restent, utilisés par le script de génération et les titres de sections.
- `main.ts` : `startGame` prend un niveau (grille prédéfinie) au lieu de générer ; le générateur (`createGridGenerator`) migre côté script.
- `rules.ts` : validation contre `state.solution` au lieu de `state.words`.
- La caméra et le rendu Pixi acceptent déjà des grilles jusqu'à 16×16 (paramétrés par la géométrie, cf. spec grille plein écran).

## État de référence pour la maquette

Un seul écran (onglet 5×5) doit montrer tous les états possibles. Progression persistée pour l'obtenir :

```
tracemot.progress.5x5 = [
  "1-1" … "1-24", "1-25",   // section 1 entière, boss compris
  "2-1" … "2-24",           // section 2 : les 24 normaux, pas le boss
  "3-1", "3-2", "3-7"       // section 3 : début de progression
]
```

soit 52 niveaux validés. États dérivés :

- **Onglets** : 5×5 ouvert ; 6×6 débloqué (boss 1-25 validé) ; 7×7 grisé avec cadenas ; 8×8 caché.
- **Section 1 · Doux** : tout validé, boss compris → _boss validé_.
- **Section 2 · Équilibré** : 24 niveaux validés, boss 2-25 **actif non validé** (seul état boss jouable).
- **Section 3 · Relevé** : mélange de tous les états normaux, boss **visible désactivé** (adjacent à 3-6 active, mais 24 normaux non validés) :

  ```
  col →   1    2    3    4    5    6      boss
  ligne 1 ✔    ✔    ●    ●    ●    ●
  ligne 2 ✔    ●    ○    ○    ○    ○      ○
  ligne 3 ●    ○    ·    ·    ·    ·
  ligne 4 ○    ·    ·    ·    ·    ·
  ```

  ✔ validé · ● actif non validé · ○ visible désactivé · « · » caché.
  (3-3…3-6 sont actives par adjacence à la dernière ligne de la section 2, entièrement validée ; 3-8 et 3-13 par adjacence à 3-2 et 3-7.)

- **Section 4 · Corsé** : entièrement cachée (aucune case active en ligne 4 de la section 3), boss caché — la section n'apparaît pas du tout.

L'écran couvre ainsi : les 4 états d'une case normale, les 4 états d'un boss (validé / actif / désactivé / caché), une section complète, une section en cours, une section invisible, et les 3 états d'onglet de mode.
