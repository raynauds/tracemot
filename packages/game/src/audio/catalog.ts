// Catalogue des bruitages : identifiant sémantique (l'événement de jeu) →
// chemin dans public/sounds/. Les fichiers gardent leur nom d'origine (pack,
// auteur, numéro) pour la traçabilité ; remplacer un son ne touche que cette
// table. SoundId étant dérivé du catalogue, un identifiant inconnu est une
// erreur de compilation.
//
// « ui-primary » sonne les boutons qui ENGAGENT (lancer ou poursuivre une
// partie) ; « ui-secondary » ceux qui consultent, ajustent ou naviguent ;
// « ui-close » ceux qui FERMENT ou reviennent en arrière (voile, ×, Échap,
// retour d'écran). Les éléments inertes (cases verrouillées, défis grisés) ne
// sonnent pas.

const PACK =
  "JDSherbert - Ultimate UI SFX Pack (FREE)/JDSherbert - Ultimate UI SFX Pack";

// Une entrée est un chemin nu (volume nominal) ou { path, volume } quand le
// fichier source demande un rééquilibrage — le volume du catalogue est le
// niveau de mixage du son, celui passé à playSound s'y multiplie.
export const SOUNDS = {
  "trace-letter": { path: `${PACK} - Cursor - 4.mp3`, volume: 0.6 },
  "word-stamp": { path: "UI Soundpack/African4.mp3", volume: 3 },
  // TODO(son victoire) : placeholder — même fichier que « word-stamp » en
  // attendant le vrai son de victoire (le propriétaire le fournira plus tard).
  "level-win": { path: "UI Soundpack/African4.mp3", volume: 3 },
  "word-reject": { path: `${PACK} - Cancel - 1.mp3`, volume: 0.8 },
  "ui-primary": { path: `${PACK} - Select - 1.mp3`, volume: 0.8 },
  "ui-secondary": { path: `${PACK} - Cursor - 2.mp3`, volume: 0.8 },
  "ui-close": { path: `${PACK} - Cursor - 1.mp3`, volume: 0.6 },
} as const;

export type SoundId = keyof typeof SOUNDS;

// Musique de fond : une seule piste, hors catalogue des bruitages — le moteur
// la joue en boucle continue au lieu d'une source jetable par lecture.
export const MUSIC = {
  path: "Pixabay/sonican-jazzy-lofi-calm-background-loop-541849.mp3",
  volume: 0.4,
} as const;

export function soundPath(id: SoundId): string {
  const entry = SOUNDS[id];
  return typeof entry === "string" ? entry : entry.path;
}

export function soundVolume(id: SoundId): number {
  const entry = SOUNDS[id];
  return typeof entry === "string" ? 1 : entry.volume;
}
