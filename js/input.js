// @ts-check
// Tracé sur la grille Pixi. Events fédérés sur app.stage (pointerdown +
// globalpointermove + pointerup), hit-test de case en espace monde.
// Ne modifie que state.path et state.pointerId ; la validation du mot est
// déléguée au handler onCommit fourni par main.js. Les règles (adjacence
// orthogonale, backtrack, cases inertes, filets de sécurité) sont reprises
// telles quelles de l'ancien input.js ; seule la source de coordonnées change.

import { GRID_SIZE } from "./config.js";
import { state } from "./state.js";
import { buzz, renderPendingWord, replayEl } from "./render.js";
import {
  cellAtGlobal,
  getStage,
  renderTrace,
  updateSelection,
} from "./scene.js";

/** @typedef {import("pixi.js").FederatedPointerEvent} FederatedPointerEvent */

/** @type {() => void} */
let onCommit = () => {};

export function clearPath() {
  state.path = [];
  updateSelection();
  renderTrace();
  renderPendingWord();
}

/**
 * @param {number} a
 * @param {number} b
 */
function isOrthAdjacent(a, b) {
  const ra = Math.floor(a / GRID_SIZE);
  const ca = a % GRID_SIZE;
  const rb = Math.floor(b / GRID_SIZE);
  const cb = b % GRID_SIZE;
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
}

/** @param {FederatedPointerEvent} e */
function onPointerDown(e) {
  if (!state.ready || state.won) return;
  if (e.button !== 0) return; // bouton principal, doigt ou stylet uniquement
  if (state.pointerId !== null) {
    if (e.pointerId !== state.pointerId) return; // second doigt : ignoré
    // Même pointeur qui re-presse : le pointerup a été manqué (perte de
    // focus en plein tracé) - on abandonne le tracé fantôme et on repart.
    state.pointerId = null;
    clearPath();
  }
  const idx = cellAtGlobal(e.global);
  if (idx === null) return;
  // Case déjà consommée par un mot trouvé : hors jeu.
  if (state.usedCells.has(idx)) return;
  state.pointerId = e.pointerId;
  state.path = [idx];
  buzz();
  updateSelection();
  renderTrace();
  renderPendingWord();
}

/** @param {FederatedPointerEvent} e */
function onPointerMove(e) {
  if (state.pointerId === null || e.pointerId !== state.pointerId || state.won)
    return;
  // Bouton souris relâché sans pointerup délivré (relâchement pendant une
  // perte de focus) : on annule le tracé au lieu de l'étendre au survol.
  if (e.pointerType === "mouse" && e.buttons === 0) {
    state.pointerId = null;
    clearPath();
    return;
  }
  // Case sous le pointeur (hit-test monde + tolérance rayon dans scene.js).
  const idx = cellAtGlobal(e.global);
  if (idx === null) return;
  if (state.usedCells.has(idx)) return; // case consommée par un mot trouvé
  const last = state.path[state.path.length - 1];
  if (idx === last) return;

  // Retour sur l'avant-dernière case : backtrack.
  if (state.path.length >= 2 && idx === state.path[state.path.length - 2]) {
    state.path.pop();
  } else if (!state.path.includes(idx) && isOrthAdjacent(last, idx)) {
    state.path.push(idx);
    buzz();
  } else {
    return;
  }
  updateSelection();
  renderTrace();
  renderPendingWord();
}

/** @param {FederatedPointerEvent} e */
function onPointerUp(e) {
  if (e.pointerId !== state.pointerId) return;
  state.pointerId = null;
  if (state.won) return;
  onCommit();
}

/** @param {FederatedPointerEvent} e */
function onPointerCancel(e) {
  if (e.pointerId !== state.pointerId) return;
  state.pointerId = null;
  clearPath();
}

/**
 * @param {{ onCommit: () => void, onReplay: () => void }} handlers
 */
export function attachInputHandlers(handlers) {
  onCommit = handlers.onCommit;
  const stage = getStage();
  stage.on("pointerdown", onPointerDown);
  // globalpointermove : suit le pointeur sur tout l'écran, y compris hors de
  // toute case (le hit-test filtre), sans capture implicite à gérer.
  stage.on("globalpointermove", onPointerMove);
  stage.on("pointerup", onPointerUp);
  // Relâchement hors hitArea (bord de fenêtre) : traité comme un pointerup.
  stage.on("pointerupoutside", onPointerUp);
  stage.on("pointercancel", onPointerCancel);
  // Perte de focus en plein tracé : aucun pointerup ne sera délivré,
  // on annule le tracé pour ne pas le laisser armé au retour.
  window.addEventListener("blur", () => {
    if (state.pointerId !== null) {
      state.pointerId = null;
      clearPath();
    }
  });
  replayEl.addEventListener("click", handlers.onReplay);
}
