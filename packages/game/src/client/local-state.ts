// Remplace l'ancien singleton game/state.ts (doc 01/02) : `game` (le state
// Rune, synchronisé par predict-rollback) est désormais l'unique source de
// vérité de la PARTIE — ce module ne fait plus que deux choses, distinctes :
//
//   1. de l'état VRAIMENT local, que Rune ne connaît pas : le tracé en cours
//      (soumis seulement au commit, doc 01 § Ce qui reste local au client),
//      le pointeur actif, les timers d'UI (délai de victoire, effacement du
//      mot refusé) et l'écran affiché (carte / partie — un écran est local,
//      cf. doc 02 § Machine de phase : `phase`, elle, est globale).
//   2. un CACHE en lecture, resynchronisé à chaque onChange (syncFromGame /
//      syncPresence), de ce que `game` donne à voir de la partie en cours ET
//      de la présence des autres joueurs (mode, géométrie, lettres, solution,
//      mots trouvés, tracés distants, slots de couleur, doc 05/06) — pour que
//      scene.ts/render.ts/input.ts gardent leurs lectures `local.xxx` telles
//      quelles, sans avoir à faire transiter `game` jusqu'au fond de chaque
//      fonction Pixi.
//
// S'y ajoute (doc 05 § Publication du tracé) le THROTTLE de publication de
// `local.path` vers `updateTrace` — toujours rien qui écrive vers Rune
// directement : le throttle appelle un expéditeur fourni par client.ts
// (`bindTracePublisher`), seul fichier autorisé à dispatcher des actions.

import {
  DEFAULT_MODE,
  GAME_MODES,
  createGeometry,
  levelMode,
  type GameMode,
  type Geometry,
  type LevelId,
  type ModeId,
} from "@traceword/core";
import { resolveLevel } from "../levels/data.ts";
import type { WordCheckContext } from "../game/rules.ts";
import type { ColorSlot, PlayerId, RuneGameState } from "../logic/types.ts";

export type Screen = "map" | "game";

const defaultMode = GAME_MODES[DEFAULT_MODE];

// Tracé distant en cache (doc 05) : contenu + horodatage de son dernier
// changement RÉEL (comparaison par valeur, jamais par référence) — sert à
// l'estompe progressive d'un tracé muet (~5 s sans mise à jour, scene.ts).
export interface RemoteTrace {
  path: number[];
  lastChangedAt: number;
}

export interface LocalState {
  // --- Écran local (doc 02 § Machine de phase) -------------------------------
  /** Écran affiché par CE client. Suit `game.phase`, sauf après une victoire :
   *  le retour à la carte y est local (aucune action), donc peut diverger de
   *  `game.phase` (qui reste "playing" tant qu'aucune proposition n'est
   *  acceptée). */
  screen: Screen;

  // --- Présence (doc 05/06) : à jour à CHAQUE onChange, quel que soit l'écran
  /** Moi (undefined = spectateur, doc 02 § fin). */
  yourPlayerId: PlayerId | undefined;
  /** Slot de couleur global par joueur (doc 06) — je n'y pioche jamais pour
   *  moi-même, seulement pour peindre ce que font les AUTRES. */
  colorSlots: Record<PlayerId, ColorSlot>;

  // --- Cache dérivé de `game` (partie en cours) ------------------------------
  modeId: ModeId;
  levelId: LevelId | null;
  mode: GameMode;
  geometry: Geometry;
  solution: string[];
  /** Tracés-solution du niveau, alignés sur `solution` — dessinés uniquement
   *  en DEBUG_MODE (render/scene.ts § renderDebugPaths). */
  solutionPaths: number[][];
  letters: string[];
  /** Mots trouvés, en clair — dérivé de `game.found`. */
  found: string[];
  /** Tracés des mots trouvés, dans le même ordre que `found`. */
  foundPaths: number[][];
  /** Leur auteur, dans le même ordre que `found`/`foundPaths` (doc 05/06 §
   *  mots validés teintés). */
  foundBy: PlayerId[];
  won: boolean;
  /** Une partie est en place et jouable (grille chargée). */
  ready: boolean;
  /** Tracés en cours des AUTRES joueurs (jamais le mien), dérivé de
   *  `game.traces` — doc 05 § Rendu des tracés distants. */
  remoteTraces: Record<PlayerId, RemoteTrace>;

