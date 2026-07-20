---
version: alpha
name: Traceword
description: >-
  Papier, encre et vermillon. Un jeu de mots tracés à la main sur une grille,
  rendu comme une page imprimée : angles vifs, filets nets, aucune rondeur.
colors:
  # Surfaces
  paper: "#f6f1e7" # fond général, et couleur du texte posé sur l'encre
  card: "#fdfbf5" # surface surélevée : case, panneau, bouton au repos
  card-hover: "#f3ecdc" # même surface, survolée
  # Encre
  ink: "#26221c" # texte, filets, ombres portées
  muted: "#6e6656" # texte secondaire, libellés
  ghost: "#b9af9c" # texte inerte sur fond SOMBRE : verrouillé, désactivé
  ghost-strong: "#746b57" # texte inerte lisible sur paper/card (≥4.5:1 AA)
  # Accent (unique)
  vermilion: "#b3402a" # l'accent, et lui seul : victoire, étoile, compteur
  # Filets
  line: "#d8cfbc" # séparation interne, filet subordonné
  # Carte de progression
  map-validated: "#efe9da" # case résolue
  map-rule: "#c6bca6" # filet de la carte
  map-dash: "#c1b7a2" # pointillé du verrouillé
  map-count: "#8a806c" # chiffre secondaire
  # Encres d'autres mains (multijoueur, § dérogation cadrée ci-dessous)
  player-1: "#2f5a6b" # encre bleu pétrole
  player-2: "#5b4a78" # encre violette
  player-3: "#4f6b3a" # encre olive
  player-4: "#7d5a2a" # encre ocre brûlée
typography:
  display:
    fontFamily: Source Serif 4
    fontSize: 52px
    fontWeight: 700
    letterSpacing: 2px
  title:
    fontFamily: Source Serif 4
    fontSize: 30px
    fontWeight: 700
    letterSpacing: 0.5px
  brand: # hérité de l'accueil retiré (portage Rune) — sans consommateur,
    # réservé, cf. § Marque ; la manchette de la carte consomme `title`
    fontFamily: Source Serif 4
    fontSize: clamp(40px, 12vw, 72px)
    fontWeight: 700
    letterSpacing: 0.12em
  hero: # grand titre plein écran — "Gagné." de la victoire.
    # Même corps que le plafond de `brand` (72px) sans en consommer le
    # token : `brand` reste réservé à la marque (cf. § Marque).
    fontFamily: Source Serif 4
    fontSize: 72px
    fontWeight: 700
    letterSpacing: 1px
  numeral:
    fontFamily: IBM Plex Mono
    fontSize: 26px
    fontWeight: 600
  counter:
    fontFamily: IBM Plex Mono
    fontSize: 18px
    fontWeight: 600
  cell:
    fontFamily: Source Serif 4
    fontSize: 21px
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: Source Serif 4
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  hint:
    fontFamily: Source Serif 4
    fontSize: 14px
    fontWeight: 400
  action:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 1px
  label-caps:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 2.5px
  meta: # légende mono : légendes de carte, numéros d'aide, ours des crédits…
    fontFamily: IBM Plex Mono
    fontSize: 11px # variante compactée à 9.5px : légendes de la carte/du défi,
    # trop à l'étroit (largeur fixe, bandeau mobile) pour le corps plein —
    # seule exception tolérée, aucune troisième taille.
    fontWeight: 400
    letterSpacing: 1.5px
