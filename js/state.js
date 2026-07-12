// @ts-check
// État centralisé de la partie. main.js écrit le déroulement, render.js
// et input.js le lisent (input.js ne modifie que path et pointerId).
// Le mode de jeu (forme de grille + puzzle) et sa géométrie changent à
// chaud via applyMode (main.js) : tout le reste en dérive.

import { DEFAULT_MODE, GAME_MODES } from "./config.js";
import { createGeometry } from "./geometry.js";

const defaultMode = GAME_MODES[DEFAULT_MODE];

export const state = {
  ready: false, // dictionnaires chargés et partie en place
  /** @type {keyof typeof GAME_MODES} Identifiant du mode actif. */
  modeId: DEFAULT_MODE,
  /** @type {import("./config.js").GameMode} Mode de jeu actif. */
  mode: defaultMode,
  /** @type {import("./geometry.js").Geometry} Géométrie de la grille du mode. */
  geometry: createGeometry(defaultMode.rows, defaultMode.cols),
  /** @type {import("./config.js").Difficulty} Difficulté courante (étoiles). */
  difficulty: 1,
  /** @type {string[]} Mots cachés de la grille. */
  solution: [],
  /** @type {Set<string>} Tous les mots (validation des tracés). */
  words: new Set(),
  /** @type {Set<string>} Préfixes du dictionnaire complet (mode debug uniquement). */
  fullPrefixes: new Set(),
  /** @type {Record<import("./config.js").Tier, Set<string>>}
   *  Mots des quatre paliers de vocabulaire (choix des mots cachés). */
  tierWords: {
    enfant: new Set(),
    ado: new Set(),
    adulte: new Set(),
    inconnu: new Set(),
  },
  /** @type {string[]} Les lettres de la grille courante (une par case). */
  letters: [],
  /** @type {number[]} Indices des cases du tracé en cours. */
  path: [],
  /** @type {number|null} Pointeur actif (les autres doigts sont ignorés). */
  pointerId: null,
  /** @type {string[]} */
  found: [],
  /** @type {Set<number>} Cases consommées par les mots trouvés (chaque
   *  lettre sert à un seul mot, elle est désactivée une fois utilisée). */
  usedCells: new Set(),
  /** @type {number[][]} Tracés des mots trouvés : le trait reste affiché
   *  en fantôme pour pouvoir relire les mots sur la grille. */
  foundPaths: [],
  /** @type {number|null} Timeout d'effacement du dernier mot refusé. */
  rejectTimer: null,
  won: false,
  gridTries: 0, // tirages de grilles avant d'en obtenir une valide (debug)
  startTime: 0,
  /** @type {number|null} */
  timerId: null,
};

// Adopte un mode : identifiant, mode et géométrie dérivée. Seule écriture
// autorisée de state.mode/geometry (main.js, au boot et au changement à
// chaud — le rebuild de la scène et du registre incombe à l'appelant).
/** @param {keyof typeof GAME_MODES} modeId */
export function applyMode(modeId) {
  state.modeId = modeId;
  state.mode = GAME_MODES[modeId];
  state.geometry = createGeometry(state.mode.rows, state.mode.cols);
}
