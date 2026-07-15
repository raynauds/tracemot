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
  ghost: "#b9af9c", // texte inerte : verrouillé, désactivé

  // Accent (unique)
  vermilion: "#b3402a", // l'accent, et lui seul : victoire, étoile, compteur

  // Filets
  line: "#d8cfbc", // séparation interne, filet subordonné

  // Carte de progression.
  "map-validated": "#efe9da", // case résolue
  "map-rule": "#c6bca6", // filet de la carte
  "map-dash": "#c1b7a2", // pointillé du verrouillé
  "map-count": "#8a806c", // chiffre secondaire
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