rounded:
  none: 0px # tout, sans exception discutable
  full: 9999px # pastille « nouveau » et avatars joueur (dérogation multijoueur)
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  button-primary: # « Niveau suivant » — le seul bouton plein vermillon
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    height: 62px
    rounded: "{rounded.none}"
  button-action: # « Retour carte », onglets de mode — filet encre
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    padding: 8px 13px
    rounded: "{rounded.none}"
  button-action-hover: # inversion encre/papier
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-action-active: # onglet sélectionné : même inversion, état permanent
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost: # « Voir le défi » — cerclé et lettré de vermillon
    backgroundColor: transparent
    textColor: "{colors.vermilion}"
    height: 54px
    rounded: "{rounded.none}"
  button-icon: # retour à la carte, règle du jeu, tout voir — icône nue
    backgroundColor: transparent
    textColor: "{colors.ink}" # règle du jeu : {colors.muted}, action rare
    size: 24px # règle du jeu : 20px
  button-icon-hover: # au survol comme à l'appui, sur toutes les icônes nues
    textColor: "{colors.vermilion}"
  button-icon-open: # état (panneau ouvert), pas survol : règle du jeu
    textColor: "{colors.ink}"
  panel: # règle du jeu, modales — filet encre 2px + ombre floue
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: 16px 16px 18px
    rounded: "{rounded.none}"
  ledger: # registre des mots trouvés
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    width: 300px
    rounded: "{rounded.none}"
  map-cell: # niveau jouable sur la carte — relief dur
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.cell}"
    rounded: "{rounded.none}"
  map-cell-validated: # niveau résolu
    backgroundColor: "{colors.map-validated}"
    textColor: "{colors.ink}"
  map-cell-locked: # visible, pas encore atteignable — pointillé, à plat
    backgroundColor: transparent
    textColor: "{colors.ghost}"
    typography: "{typography.meta}"
  grid-cell: # case de grille au repos (Pixi)
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  grid-cell-traced: # case du tracé en cours
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  grid-cell-found: # case d'un mot validé
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper}"
---

## Overview

Traceword se lit comme une page imprimée, pas comme une application. Le papier
crème, l'encre presque noire et le filet net sont le vocabulaire complet ; le
vermillon est la seule couleur, et il ne sert qu'à une chose : dire qu'un mot a
été trouvé. Une interface qui ne récompense rien reste en noir et blanc.

