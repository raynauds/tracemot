---
version: alpha
name: Tracemot
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
  ghost: "#b9af9c" # texte inerte : verrouillé, désactivé
  # Accent (unique)
  vermilion: "#b3402a" # l'accent, et lui seul : victoire, étoile, compteur
  # Filets
  line: "#d8cfbc" # séparation interne, filet subordonné
  # Carte de progression
  map-validated: "#efe9da" # case résolue
  map-rule: "#c6bca6" # filet de la carte
  map-dash: "#c1b7a2" # pointillé du verrouillé
  map-count: "#8a806c" # chiffre secondaire
  map-hint: "#4a4438" # accroche
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
  brand:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: 700
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
  meta:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 400
    letterSpacing: 1.5px
rounded:
  none: 0px # tout, sans exception discutable
  full: 9999px # la seule pastille ronde de l'interface (signal « nouveau »)
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
  button-quiet: # « ? » de la règle — filet clair, action rare
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
    typography: "{typography.action}"
    size: 34px
    rounded: "{rounded.none}"
  button-quiet-hover:
    backgroundColor: "{colors.card-hover}"
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

Tracemot se lit comme une page imprimée, pas comme une application. Le papier
crème, l'encre presque noire et le filet net sont le vocabulaire complet ; le
vermillon est la seule couleur, et il ne sert qu'à une chose : dire qu'un mot a
été trouvé. Une interface qui ne récompense rien reste en noir et blanc.

Le principe qui gouverne tout le reste : **rien n'est arrondi**. Pas un bouton,
pas un panneau, pas une case. La seule exception de l'application est une
pastille de 6px qui signale un mode nouvellement débloqué — elle est ronde
précisément parce qu'aucune autre ne l'est.

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

Un quatrième groupe, `map-*`, existe pour la carte de progression seule. Son
papier est délibérément plus sourd que celui du jeu : l'accueil et la partie ne
doivent jamais se confondre à l'œil.

**Une seule source.** La palette est écrite dans `src/theme/tokens.ts`, et elle
seule. Le DOM et PixiJS — qui ne lit pas les variables CSS — en sont deux
consommateurs, dans leurs formats respectifs :

- `src/theme/tokens.css`, custom properties (`--paper`, `--ink`…) pour le DOM :
  **fichier généré**, jamais édité à la main (`npm run generate:tokens`, contrôlé
  par `npm run check:tokens`).
- `src/game/config.ts`, hexadécimal numérique (`PAPER = hex("paper")`) pour Pixi.

Changer une couleur = la changer dans `tokens.ts` et régénérer. Une seule couleur
échappe aux tokens : le vert `#2e7d32` du panneau de debug — c'est volontaire, le
debug n'est pas de l'interface produit.

## Typography

Deux familles, et une règle de répartition stricte.

**Source Serif 4** porte tout ce qui se lit : titres, lettres de la grille, mots
du registre, phrases explicatives. Poids 400 pour le corps, 700 pour ce qui
titre.

**IBM Plex Mono** porte tout ce qui se compte ou se commande : chronomètre,
compteurs, libellés capitalés, boutons. Poids 600, avec un interlettrage large
(1 à 3px) qui augmente à mesure que le texte rapetisse — c'est ce qui rend un
libellé de 11px encore lisible et le distingue d'un titre.

Corollaire : **un chiffre n'est jamais en serif, un mot n'est jamais en mono.**
Si vous hésitez sur la famille, demandez-vous si l'élément se lit ou se compte.

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
englobe ses modales), victoire 30, carte 40 (c'est un écran, pas un panneau),
chargement au-dessus de tout.

## Elevation & Depth

Deux familles d'ombre, qui ne veulent pas dire la même chose. Ne les mélangez
jamais sur un même élément.

**L'ombre floue** (encre à 20-35 %, décalage vertical, flou large) dit
« ce panneau flotte au-dessus de la page » : le registre (`0 14px 34px`), les
modales (`0 20px 44px`). Elle est réservée aux surfaces qui recouvrent
temporairement l'interface.

**L'ombre dure** (encre pleine, décalage diagonal, flou nul) dit « ce papier est
découpé et posé » : les cases de la carte (`2.5px 2.5px 0`), le défi qui clôt une
ligne (`4px 4px 0`, plus haut parce qu'il compte plus), les petits éléments
(`1.5px 1.5px 0`, `1px` en mobile). Elle est réservée aux éléments cliquables de
la carte, et elle **s'anime** : à l'appui, l'élément se translate exactement de
la valeur de son ombre et l'ombre disparaît. La case rejoint physiquement son
relief. C'est le seul retour tactile de l'interface — ne le remplacez pas par une
opacité.

Un élément inerte (verrouillé, désactivé) n'a **pas d'ombre du tout**. À plat.

## Shapes

`border-radius: 0` partout. Voir Overview : ce n'est pas une contrainte à
contourner.

Le relief se fait donc entièrement au filet, et le filet a quatre niveaux qui
forment un langage :

- **`2px solid ink`** — structurant. La bordure d'une modale, le filet qui sépare
  l'en-tête de la carte du reste. Rare.
- **`1.5px solid ink`** — le filet standard. Tout ce qui est actionnable et tout
  ce qui est un conteneur autonome (bouton, registre, case jouable).
- **`1px solid line`** — subordonné. Sépare deux éléments à l'intérieur d'un même
  conteneur (lignes du registre, filet sous un en-tête).
- **`1.5px dashed map-rule`** — inerte. Le pointillé est le signal universel de
  « visible mais pas encore atteignable » : mode verrouillé, niveau pas encore
  ouvert. Un pointillé n'est jamais cliquable.

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
- **`button-quiet`** — filet clair au lieu du filet encre, texte estompé. Pour
  l'action rare et subordonnée (le « ? » de la règle, qu'on lit une fois). Au
  survol, il gagne le filet encre : il monte d'un cran plutôt que de s'inverser.

### Panneaux

`panel` est un composant partagé (voile plein écran + surface ancrée). En
desktop il s'ancre en popover sous son déclencheur ; en mobile il devient une
feuille en bas d'écran. Le voile est `rgba(38, 34, 28, 0.18)` — de l'encre
diluée, jamais du noir pur.

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

**À ne pas faire**

- Arrondir un angle. Jamais, sauf pastille de notification.
- Introduire une seconde couleur d'accent. Si un élément a besoin d'attirer
  l'œil, il doit d'abord justifier qu'il l'a mérité.
- Mélanger ombre floue et ombre dure sur un même élément, ou donner une ombre à
  un élément inerte.
- Normaliser les espacements existants vers une grille de 4 ou 8px : ils sont
  optiques.
- Remplacer l'enfoncement (translation sur l'ombre) par une baisse d'opacité.
- Faire porter une information au chrome quand la grille peut la porter : le
  canvas est le sujet, le reste est en marge.
