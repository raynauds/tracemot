// @ts-check
// Orchestration : initialisation, déroulement d'une partie, validation
// des mots. Seul module à écrire le déroulement dans state.

import {
  DEBUG,
  DEFAULT_DIFFICULTY,
  DEFAULT_MODE,
  ENABLED_DIFFICULTIES,
  ENABLED_MODES,
  GAME_MODES,
} from "./config.js";
import { applyMode, state } from "./state.js";
import { buildLengthSets, loadDictionaries } from "./dictionary.js";
import { createGridGenerator } from "./solver.js";
import { wordRejectReason } from "./rules.js";
import { attachInputHandlers, cancelAllGestures, clearPath } from "./input.js";
import {
  flashPath,
  initScene,
  rebuildGrid,
  renderSceneGrid,
  renderUsedCells,
  shakeGrid,
  stampWord,
} from "./scene.js";
import {
  bindDifficultyBar,
  bindModeBar,
  buildBoard,
  fillListRow,
  hideStatus,
  renderCounter,
  renderDifficultyBar,
  renderLoadError,
  renderModeBar,
  renderNewGame,
  renderWin,
  showDifficultyToast,
  showModeToast,
  showReject,
  showRuleOnFirstVisit,
  startTimer,
  stopTimer,
} from "./render.js";

const DIFFICULTY_STORAGE_KEY = "tracemot.difficulty";
const MODE_STORAGE_KEY = "tracemot.mode";

/** @type {typeof import("./debug.js")|null} Module debug, chargé si DEBUG. */
let debug = null;

/** @type {ReturnType<typeof createGridGenerator>|null} Générateur du mode
 *  actif, fermé sur la géométrie et les dictionnaires (créé au premier
 *  lancement de partie, après le chargement des dictionnaires ; invalidé
 *  — remis à null — au changement de mode). */
let generator = null;

function startGame() {
  state.won = false;
  state.found = [];
  state.usedCells = new Set();
  state.foundPaths = [];
  state.path = [];
  state.pointerId = null;

  if (!generator) {
    const sets = buildLengthSets(
      state.words,
      state.tierWords,
      state.mode.wordLength,
    );
    generator = createGridGenerator(state.geometry, state.mode, sets);
  }
  const grid = generator.generate(state.difficulty);
  state.letters = grid.letters;
  state.gridTries = grid.tries;
  state.solution = grid.solution;

  renderNewGame();
  renderSceneGrid(); // rendu Pixi de la grille (lettres + fonds)
  if (debug) debug.renderDebugPanel();

  state.ready = true;
  startTimer(); // le chrono démarre quand la grille est prête
}

function triggerWin() {
  state.won = true;
  stopTimer();
  renderWin();
}

function commitPath() {
  // Moins de 2 lettres : simple tap ou lettre unique relâchée → ce n'est pas
  // une vraie soumission. On désélectionne (clearPath remet aussi la ligne du
  // registre à vide) sans flow d'erreur (ni flash, ni secousse, ni « reject »).
  if (state.path.length < 2) {
    clearPath();
    return;
  }
  const word = state.path.map((i) => state.letters[i]).join("");
  const traced = state.path.slice();
  clearPath(); // libère la ligne d'aperçu avant de la remplir ou de la marquer refusée

  const reason = wordRejectReason(word);
  if (reason) {
    // Refus : flash vermillon des cases + secousse écran (Pixi-natif).
    flashPath(traced);
    shakeGrid();
    showReject(word, reason);
    return;
  }

  state.found.push(word);
  fillListRow(state.found.length - 1, word, true);
  // Chaque lettre sert à exactement un mot : les cases du tracé validé
  // sont retirées du jeu.
  for (const i of traced) state.usedCells.add(i);
  state.foundPaths.push(traced);
  renderUsedCells(); // repeint les cases en disabled
  stampWord(traced); // tampon : tassement des cases + fondu du tracé fantôme
  renderCounter();
  if (state.found.length >= state.mode.wordCount) triggerWin();
}