Le principe qui gouverne tout le reste : **rien n'est arrondi**. Pas un bouton,
pas un panneau, pas une case. Les seules exceptions sont la pastille de 6px qui
signale un mode nouvellement débloqué, et — en multijoueur — les avatars des
joueurs (§ Colors, dérogation « encres d'autres mains ») : elles sont rondes
précisément parce qu'aucune autre forme de l'interface ne l'est.

Deuxième principe : **l'interface s'efface devant la grille**. Le jeu est rendu
sur un canvas plein écran ; tout le chrome (en-tête, registre, boutons de zoom)
est un overlay flottant qui laisse passer les gestes de tracé. Un composant qui
n'a rien à dire ne doit pas occuper d'espace.

## Colors

La palette tient en trois registres. Le **papier** (`paper`, `card`,
`card-hover`) porte les surfaces, de la plus enfoncée à la plus surélevée.
L'**encre** (`ink`, `muted`, `ghost`) porte le texte, et sa dégradation dit
exactement l'état : lisible, secondaire, inerte. Le **vermillon** est unique et
non négociable — il marque le mot trouvé, l'étoile gagnée, le compteur, la
victoire. Si un élément est vermillon, c'est qu'il est gagné.

`ghost` ne tient son rôle « inerte » que sur fond sombre (`ink`, ~7,3:1) ou
pour un état réellement désactivé (exempté AA). Sur `paper`/`card`, il tombe
à ~1,9:1 — sous tout seuil lisible. `ghost-strong` (≥4,5:1 sur ces deux
surfaces) est la variante à utiliser dès qu'un texte sur fond clair doit
rester lu, sans pour autant porter le poids d'un texte secondaire
(`muted`) : le mot en cours de tracé, un lien discret.

Un quatrième groupe, `map-*`, existe pour la carte de progression seule. Son
papier est délibérément plus sourd que celui du jeu : l'accueil et la partie ne
doivent jamais se confondre à l'œil.

**Une seule source.** La palette est écrite dans `src/theme/tokens.ts`, et elle
seule. Le DOM et PixiJS — qui ne lit pas les variables CSS — en sont deux
consommateurs, dans leurs formats respectifs :

- `src/theme/tokens.css`, custom properties (`--paper`, `--ink`…) pour le DOM :
  **fichier généré**, jamais édité à la main (`npm run generate:tokens`, contrôlé
  par `npm run check:tokens`). Le même fichier porte aussi les filets
  (`--rule-*`) et les ombres dures (`--shadow-hard-*`) — voir § Elevation &
  Depth et § Shapes.
- `src/game/config.ts`, hexadécimal numérique (`PAPER = hex("paper")`) pour Pixi.

Changer une couleur = la changer dans `tokens.ts` et régénérer. Une seule couleur
échappe aux tokens : le vert `#2e7d32` du panneau de debug — c'est volontaire, le
debug n'est pas de l'interface produit.

### Dérogation cadrée : « encres d'autres mains » (multijoueur)

Ce système n'a qu'un accent, le vermillon, et cette règle n'est pas
négociable — sauf que le multijoueur impose d'identifier jusqu'à 3 autres
joueurs à l'écran, ce qu'aucune combinaison d'encre/papier ne permet. C'est la
décision de design la plus lourde du portage Rune ; elle est documentée ici
plutôt que traitée comme une exception sauvage.

Principe : le joueur local garde EXACTEMENT la sémantique actuelle — repos en
`card`, engagé en `ink`, acquis en `vermilion`. Il n'affiche jamais son propre
slot de couleur : pour lui-même, il reste « l'encre » ; les autres joueurs
deviennent des **encres colorées**, désaturées, de même valeur tonale que
`ink` — des couleurs de stylo, pas d'interface. Le vermillon reste hors de
cette palette, réservé à la récompense.

`player-1..4` (4 slots — `colorSlots` du state Rune, attribution stable au
premier slot libre, libérée au départ) ne sont utilisées QUE pour peindre ce
que font les AUTRES joueurs : tracé en cours distant (trait plein, alpha
~0.45), fond de case sous ce tracé (~12 %), tracé fantôme et liseré d'un mot
qu'ils ont trouvé, numéro du registre. Jamais sur un élément non possédé
(bouton, verrou, chrome) — la dérogation couvre l'appartenance, rien d'autre.

Teinte seule ne suffit pas à identifier un joueur (daltonisme, mémorisation) :
chaque élément qui appartient à un joueur porte AUSSI son avatar Rune
(`Rune.getPlayerInfo`), cerclé de sa teinte. C'est le second volet de la
dérogation `rounded` : les pastilles avatar sont rondes, au même titre que la
pastille « mode nouvellement débloqué » — la seule autre forme ronde du
système.

## Typography

Deux familles, et une règle de répartition stricte.

**Source Serif 4** porte tout ce qui se lit : titres, lettres de la grille, mots
du registre, phrases explicatives. Poids 400 pour le corps, 700 pour ce qui
titre.

**IBM Plex Mono** porte tout ce qui se compte ou se commande : compteurs,
libellés capitalés, boutons. Poids 600, avec un interlettrage large
(1 à 3px) qui augmente à mesure que le texte rapetisse — c'est ce qui rend un
libellé de 11px encore lisible et le distingue d'un titre.

Corollaire : **un chiffre n'est jamais en serif, un mot n'est jamais en mono.**
Si vous hésitez sur la famille, demandez-vous si l'élément se lit ou se compte.

Le profil `label-caps` (mono, 600, capitales espacées) est partagé par tout
libellé de ce type — registre, panneaux, crédits, réglages sonores — via la
custom property `--label-caps-weight` (`src/theme/base.css`) : un seul
600 à changer, pas quatre déclarations à retrouver.

`brand` (ex-accueil, sans consommateur depuis le portage Rune) et `hero`
(victoire) partagent le même corps — 72px, le plafond du clamp de `brand` —
sans partager le token : `brand` reste réservé à la marque (cf. § Marque),
`hero` porte l'italique et le corps plus resserré de l'écran de victoire.

## Layout

**Il n'y a pas de grille d'espacement, et c'est assumé.** L'interface actuelle
emploie des valeurs allant de 3 à 32px sans base commune : on y trouve du 7px,
du 11px, du 13px, du 26px. Ces valeurs sont des ajustements optiques, posés au
cas par cas pour aligner des lignes de base entre serif et mono. **Ne les
normalisez pas mécaniquement** — les « corriger » vers un multiple de 4 casserait
des alignements voulus.

L'échelle `spacing` déclarée ci-dessus n'est donc pas une description de
l'existant : c'est une **cible pour les nouveaux composants**. Elle reprend les
valeurs déjà dominantes dans le code — 8px (gouttière entre éléments frères),
12px et 16px (rembourrage interne), 24px et 32px (cadres et marges d'écran).
Écrivez le neuf dessus ; laissez l'ancien tranquille.

Structure d'écran : le corps est en `overflow: hidden`, sans flux et sans scroll
de page. Le canvas occupe tout ; le chrome est en `position: fixed`. Les
z-index sont attribués à la main, par étages — registre 16, en-tête 25 (il
englobe ses modales), victoire 30, carte 40, lobby de proposition/vote 42 (doc
04 — au-dessus de la carte ET de la victoire, une proposition peut survenir
sur n'importe quel écran local), règles 46 (elles se posent sur la carte comme
sur une partie), notifications éphémères 48 (doc 04 — toujours lisibles,
même par-dessus un vote en cours), chargement au-dessus de tout.

Trois écrans, dans cet ordre : **accueil → carte → partie**. Chacun se retire
par une flèche nue en haut à gauche, toujours la même — un seul dessin pour un
seul sens, « remonter d'un écran ». Deux écrans de consultation s'y ajoutent,
hors de ce fil : « Comment jouer » (le bouton COMMENT JOUER de l'accueil, et
d'office à la toute première partie) et les crédits (le lien CRÉDITS de
l'accueil) — même squelette, même flèche de sortie (`screen.css`).

## Elevation & Depth

Deux familles d'ombre, qui ne veulent pas dire la même chose. Ne les mélangez
jamais sur un même élément.

**L'ombre floue** (encre diluée via `color-mix`, décalage vertical, flou large)
dit « ce panneau flotte au-dessus de la page » : le registre (`0 14px 34px`),
les modales (`0 20px 44px`). Elle est réservée aux surfaces qui recouvrent
temporairement l'interface. Chaque teinte diluée (voile, ombre floue) s'écrit
`color-mix(in srgb, var(--ink) X%, transparent)` — jamais en `rgba()` littéral,
qui redirait la même couleur en hexadécimal ailleurs qu'à sa source. Les deux
densités de voile, elles, sont déjà tokenisées (`--veil-light`, `--veil-dense`,
§ Components → Panneaux) : un voile se pose avec le token, pas en `color-mix`
retapé.

**L'ombre dure** (encre pleine, décalage diagonal, flou nul) dit « ce papier est
découpé et posé » : les cases de la carte (`--shadow-hard-md`, `2.5px 2.5px 0`),
le défi qui clôt une ligne (`--shadow-hard-lg`, `4px 4px 0`, plus haut parce
qu'il compte plus), les petits éléments (`--shadow-hard-sm`, `1.5px 1.5px 0` ;
`--shadow-hard-xs`, `1px` en mobile). Elle est réservée aux éléments cliquables
de la carte, et elle **s'anime** : à l'appui, l'élément se translate exactement
de la valeur de son ombre et l'ombre disparaît. La case rejoint physiquement son
relief. C'est le seul retour tactile de l'interface — ne le remplacez pas par une
opacité.

Un cinquième palier, **mini** (`--shadow-hard-mini`, `2px 2px 0` ;
`--shadow-hard-mini-lg`, `3px 3px 0`), sert aux miniatures qui rejouent une
case ou un défi à une échelle bien plus petite que la carte réelle (les
figures de l'écran d'aide à 34px, le pouce du curseur de volume à 16px) :
l'échelle principale, posée pour des cases de 64px, les écraserait. Le
rapport `mini-lg` / `mini` (1,5×) reprend celui de `lg` / `md` en réel — le
défi reste plus lourd que la case, à toute échelle.

Un élément inerte (verrouillé, désactivé) n'a **pas d'ombre du tout**. À plat.

Les quatre paliers principaux, plus le palier mini, vivent comme custom
properties `--shadow-hard-*` dans `src/theme/tokens.css` — générées depuis
`SHADOWS_HARD` (`src/theme/tokens.ts`), au même titre que les couleurs.

## Shapes

`border-radius: 0` partout. Voir Overview : ce n'est pas une contrainte à
contourner.

Le relief se fait donc entièrement au filet, et le filet a quatre niveaux qui
forment un langage. Chacun vit comme custom property `--rule-*` dans
`src/theme/tokens.css` (générée depuis `RULES`, `src/theme/tokens.ts`) : un
raccourci `border` complet (épaisseur, style, couleur), posé tel quel
(`border: var(--rule-standard)`) au lieu d'être retapé littéralement à chaque
usage :

- **`--rule-heavy` (`2px solid ink`)** — structurant. La bordure d'une modale,
  le filet qui sépare l'en-tête de la carte du reste. Rare.
- **`--rule-standard` (`1.5px solid ink`)** — le filet standard. Tout ce qui
  est actionnable et tout ce qui est un conteneur autonome (bouton, registre,
  case jouable).
- **`--rule-hairline` (`1px solid line`)** — subordonné. Sépare deux éléments
  à l'intérieur d'un même conteneur (lignes du registre, filet sous un
  en-tête).
- **`--rule-dashed` (`1.5px dashed map-rule`)** — inerte. Le pointillé est le
  signal universel de « visible mais pas encore atteignable » : mode
  verrouillé, niveau pas encore ouvert. Un pointillé n'est jamais cliquable.

## Marque

Le jeu se nomme **une fois, en tête de la carte, et nulle part ailleurs**. Le
portage Rune a retiré l'écran d'accueil : la carte est devenue le premier
écran, elle hérite donc du rôle — sans elle, le nom n'apparaîtrait plus nulle
part une fois en jeu (le header Rune ne le porte pas). La partie, elle, ne
porte toujours pas le nom : le joueur qui y est sait où il est, et une marque
redite est du chrome qui n'informe plus.

La marque est une **manchette de page courante**, pas une page de titre : le
nom en typo `title` (serif 30px 700), suivi d'une accroche d'une ligne qui dit
ce que le jeu est — un joueur Rune arrive sur la carte sans autre contexte —,
le tout fer à gauche au retrait `--edge` (`src/render/map.ts`, buildMasthead).
Sans filet propre : le jalon de la première section découpe déjà la page juste
dessous.

Le point final est vermillon et reprend l'idiome de « Gagné. » — le vermillon
y signe au lieu de récompenser, seule entorse tolérée à la règle « vermillon =
mérité », et elle tient parce que la marque n'est pas une information de jeu.

Le token `brand` (72px fluide) était celui de l'ancien accueil, composé comme
une page de titre ; il n'a plus de consommateur et reste réservé — la
manchette ne le consomme pas, elle consomme `title`.

## Components

### Boutons

La hiérarchie est portée par le remplissage, pas par la taille.

- **`button-primary`** — vermillon plein, 62px de haut, serif large. Un seul par
  écran, et uniquement pour l'action que le joueur veut faire (« Niveau
  suivant »).
- **`button-ghost`** — transparent, cerclé et lettré de vermillon. La nouveauté
  qu'on vient d'ouvrir (le défi), qui doit se distinguer sans voler la vedette au
  bouton primaire.
- **`button-action`** — surface carte, filet encre, mono. L'action standard :
  retour à la carte, onglet de mode. Au survol comme à l'état sélectionné, il
  **s'inverse** (fond encre, texte papier) — c'est l'idiome d'interaction de
  l'application.
- **`button-icon`** — une icône, rien autour : ni fond, ni filet. Pour les
  commandes que leur dessin dit mieux qu'un mot : le retour à la carte et la
  règle du jeu dans le header, le « tout voir » du zoom. Le rang se lit au
  repos, à l'encre plutôt qu'au cadre : la flèche du retour est pleine, le « i »
  de la règle est estompé (action rare, qu'on lit une fois). Sous le pointeur —
  survol à la souris, appui au doigt — toutes virent au **vermillon** : une
  icône nue n'a que sa couleur pour dire qu'elle répond, elles doivent donc la
  dire pareil. L'encre reste réservée à l'état (le « i », panneau ouvert).

### Panneaux

`panel` est un composant partagé (voile plein écran + surface — classes
`.panel-*`, `src/render/panel.css`). En desktop il s'ancre en popover sous son
déclencheur ; en mobile il devient une feuille en bas d'écran ; le lobby en
consomme la tête sur sa carte centrée.

**Voile : deux densités, en tokens** (`--veil-light`, `--veil-dense`,
`src/theme/tokens.ts`) — de l'encre diluée, jamais du noir pur. Léger (18 %)
sous un popover ancré : la page reste lisible derrière. Dense (45 %) sous une
surface bloquante : feuille mobile, lobby de vote. Pas de troisième densité.

**Tête de surface : deux registres, selon ce que la surface est.**

- **Écran de consultation** (se lit : aide, crédits) — titre serif `title`,
  filet standard dessous, croix **encre** : elle est la seule sortie, elle a
  rang d'action.
- **Panneau, feuille, carte** (s'actionne ou informe en passant : menu,
  panneaux de la carte, lobby) — titre **mono capitale `muted`** : le titre
  nomme, il ne commande jamais ; l'encre est réservée au contenu. Croix
  **estompée** au repos : fermer n'est pas l'action du panneau, juste sa
  sortie.

Quand le corps d'un panneau parle la même voix mono capitale que sa tête (le
menu : une liste de commandes), un **filet standard sous la tête** marque la
frontière étiquette/commandes — celle que le contraste serif/mono fait tout
seul dans les panneaux qui expliquent.

**Échap ferme toute surface à croix** — menu, panneaux de la carte, écrans de
consultation. Le lobby n'a ni croix ni Échap : la proposition vient de la
room, elle ne se congédie pas localement.

### Cases

`grid-cell` (Pixi) et `map-cell` (DOM) partagent la même sémantique de couleur :
repos en `card`, engagé en `ink`, acquis en `vermilion`. C'est la seule
correspondance qui traverse la frontière canvas/DOM, et elle doit tenir.

## Do's and Don'ts

**À faire**

- Réserver le vermillon à la récompense — mot trouvé, étoile, victoire.
- Choisir la famille typographique par la fonction : ça se lit → serif ; ça se
  compte ou ça se commande → mono.
- Dire l'état par le filet : plein = actif, pointillé = inerte, absent = neutre.
- Répercuter tout changement de couleur dans `style.css` **et**
  `src/game/config.ts`.
- Poser les nouveaux composants sur l'échelle `spacing`.
- Poser un filet, une ombre dure ou un voile avec `var(--rule-*)` /
  `var(--shadow-hard-*)` / `var(--veil-*)` (§ Elevation & Depth, § Shapes,
  § Components → Panneaux), jamais en littéral retapé.
- Diluer l'encre ou le papier avec `color-mix(in srgb, var(--ink|paper) X%,
  transparent)`, jamais en `rgba()` littéral — le même principe qu'une couleur
  pleine : une seule source, écrite une fois.
- Utiliser `ghost-strong` (pas `ghost`) pour du texte inerte lu sur `paper`/`card`.

**À ne pas faire**

- Arrondir un angle. Jamais, sauf pastille de notification ou avatar joueur
  (§ Colors, dérogation « encres d'autres mains »).
- Introduire une seconde couleur d'accent. Si un élément a besoin d'attirer
  l'œil, il doit d'abord justifier qu'il l'a mérité.
- Mélanger ombre floue et ombre dure sur un même élément, ou donner une ombre à
  un élément inerte.
- Normaliser les espacements existants vers une grille de 4 ou 8px : ils sont
  optiques.
- Remplacer l'enfoncement (translation sur l'ombre) par une baisse d'opacité.
- Faire porter une information au chrome quand la grille peut la porter : le
  canvas est le sujet, le reste est en marge.
- Ignorer `prefers-reduced-motion` sur une animation en boucle infinie
  (confettis, secousses) : figer l'élément à un état statique présentable.
