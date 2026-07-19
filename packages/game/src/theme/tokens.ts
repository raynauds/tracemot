// Palette : source de vérité UNIQUE. Toute couleur du jeu naît ici.
//
// Deux consommateurs, deux formats, un seul original :
//   - le DOM lit les variables CSS de theme/tokens.css — fichier GÉNÉRÉ
//     depuis ce module (`npm run generate:tokens`), jamais édité à la main ;
//   - Pixi attend des nombres (0xRRGGBB) : game/config.ts les dérive via
//     hex(), il n'y a donc rien à recopier.
//
// Ajouter une couleur : l'écrire ici, relancer le générateur, l'utiliser.
// Le nom de la clé donne le nom de la variable CSS (`paper` → `--paper`).

export const COLORS = {
  // Surfaces
  paper: "#f6f1e7", // fond général, et couleur du texte posé sur l'encre
  card: "#fdfbf5", // surface surélevée : case, panneau, bouton au repos
  "card-hover": "#f3ecdc", // même surface, survolée

  // Encre
  ink: "#26221c", // texte, filets, ombres portées
  muted: "#6e6656", // texte secondaire, libellés
  ghost: "#b9af9c", // texte inerte sur fond SOMBRE (ink) ou état désactivé —
  // ≈7,3:1 sur --ink, mais ~1,9:1 sur paper/card : jamais du texte lu sur
  // ces deux surfaces.
  "ghost-strong": "#746b57", // même rôle, lisible sur paper/card (≥4.5:1 AA) —
  // le mot en cours de tracé, les liens inertes sur fond clair.

  // Accent (unique)
  vermilion: "#b3402a", // l'accent, et lui seul : victoire, étoile, compteur

  // Filets
  line: "#d8cfbc", // séparation interne, filet subordonné

  // Carte de progression.
  "map-validated": "#efe9da", // case résolue
  "map-rule": "#c6bca6", // filet de la carte
  "map-dash": "#c1b7a2", // pointillé du verrouillé
  "map-count": "#8a806c", // chiffre secondaire

  // Encres d'autres mains (doc 06 § dérogation cadrée, DESIGN.md § Colors) —
  // 4 slots pour jusqu'à 4 joueurs, désaturées et de même valeur tonale que
  // `ink` : des couleurs de stylo, pas d'interface. Ordinales (slot 0..3,
  // `colorSlots` du state Rune), jamais liées à un joueur nommé. Le vermillon
  // reste hors de cette palette : lui seul dit « acquis ».
  "player-1": "#2f5a6b", // encre bleu pétrole
  "player-2": "#5b4a78", // encre violette
  "player-3": "#4f6b3a", // encre olive
  "player-4": "#7d5a2a", // encre ocre brûlée
} as const;

export type ColorName = keyof typeof COLORS;

/** Couleur en nombre (0xRRGGBB), format attendu par Pixi. */
export function hex(name: ColorName): number {
  return Number.parseInt(COLORS[name].slice(1), 16);
}

// Familles de police. SERIF_NAME est isolé parce que Pixi nomme une famille,
// là où le CSS veut la pile complète avec sa police de secours.
export const SERIF_NAME = "Source Serif 4";
export const MONO_NAME = "IBM Plex Mono";

export const FONTS = {
  serif: `"${SERIF_NAME}", serif`,
  mono: `"${MONO_NAME}", monospace`,
} as const;

// Les quatre niveaux de filet du système (DESIGN.md § Shapes). Écrits comme
// raccourcis `border` complets — valeur, style ET couleur — pour que le CSS
// n'ait qu'à poser `border: var(--rule-x)` au lieu de retaper les trois.
export const RULES = {
  heavy: "2px solid var(--ink)", // structurant : modale, header de carte. Rare.
  standard: "1.5px solid var(--ink)", // filet standard : actionnable, conteneur autonome.
  hairline: "1px solid var(--line)", // subordonné : sépare deux éléments d'un même conteneur.
  dashed: "1.5px dashed var(--map-rule)", // inerte : visible mais pas encore atteignable.
} as const;

// Les ombres dures du système (DESIGN.md § Elevation & Depth) : encre pleine,
// décalage diagonal égal en X/Y, flou nul. L'échelle documentée — 1 / 1.5 /
// 2.5 / 4px — plus un palier « mini » dédié aux miniatures (figures d'aide,
// pouce du curseur), trop petites pour l'échelle principale sans s'écraser.
export const SHADOWS_HARD = {
  xs: "1px 1px 0 var(--ink)", // petits éléments, mobile.
  sm: "1.5px 1.5px 0 var(--ink)", // petits éléments, desktop.
  md: "2.5px 2.5px 0 var(--ink)", // case de carte, standard.
  lg: "4px 4px 0 var(--ink)", // défi actif : plus haut parce qu'il compte plus.
  mini: "2px 2px 0 var(--ink)", // miniature (case d'aide 34px, pouce de curseur 16px).
  "mini-lg": "3px 3px 0 var(--ink)", // miniature défi (aide) : plus lourde que la case, comme en réel.
} as const;
