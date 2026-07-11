// @ts-check
// Orchestration : initialisation, déroulement d'une partie, validation
// des mots. Seul module à écrire le déroulement dans state.

import {
  DEBUG,
  DEFAULT_DIFFICULTY,
  ENABLED_DIFFICULTIES,
  WORDS_TO_WIN,
} from "./config.js";
import { state } from "./state.js";
import { buildFiveLetterSets, loadDictionaries } from "./dictionary.js";
import { generateFiveGrid } from "./solver.js";
import { wordRejectReason } from "./rules.js";
import { attachInputHandlers, clearPath } from "./input.js";
import {
  flashPath,
  initScene,
  renderSceneGrid,
  renderUsedCells,
  shakeGrid,
  stampWord,
} from "./scene.js";
import {
  bindDifficultyBar,
  buildBoard,
  fillListRow,
  hideStatus,
  renderCounter,
  renderDifficultyBar,
  renderLoadError,
  renderNewGame,
  renderWin,
  showDifficultyToast,
  showReject,
  startTimer,
  stopTimer,
} from "./render.js";

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

  if (!state.five) {
    state.five = buildFiveLetterSets(state.words, state.tierWords);
  }
  const grid = generateFiveGrid(state.five, state.difficulty);
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
  if (state.found.length >= WORDS_TO_WIN) triggerWin();
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
  restoreDifficulty();
  buildBoard();
  renderCounter();
  renderDifficultyBar();
  bindDifficultyBar(setDifficulty);
  await initScene(); // Application Pixi + graphe de scène (canvas de fond)
  // Après initScene : le stage Pixi existe, cible des events fédérés du tracé.
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
