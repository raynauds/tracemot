// Orchestration : initialisation, cycle carte ↔ partie, validation des mots.
// Seul module à écrire le déroulement dans state.
//
// Le jeu n'a plus de générateur au runtime : la carte de progression est
// l'écran d'accueil, elle demande un niveau, on charge sa grille prégénérée
// et on la joue. Aucun dictionnaire n'est chargé au runtime.

import type { ModeId } from "@tracemot/core";
import { isDefi } from "@tracemot/core";
import type { LevelId } from "@tracemot/core";
import { initAudio, playSound } from "./audio/audio.ts";
import { loadModeLevels } from "./game/level-loader.ts";
import {
  loadProgress,
  migrateStorage,
  nextChoices,
  saveValidated,
  starCount,
  starRewardAt,
} from "./game/progress.ts";
import { applyLevel, state } from "./game/state.ts";
import { wordRejectReason } from "./game/rules.ts";
import {
  attachInputHandlers,
  cancelAllGestures,
  clearPath,
} from "./input/input.ts";
import {
  bindHome,
  hideHome,
  revealHome,
  showHome,
} from "./render/home.ts";
import { bindMap, bindMapHome, hideMap, showMap } from "./render/map.ts";
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
  bindWinNext,
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
} from "./render/render.ts";

// Demande de niveau en vol. Le chargement du mode est asynchrone et la carte
// reste cliquable pendant ce temps (elle n'est masquée qu'une fois la grille
// prête) : un double-clic, ou un clic sur une autre case avant l'arrivée du
// JSON, met deux startLevel en vol. Seule la DERNIÈRE demande doit aboutir —
// sinon la reprise périmée reconstruit une grille par-dessus la bonne et, en
// cas d'échec, affiche une erreur pour un niveau que le joueur ne demande plus.
let selection = 0;

// Lance un niveau : charge sa grille, reconstruit tout ce qui dépend de la
// géométrie (elle change d'un niveau à l'autre — un défi double le côté) et
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
    // L'échec laisse le joueur sur la carte : aucune partie n'est en place. Il
    // a pu partir de l'accueil (bouton « reprendre ») sans passer par elle : on
    // le range donc explicitement.
    state.ready = false;
    hideHome();
    showMap(); // la carte est re-rendue dessous : le clic sur le message la révèle
    return;
  }
  if (token !== selection) return; // une demande plus récente a pris la main

  cancelAllGestures(); // un geste en vol référencerait l'ancienne grille
  applyLevel(modeId, level);
  buildBoard(); // registre : wordCount lignes du niveau (défi compris)
  rebuildGrid(); // scène Pixi : cases recréées, caméra recadrée

  state.won = false;
  state.found = [];
  state.usedCells = new Set();
  state.foundPaths = [];
  state.path = [];
  state.pointerId = null;

  renderNewGame();
  renderSceneGrid(); // rendu Pixi de la grille (lettres + fonds)
  // Une partie se lance depuis l'un OU l'autre des deux écrans : on les ferme
  // tous les deux plutôt que de deviner d'où l'on vient.
  hideHome();
  hideMap();
  renderLevelHeader();
  state.ready = true;
  // Première visite : on présente la règle d'emblée (la carte est masquée,
  // le panneau est donc visible).
  showRuleOnFirstVisit();
}

// Le niveau est acquis : la carte en tiendra compte au prochain affichage
// (cases débloquées par la chaîne). saveValidated est idempotent — rejouer un
// niveau déjà validé ne change rien.
//
// Une étoile ne s'annonce qu'à la PREMIÈRE validation d'un défi : rejouer un
// défi déjà validé n'en redonne pas. D'où la lecture de la progression AVANT
// la sauvegarde — après, l'identifiant y est de toute façon, et la première
// fois serait indiscernable du rejeu.
//
// Les suites proposées, elles, se lisent APRÈS : ce sont les cases que cette
// victoire vient d'ouvrir, elles n'existent donc pas dans la progression d'avant.
function triggerWin() {
  state.won = true;
  const id = state.levelId;
  if (!id) {
    renderWin();
    return;
  }
  const { modeId } = state;
  const wasValidated = loadProgress(modeId).validated.has(id);
  saveValidated(modeId, id);
  const after = loadProgress(modeId);
  const choices = nextChoices(after, id);
  if (!isDefi(id) || wasValidated) {
    renderWin({ choices });
    return;
  }
  // Le défi vient d'être gagné : son rang d'étoile est le compte du mode une
  // fois la sauvegarde faite (la n-ième étoile est celle qu'on vient de poser).
  const count = starCount(after);
  renderWin({ star: { count, unlocked: starRewardAt(modeId, count) }, choices });
}

// Retour à la carte : la partie en cours est abandonnée telle quelle (aucune
// reprise n'est promise). showMap re-rend la carte, donc les cases que la
// victoire vient de débloquer.
function backToMap() {
  cancelAllGestures();
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
    // Refus : flash vermillon des cases + secousse écran (Pixi-natif) + son.
    flashPath(traced);
    shakeGrid();
    playSound("word-reject");
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
  playSound("word-stamp");
  renderCounter();
  if (state.found.length >= state.mode.wordCount) triggerWin();
}

async function init() {
  migrateStorage(); // vestiges du jeu libre + progressions d'un schéma périmé
  initAudio(); // précharge les bruitages ; le 1er geste du joueur les débloque
  buildBoard();
  renderCounter();
  await initScene(); // Application Pixi + graphe de scène (canvas de fond)
  // Après initScene : le stage Pixi existe, cible des events fédérés du tracé.
  // La grille construite là l'est pour la géométrie par défaut ; rebuildGrid
  // la refera à la forme du premier niveau lancé.
  attachInputHandlers({ onCommit: commitPath });
  bindMap(startLevel);
  bindMapReturn(backToMap);
  // Accueil ↔ carte : deux écrans, deux sens. L'accueil reprend là où on s'est
  // arrêté ou renvoie au choix du niveau ; la carte remonte à l'accueil.
  bindHome({
    onStart: startLevel,
    onLevels: () => {
      hideHome();
      showMap();
    },
  });
  bindMapHome(() => {
    hideMap();
    showHome();
  });
  // Enchaînement depuis l'écran de victoire : toujours dans le mode courant —
  // une étoile peut ouvrir le mode suivant, mais on ne l'y téléporte pas.
  bindWinNext((id) => startLevel(state.modeId, id));

  hideStatus();
  showHome(); // l'accueil est le premier écran : aucune partie, et pas même de
  // carte, tant qu'on n'a rien demandé.
}

// Rien n'est affiché tant que .booting est là (style.css) : on la retire une
// fois l'accueil en place, donc après initScene — qui attend déjà les polices.
// finally : un échec d'init ne doit pas laisser le joueur devant un écran vide
// à jamais ; mieux vaut révéler un chrome incomplet qu'un mur de papier.
//
// La séquence d'écriture du titre vient APRÈS le retrait de .booting, et pas
// avant : jouée sous un corps invisible, elle serait déjà finie à la révélation.
init().finally(() => {
  document.body.classList.remove("booting");
  revealHome();
});
