// Orchestration : initialisation, cycle carte ↔ partie, validation des mots.
// Seul module à écrire le déroulement dans state.
//
// Le jeu n'a plus de générateur au runtime : la carte de progression est
// l'écran d'accueil, elle demande un niveau, on charge sa grille prégénérée
// et on la joue. Aucun dictionnaire n'est chargé (sauf par le panneau debug,
// qui charge le sien).

import { DEBUG } from "./game/config.ts";
import type { ModeId } from "./game/config.ts";
import { loadModeLevels } from "./game/levels.ts";
import type { LevelId } from "./game/levels.ts";
import { purgeLegacyKeys, saveValidated } from "./game/progress.ts";
import { applyLevel, state } from "./game/state.ts";
import { wordRejectReason } from "./game/rules.ts";
import {
  attachInputHandlers,
  cancelAllGestures,
  clearPath,
} from "./input/input.ts";
import { bindMap, hideMap, showMap } from "./render/map.ts";
import {
  flashPath,
  initScene,
  rebuildGrid,
  renderSceneGrid,
  renderUsedCells,
  shakeGrid,
  stampWord,
} from "./render/scene.ts";
import {
  bindMapReturn,
  buildBoard,
  fillListRow,
  hideStatus,
  renderCounter,
  renderLevelHeader,
  renderLoadError,
  renderNewGame,
  renderWin,
  showReject,
  showRuleOnFirstVisit,
  startTimer,
  stopTimer,
} from "./render/render.ts";

/** Module debug, chargé si DEBUG. */
let debug: typeof import("./debug/debug.ts") | null = null;

// Demande de niveau en vol. Le chargement du mode est asynchrone et la carte
// reste cliquable pendant ce temps (elle n'est masquée qu'une fois la grille
// prête) : un double-clic, ou un clic sur une autre case avant l'arrivée du
// JSON, met deux startLevel en vol. Seule la DERNIÈRE demande doit aboutir —
// sinon la reprise périmée reconstruit une grille par-dessus la bonne, relance
// son chrono et, en cas d'échec, affiche une erreur pour un niveau que le
// joueur ne demande plus.
let selection = 0;

// Lance un niveau : charge sa grille, reconstruit tout ce qui dépend de la
// géométrie (elle change d'un niveau à l'autre — un boss double le côté) et
// remet le déroulé à zéro. Sert aussi de rejeu (même identifiant).
async function startLevel(modeId: ModeId, id: LevelId) {
  const token = ++selection;
  let level;
  try {
    const { levels } = await loadModeLevels(modeId);
    level = levels[id];
    if (!level) throw new Error(`niveau « ${id} » absent du mode ${modeId}`);
  } catch (err) {
    if (token !== selection) return; // demande périmée : elle n'a plus la parole
    console.error("Tracemot : échec du chargement du niveau", err);
    renderLoadError(
      "Impossible de charger le niveau. Servez le jeu via HTTP " +
        "(ex. « npm run dev ») - l’ouverture directe en file:// ne fonctionne pas." +
        "\n\nCliquez pour revenir à la carte.",
    );
    // L'échec laisse le joueur sur la carte : aucune partie n'est en place.
    state.ready = false;
    stopTimer();
    showMap(); // la carte est re-rendue dessous : le clic sur le message la révèle
    return;
  }
  if (token !== selection) return; // une demande plus récente a pris la main

  cancelAllGestures(); // un geste en vol référencerait l'ancienne grille
  applyLevel(modeId, level);
  buildBoard(); // registre : wordCount lignes du niveau (boss compris)
  rebuildGrid(); // scène Pixi : cases recréées, caméra recadrée

  state.won = false;
  state.found = [];
  state.usedCells = new Set();
  state.foundPaths = [];
  state.path = [];
  state.pointerId = null;

  renderNewGame();
  renderSceneGrid(); // rendu Pixi de la grille (lettres + fonds)
  hideMap();
  renderLevelHeader();
  state.ready = true;
  startTimer(); // le chrono démarre quand la grille est prête
  // Première visite : on présente la règle d'emblée (la carte est masquée,
  // le panneau est donc visible).
  showRuleOnFirstVisit();
  if (debug) debug.renderDebugPanel();
}

// Le niveau est acquis : la carte en tiendra compte au prochain affichage
// (cases voisines débloquées). saveValidated est idempotent — rejouer un
// niveau déjà validé ne change rien.
function triggerWin() {
  state.won = true;
  stopTimer();
  if (state.levelId) saveValidated(state.modeId, state.levelId);
  renderWin();
}

// Retour à la carte : la partie en cours est abandonnée telle quelle (aucune
// reprise n'est promise). showMap re-rend la carte, donc les cases que la
// victoire vient de débloquer.
function backToMap() {
  cancelAllGestures();
  stopTimer();
  state.ready = false;
  showMap();
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

async function init() {
  purgeLegacyKeys(); // vestiges du jeu libre (mode et difficulté au choix)
  buildBoard();
  renderCounter();
  await initScene(); // Application Pixi + graphe de scène (canvas de fond)
  // Après initScene : le stage Pixi existe, cible des events fédérés du tracé.
  // La grille construite là l'est pour la géométrie par défaut ; rebuildGrid
  // la refera à la forme du premier niveau lancé.
  attachInputHandlers({
    onCommit: commitPath,
    onReplay: () => {
      if (state.levelId) startLevel(state.modeId, state.levelId);
    },
  });
  bindMap(startLevel);
  bindMapReturn(backToMap);

  if (DEBUG) {
    debug = await import("./debug/debug.ts");
    debug.buildDebugPanel();
  }

  hideStatus();
  showMap(); // la carte est l'écran d'accueil : aucune partie tant qu'on n'a
  // pas choisi de niveau.
}

init();
