---
name: Tracemot
description: Jeu de lettres au navigateur, composé comme une page imprimée — encre, papier, vermillon.
colors:
  ink: "#26221c"
  vermilion: "#b3402a"
  paper: "#f6f1e7"
  card: "#fdfbf5"
  card-hover: "#f3ecdc"
  line: "#d8cfbc"
  ghost: "#b9af9c"
  muted: "#6e6656"
  foot: "#a99f8a"
  star-off: "#cfc6b2"
  level-selected: "#efe7d6"
  level-pressed: "#e7dcc3"
typography:
  display:
    fontFamily: "Source Serif 4, serif"
    fontSize: "76px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "1px"
  headline:
    fontFamily: "Source Serif 4, serif"
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "3px"
  title:
    fontFamily: "Source Serif 4, serif"
    fontSize: "30px"
    fontWeight: 700
    letterSpacing: "0.5px"
  body:
    fontFamily: "Source Serif 4, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "2.5px"
rounded:
  none: "0"
spacing:
  xs: "8px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "24px"
  section: "72px"
  columns: "88px"
components:
  cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "100%"
  cell-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  cell-head:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper}"
  cell-disabled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ghost}"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 13px"
  chip-open:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-replay:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "62px"
---

# Design System: Tracemot

## 1. Overview

**Creative North Star: "L'Imprimerie"**

Tracemot se compose comme un objet imprimé, pas comme un écran d'application.
La grille est une forme typographique : des lettres encrées, posées sur un
papier crème, cernées de traits d'encre francs. Chaque interaction emprunte au
geste de l'atelier — le mot trouvé s'abat comme un tampon, les lettres d'une
nouvelle grille tombent en cascade d'impression, le tracé courant est une barre
d'encre tirée à la règle. Le sérif de presse (Source Serif 4) porte le contenu ;
le mono technique (IBM Plex Mono) porte les données et les étiquettes, comme les
repères d'une planche d'imprimeur.

Le système est dense mais calme : deux colonnes sur desktop (grille + registre),
une pile verrouillée à la hauteur du viewport sur mobile. La couleur est rare —
tout est encre et papier, et le vermillon ne parle que pour marquer l'événement
(le mot en cours de validation, la victoire, le filet du niveau sélectionné). La
personnalité tient dans la retenue : c'est un jeu qui respire la qualité d'une
page composée, jamais l'excitation d'une app de rétention.

Ce système rejette explicitement trois choses : **l'app gamifiée criarde**
(dégradés saturés, badges, pop-ups d'engagement, confettis permanents), le
**SaaS générique** (cartes identiques, bleu corporate, esthétique template), et
le **néon / dark tech gaming**. Tracemot n'a ni coin arrondi, ni ombre
décorative, ni couleur de marque autre que son encre et son unique vermillon.

**Key Characteristics :**
- Palette papier / encre / vermillon ; le vermillon ne sert qu'à l'événement.
- Coins nets partout — zéro `border-radius`.
- À-plat par défaut ; l'ombre n'existe qu'en réponse à un état ou pour une
  surface flottante.
- Sérif de presse pour le contenu, mono technique pour les données et labels.
- Motion « atelier » : tampon, cascade d'impression, pop, flash — jamais de
  rebond élastique.

## 2. Colors

Une bichromie encre-sur-papier réchauffée d'un seul vermillon d'événement ; tous
les neutres partagent la même famille chaude sableuse.

### Primary
- **Encre** (`#26221c`) : la couleur structurante. Texte principal, bordures des
  cases (1.5px), case sélectionnée pleine, fond du panneau de difficulté ouvert,
  fond du toast et du bloc victoire. C'est le noir chaud de l'imprimé, jamais un
  gris.

### Secondary
- **Vermillon** (`#b3402a`) : la seule couleur d'accent. Réservée à l'événement —
  étoile du niveau, case de tête du tracé, mot en cours validé, filet du niveau
  sélectionné, compteur atteint, bouton Rejouer, point final de « Gagné. »,
  confettis. Sa rareté est le message.

### Neutral
- **Papier** (`#f6f1e7`) : fond de page ; aussi le fond des cases consommées
  (sorties du jeu) et le texte sur fond encre.
- **Carte** (`#fdfbf5`) : surface des cases actives et de la chip au repos — un
  papier plus clair que le fond, à peine surélevé optiquement.
- **Carte survol** (`#f3ecdc`) : fond de case au survol souris.
- **Filet** (`#d8cfbc`) : traits de séparation fins (1px) — lignes du registre,
  bordures des cases neutralisées, filet des lignes de niveau.
- **Fantôme** (`#b9af9c`) : lettres des cases consommées, points « · · · · · »
  d'un mot non trouvé, tracé fantôme d'un mot déjà validé, sous-titres discrets.
- **Muted** (`#6e6656`) : texte secondaire italique (consigne, descriptions de
  niveau, statut de chargement).
- **Pied** (`#a99f8a`) : la note la plus basse en hiérarchie (mention sous le
  panneau).
- **Étoile éteinte** (`#cfc6b2`), **Niveau sélectionné** (`#efe7d6`), **Niveau
  pressé** (`#e7dcc3`) : nuances de sélection du sélecteur de difficulté.

### Named Rules
**La Règle de l'Encre Unique.** Le vermillon ne décrit jamais une surface au
repos ni une décoration. Il ne s'allume que pour signaler un événement de jeu.
Si un élément vermillon n'est pas un événement (tracé actif, victoire, refus,
sélection), il est mal placé.

