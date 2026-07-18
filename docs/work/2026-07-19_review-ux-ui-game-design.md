# Review UX/UI/game design — 2026-07-19

Review multi-agents de tout le jeu : 7 reviewers (parcours UX, UI visuel, game design,
accessibilité, wording, feedback/motion, mobile/responsive), puis contre-expertise
adversariale de chaque constat haute/moyenne par un agent sceptique chargé de le réfuter.
Review statique du code uniquement. Bilan : **30 constats confirmés, 1 réfuté**.

Les sévérités ci-dessous sont celles **après contre-expertise** (beaucoup de « haute »
annoncées ont été rétrogradées : comportement réel mais impact borné, ou choix documenté
dans DESIGN.md).

---

## 🟠 Moyenne

### Feedback & game feel

**La victoire écrase la validation du dernier mot** — `main.ts:190-197`, `scene.ts:370-389`,
`win.css`. `stampWord` (220 ms) + fondu fantôme (300 ms) sont recouverts dans la même passe
synchrone par l'overlay `.win` (opaque, ~70 % d'opacité dès ~110 ms via win-pop). La 5e
validation — celle qui compte le plus — est la moins visible.
→ Retarder `renderWin()` de ~300-350 ms après le dernier commit.

**Aucun son propre à la victoire** — `renderWin()` ne joue rien ; le seul son est le
`word-stamp` identique aux mots intermédiaires. Le catalogue (`audio/catalog.ts`) n'a
que 5 sons, aucun de victoire.
→ Ajouter un son dédié (ex. `level-win`), a fortiori quand une étoile est gagnée.
[NOTE: UTILISE LE MÊME PATH QUE word-stam, J'AJOUTERAI LE BON FICHIER PLUS TARD]

### Mobile

**Zone morte aux coins de chaque case** — `scene.ts:428-438`. Hit-test circulaire
(rayon cell/2) dans une case carrée : ~21,5 % de surface morte concentrée aux 4 coins
(+ le gap inter-cases). En glissé continu, l'interpolation de `extendTraceTo` neutralise
largement ; le résidu réel est le **tap de départ** dans un coin, qui bascule en pan sans
feedback.
→ Test carré basé sur `metrics.pitch/2` (couvre les coins ET le gap).

**Un doigt parasite casse le tracé pour lancer un pinch** — `input.ts:236-249`.
`pointers.size === 2` déclenche `beginPinch()` sans condition et fait `clearPath()`.
Une paume ou le doigt qui tient le téléphone annule le tracé en cours.
→ N'escalader en pinch qu'après un mouvement minimal des deux doigts, ou ignorer les
pointeurs près du bord pendant un tracé actif.

**Aucune intégration avec l'historique du navigateur** — aucun pushState/popstate dans
src/. Le geste retour mobile quitte l'application au lieu de refermer l'overlay ouvert
(aide, crédits, carte, victoire).
→ Une entrée d'historique par overlay + interception de popstate.

### Visuel & accessibilité

**Contraste `--ghost` (#b9af9c) sur fond clair ≈ 1,9:1** — sous les 4.5:1 AA, et même
sous 3:1. Acceptable pour les états désactivés (exemption WCAG), mais en échec réel sur
le bouton CRÉDITS (`home.css:208`) et le texte du mot en cours de tracé
(`ledger.css:179/189`). Le même token fait ~7,4:1 sur fond `--ink`.
→ Réserver `--ghost` aux fonds sombres ; second token plus foncé pour paper/card.

**`prefers-reduced-motion` ignoré partout sauf le titre d'accueil** — unique occurrence :
`home.css:227`. La secousse d'écran au refus (`shakeGrid`, offset répété — déclencheur
vestibulaire), le flash, la distribution en cascade et le tampon ne lisent jamais la
préférence ; les 6 confettis de victoire tournent en boucle infinie (`win.css:170-187`).
→ Lire matchMedia à l'init de scène (SHAKE_AMP=0, teinte instantanée, deal sans vague)

- un bloc `@media` qui fige `.confetti`.

**Filets et ombres non tokenisés** — `tokens.css` ne génère que couleurs + polices.
Les 4 niveaux de filet et les ombres dures de DESIGN.md sont des littéraux retapés dans
~10 fichiers (`1.5px solid var(--ink)`, `2.5px 2.5px 0 var(--ink)`…). C'est ce qui a déjà
laissé help.css (2px/3px) et sound.css (2px) dériver de l'échelle documentée
(2.5/4/1.5/1px).
→ Custom properties `--rule-*` et `--shadow-hard-*` au niveau de tokens.css.

---

## 🟡 Basse (vrac utile, corrections rapides)

- **Échap absent sur l'écran de victoire** — seul overlay sans handler clavier
  (aide, crédits, carte, panneau règle en ont tous un). Équivalent « retour à la carte ».
- **« Débloque : X » peu naturel** — `render.ts:372` → « Accès à : X ».
- **Aucun signal de progression sur les 15 victoires normales par section** — l'étoile
  n'apparaît que sur défi. Un « 3/5 avant le défi ★ » est dérivable de `sectionStats`.
- **Libellés capitales mono inconsistants en graisse** — `.ledger-label` /
  `.diff-panel-title` héritent 400, `.credits-role` / `.sound-label` déclarent 600.
  → utilitaire « label-caps » partagé.
- **Pas de `buzz()` haptique au commit** — chaque case ajoutée vibre, mais ni le refus
  (déjà flash + secousse + son) ni la validation n'ont de répondant haptique.
- **Feedback asymétrique sur segment multi-cases** — avancée : N ticks + N buzz mais une
  seule case animée ; backtrack : 1 tick, 0 buzz, 0 anim. Le commentaire « miroir exact »
  n'est vrai que case par case.
- **Pas d'état hover souris avant le tracé** — `cellState` ne connaît que
  disabled/head/sel/normal. Raffinement desktop mineur.
- **`overscroll-behavior: contain` manquant sur `.word-list`** — posé sur `.map` et
  `.screen`, oublié sur le registre (tiroir mobile en défi).
- **Double-tap zoom natif possible sur les boutons DOM** — `touch-action: none` seulement
  sur le canvas ; risque limité à iOS Safari. → `touch-action: manipulation` sur le chrome.
- **Relayout complet à chaque resize** — pas de debounce ; impact réel faible (baseScale
  insensible au repli de barre d'adresse en portrait, 25 Text).
- **Message d'échec de chargement générique et orienté dev** — même texte « npm run dev /
  file:// » quelle que soit la cause, pas de bouton « réessayer » ; le seul recours
  reproduit l'échec.
- **Tutoriel complet injoignable en partie** — le panneau « i » ne montre qu'un résumé ;
  revoir « Comment jouer » exige deux sorties d'écran. → lien vers `showHelp()` depuis le
  panneau règle.
- **Casse incohérente** — messages d'erreur en MAJUSCULES vs descriptions en casse
  normale ; « DÉFI » vs « défi ». → majuscules réservées aux labels/boutons/états.
- Supprimer "TERMINEZ LA LIGNE" de la case défi en teaser
- **Grands titres accueil/victoire sans échelle commune** — 72px droit vs 76px italique,
  aucun ne correspond au token display (52px). Documenter ou aligner.
- **5 tailles de légende mono entre 9 et 11px** pour un seul token « meta » documenté.
- **Teintes ink/paper redupliquées en rgba() littéral** dans 6 endroits alors que win.css
  utilise déjà `color-mix` pour le même besoin — DESIGN.md les documente comme spec, mais
  `check:tokens` ne les verrait pas dériver. → unifier sur `color-mix`.
- **help.css/sound.css hors échelle d'ombres** — miniatures en 2px/3px, pouce en 2px ;
  cohérent avec le principe « l'ombre flexe avec la taille » mais valeurs non documentées.

---

## ✅ Points forts confirmés

- Jeton anti-course `selection` dans `startLevel` : aucune sélection périmée ne peut
  écraser l'état.
- localStorage entièrement défensif (try/catch systématique, migration de schéma).
- Couleurs 100 % tokenisées (aucun hex en dur dans render/), générateur + check dédiés.
- Empilement z-index documenté dans DESIGN.md et respecté à la lettre dans les 13 CSS.
- `border-radius: 0` respecté partout, unique exception documentée (`.map-tab-dot`).
- Ordre des `@import` pensé pour la cascade, aucun conflit de spécificité constaté.
- Wording des difficultés conforme à la règle projet : les niveaux décrivent la grille
  (Doux/Équilibré/Relevé/Corsé), jamais le joueur.
- Enchaînement de victoire (SUIVANT/DÉFI/CONTINUER) qui évite l'aller-retour carte.
- Un seul geste retour, cohérent sur tous les écrans.

---

## ❌ Réfuté par la contre-expertise

- « L'écran Comment jouer n'exclut pas les diagonales » — faux : « sur une même ligne ou
  une même colonne » les exclut déjà, un SVG illustre le tracé, et la reformulation
  proposée (« en ligne droite ») aurait introduit une erreur puisque les mots serpentent
  en L.

---

## Priorisation suggérée

1. Délai ~300 ms avant l'écran de victoire + son de victoire dédié (game feel, effort faible).
2. Hit-test carré (`pitch/2`) + garde-fou pinch (confort mobile, cœur du jeu).
3. `aria-live` registre + `role="alert"` sur `#win` et `#status` (une ligne chacun).
4. Décision produit sur Corsé (coût 4★ vs déblocage à 3★) : corriger ou étiqueter « bonus ».
5. `prefers-reduced-motion` sur secousse + confettis.
6. Chantier de fond : accessibilité clavier/lecteur d'écran de la grille Pixi.
