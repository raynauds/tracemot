// État centralisé de la partie. main.js écrit le déroulement, render.js
// et input.js le lisent (input.js ne modifie que path et pointerId).
// Le mode de jeu (forme de grille + puzzle) et sa géométrie changent à
// chaud via applyMode (main.js) : tout le reste en dérive.

import { DEFAULT_MODE, GAME_MODES } from "./config.ts";
import type { Difficulty, GameMode, Tier } from "./config.ts";
import { createGeometry } from "./geometry.ts";
import type { Geometry } from "./geometry.ts";

const defaultMode = GAME_MODES[DEFAULT_MODE];

export interface GameState {
  /** Dictionnaires chargés et partie en place. */
  ready: boolean;
  /** Identifiant du mode actif. */
  modeId: keyof typeof GAME_MODES;
  /** Mode de jeu actif. */
  mode: GameMode;
  /** Géométrie de la grille du mode. */
  geometry: Geometry;
  /** Difficulté courante (étoiles). */
  difficulty: Difficulty;
  /** Mots cachés de la grille. */
  solution: string[];
  /** Tous les mots (validation des tracés). */
  words: Set<string>;
  /** Préfixes du dictionnaire complet (mode debug uniquement). */
  fullPrefixes: Set<string>;
  /** Mots des quatre paliers de vocabulaire (choix des mots cachés). */
  tierWords: Record<Tier, Set<string>>;
  /** Les lettres de la grille courante (une par case). */
  letters: string[];
  /** Indices des cases du tracé en cours. */
  path: number[];
  /** Pointeur actif (les autres doigts sont ignorés). */
  pointerId: number | null;
  found: string[];
  /** Cases consommées par les mots trouvés (chaque lettre sert à un seul
   *  mot, elle est désactivée une fois utilisée). */
  usedCells: Set<number>;
  /** Tracés des mots trouvés : le trait reste affiché en fantôme pour
   *  pouvoir relire les mots sur la grille. */
  foundPaths: number[][];
  /** Timeout d'effacement du dernier mot refusé. */
  rejectTimer: number | null;
  won: boolean;
  /** Tirages de grilles avant d'en obtenir une valide (debug). */
  gridTries: number;
  startTime: number;
  timerId: number | null;
}

export const state: GameState = {
  ready: false, // dictionnaires chargés et partie en place
  modeId: DEFAULT_MODE,
  mode: defaultMode,
  geometry: createGeometry(defaultMode.rows, defaultMode.cols),
  difficulty: 1,
  solution: [],
  words: new Set(),
  fullPrefixes: new Set(),
  tierWords: {
    enfant: new Set(),
    ado: new Set(),
    adulte: new Set(),
    inconnu: new Set(),
  },
  letters: [],
  path: [],
  pointerId: null,
  found: [],
  usedCells: new Set(),
  foundPaths: [],
  rejectTimer: null,
  won: false,
  gridTries: 0, // tirages de grilles avant d'en obtenir une valide (debug)
  startTime: 0,
  timerId: null,
};

// Adopte un mode : identifiant, mode et géométrie dérivée. Seule écriture
// autorisée de state.mode/geometry (main.js, au boot et au changement à
// chaud — le rebuild de la scène et du registre incombe à l'appelant).
export function applyMode(modeId: keyof typeof GAME_MODES): void {
  state.modeId = modeId;
  state.mode = GAME_MODES[modeId];
  state.geometry = createGeometry(state.mode.rows, state.mode.cols);
}
