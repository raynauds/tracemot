// Remplace l'ancien singleton game/state.ts (doc 01/02) : `game` (le state
// Rune, synchronisé par predict-rollback) est désormais l'unique source de
// vérité de la PARTIE — ce module ne fait plus que deux choses, distinctes :
//
//   1. de l'état VRAIMENT local, que Rune ne connaît pas : le tracé en cours
//      (soumis seulement au commit, doc 01 § Ce qui reste local au client),
//      le pointeur actif, les timers d'UI (délai de victoire, effacement du
//      mot refusé) et l'écran affiché (carte / partie — un écran est local,
//      cf. doc 02 § Machine de phase : `phase`, elle, est globale).
//   2. un CACHE en lecture, resynchronisé à chaque onChange (syncFromGame),
//      de ce que `game` donne à voir de la partie en cours (mode, géométrie,
//      lettres, solution, mots trouvés) — pour que scene.ts/render.ts/input.ts
//      gardent leurs lectures `local.xxx` telles quelles, sans avoir à faire
//      transiter `game` jusqu'au fond de chaque fonction Pixi.
//
// Rien ici n'est écrit vers Rune : seul client.ts dispatche des actions.

import {
  DEFAULT_MODE,
  GAME_MODES,
  createGeometry,
  levelMode,
  type GameMode,
  type Geometry,
  type LevelId,
  type ModeId,
} from "@tracemot/core";
import { resolveLevel } from "../levels/data.ts";
import type { WordCheckContext } from "../game/rules.ts";
import type { RuneGameState } from "../logic/types.ts";

export type Screen = "map" | "game";

const defaultMode = GAME_MODES[DEFAULT_MODE];

export interface LocalState {
  // --- Écran local (doc 02 § Machine de phase) -------------------------------
  /** Écran affiché par CE client. Suit `game.phase`, sauf après une victoire :
   *  le retour à la carte y est local (aucune action), donc peut diverger de
   *  `game.phase` (qui reste "playing" tant qu'aucune proposition n'est
   *  acceptée). */
  screen: Screen;

  // --- Cache dérivé de `game` (partie en cours) ------------------------------
  modeId: ModeId;
  levelId: LevelId | null;
  mode: GameMode;
  geometry: Geometry;
  solution: string[];
  letters: string[];
  /** Mots trouvés, en clair — dérivé de `game.found`. */
  found: string[];
  /** Tracés des mots trouvés, dans le même ordre que `found`. */
  foundPaths: number[][];
  won: boolean;
  /** Une partie est en place et jouable (grille chargée). */
  ready: boolean;

  // --- Vraiment local -----------------------------------------------------
  /** Tracé en cours du joueur local (indices de cases). */
  path: number[];
  /** Pointeur actif du geste de tracé (les autres doigts sont ignorés). */
  pointerId: number | null;
  /** Timeout d'effacement du dernier mot refusé (client-only, doc 01). */
  rejectTimer: number | null;
  /** Timeout d'affichage différé de l'écran de victoire (WIN_DELAY_MS,
   *  game/config.ts) — annulé si une nouvelle manche démarre avant qu'il ne
   *  se déclenche (rejeu du même niveau pendant le délai). */
  winTimer: number | null;
}

export const local: LocalState = {
  screen: "map",
  modeId: DEFAULT_MODE,
  levelId: null,
  mode: defaultMode,
  geometry: createGeometry(defaultMode.rows, defaultMode.cols),
  solution: [],
  letters: [],
  found: [],
  foundPaths: [],
  won: false,
  ready: false,
  path: [],
  pointerId: null,
  rejectTimer: null,
  winTimer: null,
};

// Resynchronise le cache dérivé depuis le state Rune : seul point d'écriture
// de la partie "un" (mode/géométrie/lettres/solution/found/foundPaths/won/
// ready/modeId/levelId) — appelé par client.ts à chaque entrée en partie
// (nouvelle manche ou stateSync) et à chaque mot trouvé. Ne touche jamais au
// tracé local ni aux timers (appelants dédiés : cancelAllGestures, clearPath).
export function syncFromGame(game: RuneGameState): void {
  local.modeId = game.modeId;
  local.levelId = game.levelId;
  local.won = game.won;
  local.ready = game.phase === "playing" && game.levelId !== null;
  local.found = game.found.map((f) => f.word);
  local.foundPaths = game.found.map((f) => f.path);

  if (!game.levelId) return;
  const level = resolveLevel(game.modeId, game.levelId);
  if (!level) {
    // Ne devrait jamais survenir : logic ne pose `levelId` qu'à partir des
    // mêmes données statiques que le client (doc 01 § Données de niveaux,
    // build unique). Défense en profondeur seulement.
    console.error(`Tracemot : niveau « ${game.levelId} » absent du mode ${game.modeId}`);
    return;
  }
  local.mode = levelMode(game.modeId, level.id);
  local.geometry = createGeometry(local.mode.rows, local.mode.cols);
  local.solution = level.words;
  local.letters = [...level.letters];
}

// Cases consommées par les mots trouvés : DÉRIVÉES de foundPaths, jamais
// stockées à part (doc 01 § conformité #3).
export function usedCells(): Set<number> {
  const used = new Set<number>();
  for (const path of local.foundPaths) for (const i of path) used.add(i);
  return used;
}

// Contexte de wordRejectReason (fonction pure, game/rules.ts) construit depuis
// le cache local — utilisé UNIQUEMENT pour le retour immédiat local (flash,
// secousse) avant de soumettre `submitWord` : la validation qui compte est
// celle, autoritaire, de logic.ts (doc 01/02).
export function wordCheckContext(): WordCheckContext {
  return {
    wordLength: local.mode.wordLength,
    solution: local.solution,
    found: local.found,
  };
}
