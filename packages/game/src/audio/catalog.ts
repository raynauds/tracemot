// Catalogue des bruitages : identifiant sémantique (l'événement de jeu) →
// chemin dans public/sounds/. Les fichiers gardent leur nom d'origine (pack,
// auteur, numéro) pour la traçabilité ; remplacer un son ne touche que cette
// table. SoundId étant dérivé du catalogue, un identifiant inconnu est une
// erreur de compilation.
//
// « ui-primary » sonne les boutons qui ENGAGENT (lancer ou poursuivre une
// partie) ; « ui-secondary » ceux qui consultent, ajustent ou naviguent. Les
// éléments inertes (cases verrouillées, défis grisés) ne sonnent pas.

const PACK =
  "JDSherbert - Ultimate UI SFX Pack (FREE)/JDSherbert - Ultimate UI SFX Pack";

export const SOUNDS = {
  "trace-letter": `${PACK} - Cursor - 4.mp3`,
  "word-reject": `${PACK} - Cancel - 1.mp3`,
  "ui-primary": `${PACK} - Select - 1.mp3`,
  "ui-secondary": `${PACK} - Cursor - 2.mp3`,
} as const;

export type SoundId = keyof typeof SOUNDS;