/** @param {number} difficulty */
function setDifficulty(difficulty) {
  const valid = ENABLED_DIFFICULTIES.find((d) => d === difficulty);
  if (!valid || valid === state.difficulty || !state.ready) return;
  state.difficulty = valid;
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, String(valid));
  } catch (_) {
    /* stockage indisponible : la difficulté ne survivra pas au rechargement */
  }
  renderDifficultyBar();
  showDifficultyToast();
  startGame();
}

// Changement de mode à chaud : la partie en cours est abandonnée, la grille
// Pixi et le registre sont reconstruits à la forme du nouveau mode, et une
// partie est relancée (le générateur, fermé sur l'ancienne géométrie et les
// anciens sets de longueur, est invalidé — startGame le recrée).
/** @param {string} id */
function setMode(id) {
  const valid = ENABLED_MODES.find((m) => m === id);
  if (!valid || valid === state.modeId || !state.ready) return;
  cancelAllGestures(); // un geste en vol référencerait l'ancienne grille
  applyMode(valid);
  try {
    localStorage.setItem(MODE_STORAGE_KEY, valid);
  } catch (_) {
    /* stockage indisponible : le mode ne survivra pas au rechargement */
  }
  generator = null;
  buildBoard(); // registre : wordCount lignes du nouveau mode
  rebuildGrid(); // scène Pixi : cases recréées, caméra recadrée
  renderModeBar();
  showModeToast();
  startGame();
}

function restoreMode() {
  let stored = null;
  try {
    stored = localStorage.getItem(MODE_STORAGE_KEY);
  } catch (_) {
    /* stockage indisponible */
  }
  const valid = ENABLED_MODES.find((m) => m === stored);
  applyMode(
    valid ??
      (ENABLED_MODES.includes(DEFAULT_MODE) ? DEFAULT_MODE : ENABLED_MODES[0]),
  );
}

function restoreDifficulty() {
  let stored = NaN;
  try {
    stored = Number(localStorage.getItem(DIFFICULTY_STORAGE_KEY));
  } catch (_) {
    /* stockage indisponible */
  }
  const valid = ENABLED_DIFFICULTIES.find((d) => d === stored);
  state.difficulty =
    valid ??
    (ENABLED_DIFFICULTIES.includes(DEFAULT_DIFFICULTY)
      ? DEFAULT_DIFFICULTY
      : ENABLED_DIFFICULTIES[0]);
}

async function init() {
  restoreMode(); // avant tout lecteur de state.mode/geometry (board, scène)
  restoreDifficulty();
  buildBoard();
  renderCounter();
  renderModeBar();
  bindModeBar(setMode);
  renderDifficultyBar();
  bindDifficultyBar(setDifficulty);
  await initScene(); // Application Pixi + graphe de scène (canvas de fond)
  // Après initScene : le stage Pixi existe, cible des events fédérés du tracé.
  attachInputHandlers({ onCommit: commitPath, onReplay: startGame });

  try {
    // Préfixes du dictionnaire complet : mode debug uniquement, plafonnés à
    // la longueur maximale d'un tracé sur le plus grand des modes accessibles
    // (le mode peut changer à chaud sans recharger les dictionnaires).
    const maxCellCount = Math.max(
      ...ENABLED_MODES.map((m) => GAME_MODES[m].rows * GAME_MODES[m].cols),
    );
    const { full, tiers } = await loadDictionaries(DEBUG ? maxCellCount : 0);
    state.words = full.words;
    state.fullPrefixes = full.prefixes;
    state.tierWords = {
      enfant: tiers.enfant.words,
      ado: tiers.ado.words,
      adulte: tiers.adulte.words,
      inconnu: tiers.inconnu.words,
    };
  } catch (err) {
    console.error("Tracemot : échec du chargement des dictionnaires", err);
    renderLoadError(
      "Impossible de charger le dictionnaire. Servez le jeu via HTTP " +
        "(ex. « python -m http.server ») - l’ouverture directe en file:// ne fonctionne pas.",
    );
    return;
  }

  hideStatus();

  if (DEBUG) {
    debug = await import("./debug.js");
    debug.buildDebugPanel();
  }

  startGame();
  // Première visite : on présente la règle d'emblée (le statut de chargement
  // vient d'être masqué, le panneau est donc visible).
  showRuleOnFirstVisit();
}

init();