  // --- Vraiment local -----------------------------------------------------
  /** Tracé en cours du joueur local (indices de cases). */
  path: number[];
  /** Pointeur actif du geste de tracé (les autres doigts sont ignorés). */
  pointerId: number | null;
  /** Timeout d'effacement du dernier mot refusé (client-only, doc 01). */
  rejectTimer: number | null;
  /** Timeout d'affichage différé de l'écran de victoire (WIN_DELAY_MS,
   *  game/config.ts) — annulé (client/client.ts § clearWinTimer) à toute
   *  transition d'écran survenant avant son échéance : nouvelle manche
   *  (rejeu du même niveau) ou retour carte (p. ex. un abandon voté à
   *  l'unanimité pendant la fenêtre de délai). */
  winTimer: number | null;
}

export const local: LocalState = {
  screen: "map",
  yourPlayerId: undefined,
  colorSlots: {},
  modeId: DEFAULT_MODE,
  levelId: null,
  mode: defaultMode,
  geometry: createGeometry(defaultMode.rows, defaultMode.cols),
  solution: [],
  solutionPaths: [],
  letters: [],
  found: [],
  foundPaths: [],
  foundBy: [],
  won: false,
  ready: false,
  remoteTraces: {},
  path: [],
  pointerId: null,
  rejectTimer: null,
  winTimer: null,
};

// Présence (doc 05/06) : identité + slots de couleur, à jour à CHAQUE
// onChange, INDÉPENDAMMENT de l'écran affiché (carte, partie, victoire) — au
// contraire de syncFromGame ci-dessous, scopée à la partie en cours. Appelée
// une seule fois par client.ts, en tête du callback.
export function syncPresence(
  yourPlayerId: PlayerId | undefined,
  colorSlots: Record<PlayerId, ColorSlot>,
): void {
  local.yourPlayerId = yourPlayerId;
  local.colorSlots = colorSlots;
}

function pathsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Tracés distants (doc 05) : reconstruits à chaque appel depuis `game.traces`
// (jamais le mien), en conservant l'horodatage précédent tant que le CONTENU
// n'a pas changé — c'est cet horodatage qui pilote l'estompe (scene.ts). Un
// joueur qui n'y figure plus (parti, ou tracé vidé) disparaît du cache du même
// coup : pas d'effacement à part.
function syncRemoteTraces(game: RuneGameState): void {
  const now = Date.now();
  const next: Record<PlayerId, RemoteTrace> = {};
  for (const playerId in game.traces) {
    if (playerId === local.yourPlayerId) continue; // jamais mon propre tracé ici (doc 06)
    const path = game.traces[playerId];
    if (path.length === 0) continue;
    const prev = local.remoteTraces[playerId];
    next[playerId] = {
      path,
      lastChangedAt: prev && pathsEqual(prev.path, path) ? prev.lastChangedAt : now,
    };
  }
  local.remoteTraces = next;
}

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
  local.foundBy = game.found.map((f) => f.by);
  syncRemoteTraces(game);

  if (!game.levelId) return;
  const level = resolveLevel(game.modeId, game.levelId);
  if (!level) {
    // Ne devrait jamais survenir : logic ne pose `levelId` qu'à partir des
    // mêmes données statiques que le client (doc 01 § Données de niveaux,
    // build unique). Défense en profondeur seulement.
    console.error(`Traceword : niveau « ${game.levelId} » absent du mode ${game.modeId}`);
    return;
  }
  local.mode = levelMode(game.modeId, level.id);
  local.geometry = createGeometry(local.mode.rows, local.mode.cols);
  local.solution = level.words;
  local.solutionPaths = level.paths;
  local.letters = [...level.letters];
}

// Cases consommées par les mots trouvés : DÉRIVÉES de foundPaths, jamais
// stockées à part (doc 01 § conformité #3).
export function usedCells(): Set<number> {
  const used = new Set<number>();
  for (const path of local.foundPaths) for (const i of path) used.add(i);
  return used;
}