**La Règle du Neutre Chaud.** Tous les neutres vivent dans la même famille
sableuse (teinte chaude, faible chroma). Aucun gris froid, aucun neutre pur.
L'écart entre `paper` et `card` est volontairement minuscule — c'est une
surélévation optique, pas un contraste.

## 3. Typography

**Display / Body Font :** Source Serif 4 (fallback `serif`)
**Label / Data Font :** IBM Plex Mono (fallback `monospace`)

**Character :** Un sérif de presse contemporain, à contraste franc, doublé d'un
mono technique. Le sérif porte tout ce qui se lit (titre, mots, consigne) ; le
mono porte tout ce qui se compte ou s'étiquette (chrono, compteur, labels en
capitales espacées). L'appariement joue sur l'axe sérif ↔ mono, jamais deux sans
serif voisins.

### Hierarchy
- **Display** (Source Serif 4, 700, italique, 76px, line-height 1) : le « Gagné. »
  du bloc victoire, unique par partie. Réduit à 52px sur mobile.
- **Title** (Source Serif 4, 700, 30px, letter-spacing 0.5px) : le titre
  « Tracemot » du header. 19px sur mobile.
- **Headline** (Source Serif 4, 600, 26px, letter-spacing 3px) : les mots
  trouvés dans le registre, en capitales espacées. 19px sur mobile.
- **Body** (Source Serif 4, 400, 16px, line-height 1.6, italique) : la consigne
  de jeu et les descriptions de niveau. Largeur de ligne plafonnée à ~420px.
- **Label** (IBM Plex Mono, 500–600, 12–13px, letter-spacing 2–3px, CAPITALES) :
  les étiquettes techniques — CHRONO, MOTS TROUVÉS, DIFFICULTÉ, numéros de ligne,
  points de mots manquants. Le chrono et le compteur montent à 18–26px mono 600.

### Named Rules
**La Règle du Mono-Donnée.** Tout ce qui est chiffre, compteur, minuterie ou
étiquette système est en IBM Plex Mono, en capitales, avec un letter-spacing
d'au moins 2px. Le sérif ne compte pas ; il lit.

**La Règle des Capitales Espacées.** Les mots trouvés et les labels s'écrivent en
capitales avec un letter-spacing marqué (3–4px). C'est la signature imprimée du
registre — jamais de casse mixte pour ces éléments.

## 4. Elevation

À-plat par défaut. Les surfaces au repos n'ont aucune ombre : elles se
distinguent par la couleur (encre vs papier vs carte) et par des bordures d'encre
franches, pas par la profondeur. L'ombre n'apparaît qu'en réponse à un état
(survol d'une case) ou pour détacher une surface réellement flottante (popover de
difficulté, feuille mobile, toast). La profondeur est donc un signal, jamais une
texture.

### Shadow Vocabulary
- **Survol de case** (`box-shadow: inset 0 0 0 1px var(--ink), 0 3px 0 rgba(38,34,28,0.14)`
  + `translateY(-2px)`) : ombre dure et courte façon touche imprimée qui se
  soulève. Pas de flou diffus.
- **Popover / feuille** (`box-shadow: 0 20px 44px rgba(38,34,28,0.35)`) : détache
  le sélecteur de difficulté au-dessus du plateau (desktop).
- **Toast** (`box-shadow: 0 12px 30px rgba(38,34,28,0.35)`) : confirme un
  changement de niveau par-dessus la grille.

### Named Rules
**La Règle du Plat-au-Repos.** Une surface au repos est plate. Toute ombre doit
répondre à un état (survol, flottaison) et disparaître au retour au repos. Une
ombre décorative permanente est interdite.

**La Règle de l'Ombre Dure.** Les ombres de survol sont franches et courtes
(offset faible, flou nul ou minime), comme une plaque qui se soulève de la page.
Le flou doux diffus est réservé aux surfaces flottantes, pas aux éléments de jeu.

## 5. Components

### Buttons
- **Shape :** angles vifs, aucun arrondi (`border-radius: 0`).
- **Rejouer (primaire) :** pleine largeur, fond vermillon, texte papier, sérif
  700, capitales, letter-spacing 4px, hauteur 62px. Le seul bouton plein de
  couleur du jeu.
- **Hover / Active :** `filter: brightness(1.08)` au survol, `brightness(0.94)` à
  l'appui — pas de changement de teinte, juste l'encre qui s'avive.
