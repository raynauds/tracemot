# Spec fonctionnelle : progression par sections, défis et étoiles

Remplace la progression décrite dans `2026-07-14_niveaux-et-progression.md` (carte 4×6 à adjacence géométrique, 1 boss par section, 100 niveaux par mode). Les parties **Partie**, **Données de niveaux** et **Persistance** de ce document sont reprises et amendées ici ; le reste du document précédent est caduc.

Le jeu libre (choix d'un mode + difficulté → grille aléatoire) est remplacé par une progression en niveaux prédéfinis, organisés en sections de difficulté croissante et débloqués de proche en proche. Les sélecteurs de mode et de difficulté du header disparaissent au profit d'un écran de sélection de niveau.

## Modes

Série N×N : un mode = N mots de N lettres sur une grille N×N.

| Mode | Niveau normal       | Défi                        |
| ---- | ------------------- | --------------------------- |
| 5×5  | 5 mots de 5 lettres | 10×10, 20 mots de 5 lettres |
| 6×6  | 6 mots de 6 lettres | 12×12, 24 mots de 6 lettres |
| 7×7  | 7 mots de 7 lettres | 14×14, 28 mots de 7 lettres |
| 8×8  | 8 mots de 8 lettres | 16×16, 32 mots de 8 lettres |

- Le défi d'un mode N×N est une grille 2N×2N contenant 4×N mots de N lettres. Tous les défis d'un mode ont le même format.
- Les modes actuels `maxi` et `longs` disparaissent : le 10×10 devient le format défi du 5×5, le 8×8 devient un mode de la série.
- Au premier lancement, seul le 5×5 est accessible.

## Structure d'un mode

4 sections × 18 niveaux = **72 niveaux par mode**, soit 288 au total (dont 48 défis).

Une section = une difficulté, dans l'ordre des 4 rangs (échelle Bronze→Platine) :

| Section | Difficulté     |
| ------- | -------------- |
| 1       | 1 · Bronze     |
| 2       | 2 · Argent     |
| 3       | 3 · Or         |
| 4       | 4 · Platine    |

### Contenu d'une section

3 lignes × 5 niveaux normaux, chaque ligne se terminant par un défi :

```
ligne 1   1-1   1-2   1-3   1-4   1-5    →   1-A
ligne 2   1-6   1-7   1-8   1-9   1-10   →   1-B
ligne 3   1-11  1-12  1-13  1-14  1-15   →   1-C
```

- **Identifiants** : `s-n` pour les normaux (`n` de 1 à 15, numérotation continue sur la section), `s-A` / `s-B` / `s-C` pour les défis.
- Les 15 normaux et les 3 défis d'une section utilisent les quotas de difficulté de la section.
- La difficulté croît à l'intérieur d'une section, du 1-1 au 1-15 et du A au C (leviers : nombre de coudes, sens de lecture, densité d'enchevêtrement). **Le réglage fin de cette courbe fait l'objet d'un travail séparé** et n'est pas spécifié ici.

## Déblocage

### Chaîne des niveaux

- Un niveau normal débloque le normal suivant : 1-1 → 1-2 → … → 1-5.
- Le **dernier normal d'une ligne** débloque deux cases : le **défi de sa ligne** et le **premier normal de la ligne suivante**.
  - 1-5 → 1-A + 1-6
  - 1-10 → 1-B + 1-11
  - 1-15 → 1-C
- Un défi ne débloque aucun niveau au sein de sa section. Il rapporte une **étoile**.

Un défi coûte donc toujours 6 niveaux (les 5 normaux de sa ligne, puis lui-même).

### Étoiles

**1 défi validé = 1 étoile.** Les étoiles sont comptées **par mode** (12 au maximum : 4 sections × 3 défis). Les 4 premières étoiles d'un mode débloquent, dans l'ordre :

| Étoile | Débloque                          |
| ------ | --------------------------------- |
| 1re    | Section 2 · Argent                |
| 2e     | Section 3 · Or                    |
| 3e     | **Mode suivant** (son 1-1)        |
| 4e     | Section 4 · Platine               |

Peu importe **d'où** viennent les étoiles : 1-A + 1-B + 1-C (une section entière) et 1-A + 2-A + 3-A (un défi par section, en difficulté croissante) valent la même chose et coûtent tous deux 18 niveaux. Le joueur qui trouve le Bronze trop facile n'est pas taxé pour plonger.

Les étoiles au-delà de la 4e ne débloquent rien : elles servent de **score de complétion** du mode, affiché sur son onglet (« 7 / 12 ★ »).

Débloquer les 4 sections d'un mode coûte au minimum 24 niveaux ; atteindre le 8×8 en coûte 54 (3 étoiles dans chacun des trois modes précédents).

## Carte du mode

En DOM (HTML/CSS), plein écran par-dessus le canvas, dans le style papier existant. Pixi reste dédié à la grille de jeu. C'est l'écran d'accueil de l'application.

### Disposition

- Les sections sont empilées verticalement, sans encadrés — **carte continue**. Chaque section est introduite par un jalon inline : séparateur horizontal, nom de la difficulté, compteur (« 7 validés », « 18 ✓ » quand elle est complète, défis compris) et étoiles gagnées dans la section (« ★★☆ »).
- Dans une section, 3 lignes de 5 cases carrées (numéro `n` seul, la section donnant le contexte).
  - **Desktop** : la case défi est une grande case à droite de sa ligne (env. 2×1 unités, hauteur de la ligne).
  - **Mobile** : la case défi est un bandeau pleine largeur sous sa ligne.
- **Croissance additive** : seules les lignes contenant au moins une case visible sont rendues. Sous la dernière section débloquée, le jalon de la section suivante peut être affiché **verrouillé** (nom de la difficulté et prix, tous deux grisés, au même ton) — mais seulement s'il est *à un défi près* (cf. « Montrer un verrou » ci-dessous). Sinon la carte s'arrête sur la frange de brouillard, qui suffit à dire « il y a une suite » sans en promettre le prix.

### Montrer un verrou

Règle unique, valable pour **tout ce qui se débloque à l'étoile** — sections comme onglets de mode :

> Une chose verrouillée n'est montrée que lorsqu'elle est **à un défi près** : il lui manque exactement une étoile, **et** un défi est actuellement *jouable* (débloqué, non validé) pour la donner.

Sinon, elle est absente : ni jalon, ni onglet. Un défi *visible mais pas encore jouable* ne suffit pas.

Ce que ça donne, les seuils (1, 2, 3, 4) étant distincts et un défi valant une étoile — il y a donc toujours **au plus un verrou montré à la fois**, et il est toujours à une étoile (d'où le libellé fixe « ★ Encore 1 étoile », sans pluriel à porter) :

| Étoiles du mode | Verrou montré, si un défi est jouable |
| --------------- | ------------------------------------- |
| 0               | Section 2 · Argent                    |
| 1               | Section 3 · Or                        |
| 2               | Onglet du mode suivant (cadenas)      |
| 3               | Section 4 · Platine                   |

**Pourquoi.** Au premier lancement il manque bien une étoile pour la section 2 — mais aucun défi n'est atteignable (1-A demande 1-5). Annoncer le prix à cet instant, c'est promettre avant d'avoir donné le moyen de tenir la promesse. Avec cette règle, le premier défi et l'annonce de ce qu'il ouvre apparaissent **ensemble**, au même instant.

Conséquence assumée : la barre d'onglets ne montre que « 5×5 », seul, jusqu'à ce que le mode suivant soit à un défi près. Un cadenas permanent est du bruit ; un cadenas qui apparaît est un événement.

### États des cases

Trois informations dérivées, jamais stockées (seule la liste des niveaux validés est persistée) :

| État                   | Règle                                                        | Rendu (légende joueur)                                                            |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Validée**            | Le niveau figure dans la progression persistée.              | Fond vert pâle, coche ✓ vermillon, cliquable (rejeu). « VALIDÉ »                  |
| **Jouable**            | Débloquée (cf. chaîne ci-dessus) et non validée.             | Fond blanc, bordure pleine + ombre portée, cliquable, lance le niveau. « JOUABLE » |
| **Visible désactivée** | Débloquée par une case actuellement *jouable*.               | Contour pointillé grisé, numéro estompé, non cliquable. « À DÉBLOQUER »            |
| **Cachée**             | Tout le reste.                                               | Absente de la carte.                                                              |

Le joueur voit donc toujours **un pas d'avance**, et pas davantage : le brouillard est conservé, la découverte d'un défi reste une surprise (il apparaît en « visible désactivé » quand le dernier normal de sa ligne devient jouable).

Une légende en pied de carte reprend les trois états visibles.

### Case défi

Elle affiche « DÉFI », le format (« 10×10 · 20 MOTS DE 5 LETTRES »), une étoile, et une mention d'état : « TERMINEZ LA LIGNE » (visible désactivée), « PRÊT À JOUER » (jouable), « ✓ VALIDÉ » (validée).

Le jalon d'une section apparaît dès qu'au moins une de ses cases est visible.

### Déroulé de référence

- **Premier lancement** : 1-1 jouable ; 1-2 visible désactivée ; le reste caché.
- **Après 1-1** : 1-1 validée ; 1-2 jouable ; 1-3 visible désactivée.
- **Après 1-1…1-4** : 1-5 jouable ; **1-A et 1-6 visibles désactivées** (première apparition du défi).
- **Après 1-5** : 1-A et 1-6 jouables ; 1-7 visible désactivée. Le joueur choisit : continuer la ligne 2, ou tenter le défi.
- **Après 1-A** : 1re étoile → la section 2 apparaît sur la carte, 2-1 jouable, 2-2 visible désactivée.

## Écran de sélection

- **Header** : titre « Traceword », onglets de mode, compteur d'étoiles du mode courant (« 3 / 12 ★ ») et rappel du prochain palier (« Prochaine étoile : Platine »).
- **Onglets de mode** : les modes débloqués, plus le prochain grisé avec cadenas (les modes plus lointains sont cachés). Un mode débloqué mais jamais visité porte une pastille vermillon.
- Sous le header, une ligne d'accroche en italique : « Choisissez un niveau. Chaque défi validé rapporte une étoile. » ; au premier lancement : « Tracez tous les mots de la grille pour valider le niveau et révéler la suite. »
- Cliquer une case validée ou jouable lance le niveau.
- En partie, le header affiche l'identifiant du niveau (ex. « 5×5 · 1-12 », « 5×5 · Défi 1-A ») et un bouton retour vers la carte.

## Partie

- Lancer un niveau charge sa grille prédéfinie : aucune génération au runtime.
- **Validation d'un tracé** : longueur requise, pas déjà trouvé, et le mot appartient à la **liste des mots du niveau**. Plus de vérification contre le dictionnaire complet : les grilles sont pré-vérifiées comme ne contenant exactement que les mots de leur solution. Motif de refus : « INCORRECTE ».
- Le dictionnaire complet n'est plus chargé au runtime (sauf en mode DEBUG pour le panneau des mots trouvables).
- **Victoire** : le niveau est ajouté à la progression ; l'écran de victoire propose le retour à la carte (où les nouvelles cases apparaissent). Si le niveau est un défi, l'écran de victoire annonce l'étoile gagnée et ce qu'elle débloque.
- **Rejeu** : un niveau validé est relançable librement (même grille) ; aucun impact sur la progression, pas de score ni de chrono enregistré pour l'instant.

## Données de niveaux

Toutes les grilles sont prédéfinies, générées hors-ligne et versionnées dans le repo.

- **Script de génération** (`scripts/generate-levels.ts`, exécuté en local, jamais au runtime) : réutilise le solveur et les dictionnaires actuels pour produire, par mode, **60 grilles normales** (15 × 4 sections) + **12 grilles défi** (3 × 4 sections). Soit 288 grilles au total, dont 48 grandes.
- **Pré-vérification** dans le script : pavage parfait (`wordCount × wordLength = rows × cols`) et **aucun tracé parasite** — aucun mot du dictionnaire complet de la longueur requise n'est traçable en dehors de la solution. Une grille qui échoue est régénérée.
- **Format** : un fichier JSON par mode (ex. `levels/5x5.json`), chargé à l'ouverture de l'onglet du mode. Par niveau : identifiant (`"1-1"`, `"1-A"`), lettres de la grille, mots de la solution, et tracés de la solution (indices de cases — utiles pour les indices et le debug).
- Les grilles passent ensuite une **review algorithmique et humaine** (cf. courbe de difficulté intra-section, travail séparé).

## Persistance

localStorage uniquement :

- `traceword.progress.<modeId>` : liste des identifiants de niveaux validés (ex. `["1-1","1-2","1-A"]`). Tout l'état de la carte (visible / jouable / validé, étoiles, déblocage des sections et des modes) se recalcule à partir de ces listes. Le nombre d'étoiles d'un mode = nombre d'identifiants se terminant par `-A`, `-B` ou `-C`.
- `traceword.lastMode` : dernier mode consulté, pour rouvrir la carte au bon onglet.
- Les clés actuelles `traceword.mode` et `traceword.difficulty` deviennent obsolètes.

## Impacts sur l'existant

- `config.ts` : `GAME_MODES` passe à la série 5×5…8×8 + formats défi ; `ENABLED_MODES`, `ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY` et les sélecteurs associés (`bindModeBar`, `bindDifficultyBar`, toasts) disparaissent du runtime. `DIFFICULTY_QUOTAS` et les labels restent, utilisés par le script de génération et les titres de sections.
- `main.ts` : `startGame` prend un niveau (grille prédéfinie) au lieu de générer ; le générateur (`createGridGenerator`) migre côté script.
- `rules.ts` : validation contre `state.solution` au lieu de `state.words`.
- La caméra et le rendu Pixi acceptent déjà des grilles jusqu'à 16×16 (cf. spec grille plein écran).

## État de référence pour la maquette

Un seul écran (onglet 5×5) doit montrer tous les états possibles. Progression persistée :

```
traceword.progress.5x5 = [
  "1-1" … "1-15", "1-A", "1-B", "1-C",   // section 1 entière → 3 étoiles
  "2-1" … "2-5",                          // section 2 : ligne 1 terminée
  "3-1" … "3-4"                           // section 3 : début de ligne 1
]
```

soit 27 niveaux validés et **3 étoiles**.

- **Onglets** : 5×5 ouvert (3 / 12 ★) ; 6×6 débloqué (3e étoile) avec pastille. **7×7 absent** : son verrou est tenu par le 6×6, encore vierge — il n'est donc pas à un défi près. 8×8 absent.
- **Section 1 · Bronze** : 18 ✓, ★★★ — tout validé, défis compris.
- **Section 2 · Argent** : 2-1…2-5 validés ; **2-A jouable** et 2-6 jouable ; 2-7 visible désactivée ; le reste caché.
- **Section 3 · Or** : 3-1…3-4 validés ; 3-5 jouable ; **3-A et 3-6 visibles désactivées** ; le reste caché.
- **Section 4 · Platine** : jalon **verrouillé** (« ★ Encore 1 étoile »), aucune case rendue — montré parce que 2-A est jouable et donnerait la 4e étoile.

L'écran couvre ainsi : les 4 états d'une case normale, les 3 états visibles d'un défi (validé / jouable / visible désactivé), une section complète, deux sections en cours, une section verrouillée et montrée, et 2 des 3 états d'onglet de mode. L'onglet verrouillé-et-montré (cadenas) demande un autre état de progression : un mode à 2 étoiles avec un défi jouable.

## Points reportés (hors périmètre de cette spec)

- **Courbe de difficulté intra-section** : leviers (coudes, sens de lecture, enchevêtrement), review algorithmique et humaine des 288 grilles.
- **Sauvegarde de partie en cours** : indispensable sur les défis (un 16×16 à 32 mots est une session, pas une pause) — sans reprise, fermer l'onglet efface tout.
- **Indices** : la chaîne de déblocage étant linéaire, un joueur bloqué sur 1-3 n'a strictement rien d'autre à faire. Les tracés de solution sont déjà stockés ; révéler une lettre puis un mot est le filet de sécurité de la structure.
- **Ergonomie tactile des grands défis** : le tracé continu au doigt sur un 16×16 (256 cases) demande zoom et pan, qui cassent le drag. À tester tôt.
- **Récompense des défis** : aujourd'hui rien ne distingue un défi validé d'un normal validé hors l'étoile. Chrono / étoiles de performance sur les défis uniquement resteraient à évaluer.