// Auteur du mot qui a consommé la case i, ou undefined (case libre) — dérivé
// de foundPaths/foundBy, jamais stocké (doc 05/06 § cases consommées).
export function cellOwner(i: number): PlayerId | undefined {
  for (let k = 0; k < local.foundPaths.length; k++) {
    if (local.foundPaths[k].includes(i)) return local.foundBy[k];
  }
  return undefined;
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

// --- Publication throttlée du tracé (doc 05 § Publication du tracé) --------
//
// Le tracé local (`local.path`, ci-dessus) reste muté à chaque pointermove,
// bien au-delà de 10 Hz : ce qui suit ne DÉCOUPLE que sa PUBLICATION vers
// Rune (`updateTrace`), throttlée à ~150 ms (~6-7 actions/s, sous la limite de
// 10/joueur/s avec marge pour `submitWord`). Le throttle vit ici (doc 05),
// mais ne dispatche rien lui-même : client.ts fournit l'expéditeur
// (`bindTracePublisher`), seul fichier autorisé à appeler `Rune.actions.*`.
const TRACE_THROTTLE_MS = 150;

let sendTrace: ((path: number[]) => void) | null = null;

/** Fournit l'expéditeur réseau (client.ts uniquement) — cf. en-tête ci-dessus. */
export function bindTracePublisher(send: (path: number[]) => void): void {
  sendTrace = send;
}

let lastSentAt = 0;
let lastSentPath: number[] = [];
let trailingTimer: number | null = null;
let trailingPath: number[] | null = null;

function sendNow(path: number[]): void {
  if (!sendTrace) return;
  lastSentAt = Date.now();
  lastSentPath = path.slice();
  sendTrace(path);
}

/** Annule un envoi trailing en attente, sans rien publier (doc 05 : soumission
 *  ou effacement annulent le trailing — sinon il repeuplerait `traces[]` d'un
 *  tracé fantôme après coup). Sûr à appeler même sans trailing programmé. */
export function cancelTracePublish(): void {
  if (trailingTimer !== null) {
    clearTimeout(trailingTimer);
    trailingTimer = null;
  }
  trailingPath = null;
}

/** Efface le tracé publié IMMÉDIATEMENT, hors throttle (doigt levé sans
 *  soumission, ou tracé < 2 lettres, doc 05) : annule d'abord tout trailing en
 *  attente, pour ne jamais laisser un ancien contenu repartir après. Ne
 *  dispatche RIEN si les autres voient déjà un tracé vide et qu'aucun
 *  trailing n'était en vol — un tap avorté (jamais publié, < 2 lettres) ne
 *  doit pas gaspiller une action pour « effacer » ce qui n'a jamais été
 *  montré. */
export function flushEmptyTrace(): void {
  const hadPendingTrailing = trailingTimer !== null;
  cancelTracePublish();
  if (hadPendingTrailing || !pathsEqual(lastSentPath, [])) sendNow([]);
}

/** À appeler à CHAQUE changement de CONTENU du tracé en cours (une case
 *  accrochée ou retirée) — jamais à chaque pointermove. Envoi immédiat si le
 *  dernier envoi date de plus de 150 ms ; sinon planifie un envoi trailing
 *  (le dernier état d'un burst part toujours, doc 05) qui reprend le contenu
 *  le plus récent si plusieurs changements arrivent avant son échéance. */
export function publishTrace(): void {
  if (!sendTrace) return;
  const path = local.path.length >= 2 ? local.path.slice() : [];
  if (trailingTimer === null && pathsEqual(path, lastSentPath)) return;

  const elapsed = Date.now() - lastSentAt;
  if (elapsed >= TRACE_THROTTLE_MS) {
    cancelTracePublish();
    sendNow(path);
    return;
  }
  trailingPath = path;
  if (trailingTimer !== null) return; // déjà programmé : reprendra trailingPath à l'échéance
  trailingTimer = window.setTimeout(() => {
    trailingTimer = null;
    const toSend = trailingPath;
    trailingPath = null;
    if (toSend !== null) sendNow(toSend);
  }, TRACE_THROTTLE_MS - elapsed);
}