- **Fermer (icône) :** carré 28px, bord encre 1.5px, fond transparent, fond
  `card-hover` au survol.

### Chips
- **Style :** la chip de difficulté au repos est en fond carte, bord encre
  1.5px, étoile vermillon + label mono ; angles vifs.
- **State :** ouverte, elle s'inverse (fond encre, texte papier) et le caret
  bascule `▾` → `▴`. C'est le seul état « pressé » persistant de l'interface.

### Grid Cells (composant signature)
- **Repos :** carré, fond carte, bord encre 1.5px, lettre sérif 700 dimensionnée
  en `cqw` (34px pour une emprise de 500px) — la lettre suit la taille du
  plateau.
- **Survol (souris) :** se soulève de 2px avec l'ombre dure ; désactivé pendant
  un tracé (`.grid.tracing`) pour ne pas parasiter le geste.
- **Sélectionnée (`.sel`) :** fond encre, texte papier — la case entre dans le
  tracé courant.
- **Tête (`.head`) :** fond vermillon, texte papier, `pop` de 0.16s — la dernière
  case ajoutée au tracé.
- **Consommée (`.disabled`) :** fond papier, bord filet, lettre fantôme — sortie
  du jeu, plus survolable.
- **Motion :** `deal` (cascade d'impression à l'arrivée, délai `var(--i)*18ms`),
  `flash` (rouge bref sur un tracé refusé), `shake` de la grille au refus.

### Difficulty Panel / Sheet
- **Desktop :** popover ancré sous la chip, 440px, fond papier, bord encre 2px,
  ombre flottante. **Mobile :** feuille ancrée en bas, bord-haut encre 2px,
  animation `sheet-up`, voile plus dense.
- **Lignes de niveau :** hauteur 56px, filet bas 1px, étoiles (on = vermillon,
  off = star-off), nom sérif 600 + description italique muted ; la ligne
  sélectionnée porte un filet vermillon à gauche (4px, barre interne — pas une
  bordure de carte) et une coche vermillon.

### Word Ledger (composant signature)
- **Style :** liste numérotée mono, lignes séparées par un filet 1px, mot en
  headline capitales espacées.
- **États :** `pending` (lettres fantôme pendant le tracé) → `pending.valid`
  (l'encre se densifie quand le tracé forme un mot) → `stamp` (le mot validé
  s'abat, écrasement puis pose, sans rebond) ou `rejected` (lettres vermillon +
  motif du refus poussé à droite, 2s).

### Status / Loading
- **Style :** cadre en tirets `line`, texte mono espacé muted ; l'erreur passe en
  vermillon avec un interligne aéré.

## 6. Do's and Don'ts

### Do:
- **Do** garder le vermillon pour l'événement uniquement (tracé actif, tête,
  victoire, refus, sélection, compteur atteint). Sa rareté est le message.
- **Do** garder tous les angles vifs (`border-radius: 0`) — cases, chip, boutons,
  panneaux, toast.
- **Do** rester à-plat au repos ; réserver l'ombre aux survols et aux surfaces
  flottantes, avec une ombre dure et courte pour les éléments de jeu.
- **Do** utiliser IBM Plex Mono en capitales espacées pour tout ce qui est
  donnée, compteur ou étiquette ; Source Serif 4 pour tout ce qui se lit.
- **Do** maintenir le contraste AA — surveiller `muted` (#6e6656) et `foot`
  (#a99f8a) sur `paper`, ne pas descendre le texte courant vers `ghost`.
- **Do** doubler toute information de couleur d'un signal de forme ou de texte
  (le mot refusé garde son motif écrit, pas seulement le rouge).
- **Do** garder les cibles tactiles ≥ 44px sur les cases et les contrôles.

### Don't:
- **Don't** virer vers l'**app gamifiée criarde** : pas de dégradés saturés, pas
  de badges, pas de pop-ups d'engagement, pas de confettis permanents. Les
  confettis existants sont brefs et bichromes (vermillon + papier).
- **Don't** tomber dans le **SaaS générique** : pas de cartes identiques
  répétées, pas de bleu corporate, pas d'esthétique template.
- **Don't** introduire de **néon / dark tech gaming** : pas de fond sombre
  décoratif (le seul fond encre est le bloc victoire et le toast), pas d'accent
  néon, pas de RGB.
- **Don't** utiliser de `border-left` / `border-right` coloré > 1px comme
  liseré de carte. Le filet vermillon du niveau sélectionné est une barre
  interne dédiée, pas une bordure d'accent — ne pas généraliser le motif.
- **Don't** poser de gris froid ou de neutre pur ; tout neutre reste dans la
  famille sableuse chaude.
- **Don't** animer avec du rebond élastique ou du bounce. La motion imite
  l'atelier : tampon, cascade, pop, flash — courbes qui accélèrent vers l'impact
  puis se posent.
- **Don't** oublier l'alternative `prefers-reduced-motion` (tampon, cascade,
  victoire, confettis) : crossfade ou transition instantanée.
