// État centralisé de la partie. main.ts écrit le déroulement, render.ts
// et input.ts le lisent (input.ts ne modifie que path et pointerId).
//
// Depuis la progression, l'état ne connaît plus que le niveau en cours :
// les dictionnaires ne sont plus chargés au runtime (les grilles sont
// prégénérées) et la difficulté n'est plus un choix du joueur mais une
// propriété de la section. La géométrie change à chaque niveau (un défi
// double le côté de la grille) : applyLevel reste la seule écriture
// autorisée de mode/geometry, tout le reste en dérive.

import { DEFAULT_MODE, GAME_MODES } from "./config.ts";
import type { GameMode, ModeId } from "./config.ts";
import { levelMode } from "./levels.ts";
import type { LevelData, LevelId } from "./levels.ts";
import { createGeometry } from "./geometry.ts";
import type { Geometry } from "./geometry.ts";

const defaultMode = GAME_MODES[DEFAULT_MODE];

export interface GameState {
  /** Niveau chargé et partie en place (faux tant qu'on est sur la carte). */
  ready: boolean;
  /** Mode dont vient le niveau en cours (l'onglet de la carte). */
  modeId: ModeId;
  /** Niveau en cours, null tant qu'aucun n'a été lancé. */
  levelId: LevelId | null;
  /** Forme du puzzle en cours : celle du mode, doublée pour un défi. */
  mode: GameMode;
  /** Géométrie de la grille du niveau. */
  geometry: Geometry;
  /** Mots cachés de la grille (peut contenir des doublons). */
  solution: string[];
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
}

export const state: GameState = {
  ready: false,
  modeId: DEFAULT_MODE,
  levelId: null,
  mode: defaultMode,
  geometry: createGeometry(defaultMode.rows, defaultMode.cols),
  solution: [],
  letters: [],
  path: [],
  pointerId: null,
  found: [],
  usedCells: new Set(),
  foundPaths: [],
  rejectTimer: null,
  won: false,
};

// Adopte un niveau : mode, identifiant, forme effective (défi compris),
// géométrie dérivée, solution et lettres prégénérées. Seule écriture
// autorisée de state.mode/geometry ; la reconstruction de la scène Pixi et
// du registre incombe à l'appelant (main.ts), qui seul sait quand elle est
// sûre (aucun geste en vol).
export function applyLevel(modeId: ModeId, level: LevelData): void {
  state.modeId = modeId;
  state.levelId = level.id;
  state.mode = levelMode(modeId, level.id);
  state.geometry = createGeometry(state.mode.rows, state.mode.cols);
  state.solution = level.words;
  state.letters = [...level.letters];
}
