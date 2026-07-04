// @ts-check
// Orchestration : initialisation, déroulement d'une partie, validation
// des mots. Seul module à écrire le déroulement dans state.

import {
  DEBUG,
  DEFAULT_DIFFICULTY,
  DEFAULT_MODE,
  ENABLED_DIFFICULTIES,
  ENABLED_MODES,
  WORDS_TO_WIN,
} from "./config.js";
import { state } from "./state.js";
import { buildFiveLetterSets, loadDictionaries } from "./dictionary.js";
import { generateFiveGrid, generateGrid } from "./solver.js";
import { wordRejectReason } from "./rules.js";
import { attachInputHandlers, clearPath } from "./input.js";
import {
  bindDifficultyBar,
  bindModeBar,
  buildBoard,
  fillListRow,
  flashPath,
  hideStatus,
  renderCounter,
  renderDifficultyBar,
  renderFoundTraces,
  renderLoadError,
  renderModeBar,
  renderNewGame,
  renderUsedCells,
  renderWin,
  showReject,
  startTimer,
  stopTimer,
} from "./render.js";

const MODE_STORAGE_KEY = "tracemot.mode";
const DIFFICULTY_STORAGE_KEY = "tracemot.difficulty";

/** @type {typeof import("./debug.js")|null} Module debug, chargé si DEBUG. */
let debug = null;

function startGame() {
  state.won = false;
  state.found = [];
  state.usedCells = new Set();
  state.foundPaths = [];
  state.path = [];
  state.pointerId = null;

  if (state.mode === "classique") {
    const grid = generateGrid(state.childWords, state.childPrefixes);
    state.letters = grid.letters;
    state.gridTries = grid.tries;
    state.solution = [];
  } else {
    if (!state.five) {
      state.five = buildFiveLetterSets(state.words, state.tierWords);
    }
    const grid = generateFiveGrid(state.mode, state.five, state.difficulty);
    state.letters = grid.letters;
    state.gridTries = grid.tries;
    state.solution = grid.solution;
  }

  renderNewGame();
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
  if (state.path.length === 0) return;
  const word = state.path.map((i) => state.letters[i]).join("");
  const traced = state.path.slice();
  clearPath(); // libère la ligne d'aperçu avant de la remplir ou de la marquer refusée

  const reason = wordRejectReason(word);
  if (reason) {
    flashPath(traced);
    showReject(word, reason);
    return;
  }

  state.found.push(word);
  fillListRow(state.found.length - 1, word, true);
  // En pavage parfait, chaque lettre sert à exactement un mot : les cases
  // du tracé validé sont retirées du jeu.
  if (state.mode === "pavage") {
    for (const i of traced) state.usedCells.add(i);
    state.foundPaths.push(traced);
    renderUsedCells();
    renderFoundTraces();
  }
  renderCounter();
  if (state.found.length >= WORDS_TO_WIN) triggerWin();
}

/** @param {string} mode */
function setMode(mode) {
  const valid = ENABLED_MODES.find((m) => m === mode);
  if (!valid || valid === state.mode || !state.ready) return;
  state.mode = valid;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, valid);
  } catch (_) {
    /* stockage indisponible : le mode ne survivra pas au rechargement */
  }
  renderModeBar();
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
  state.mode =
    valid ??
    (ENABLED_MODES.includes(DEFAULT_MODE) ? DEFAULT_MODE : ENABLED_MODES[0]);
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
  startGame();
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
  restoreMode();
  restoreDifficulty();
  buildBoard();
  renderCounter();
  renderModeBar();
  bindModeBar(setMode);
  renderDifficultyBar();
  bindDifficultyBar(setDifficulty);
  attachInputHandlers({ onCommit: commitPath, onReplay: startGame });

  try {
    const { full, tiers } = await loadDictionaries(DEBUG);
    state.words = full.words;
    state.fullPrefixes = full.prefixes;
    state.tierWords = {
      enfant: tiers.enfant.words,
      ado: tiers.ado.words,
      adulte: tiers.adulte.words,
      inconnu: tiers.inconnu.words,
    };
    state.childWords = tiers.enfant.words;
    state.childPrefixes = tiers.enfant.prefixes;
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
}

init();
