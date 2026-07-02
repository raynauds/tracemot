// @ts-check
// Pointer Events (souris + tactile) : construction du tracé sur la grille.
// Ne modifie que state.path et state.pointerId ; la validation du mot est
// déléguée au handler onCommit fourni par main.js.

import { GRID_SIZE } from "./config.js";
import { state } from "./state.js";
import {
  buzz,
  gridEl,
  renderPendingWord,
  replayEl,
  updateSelection,
  updateTrace,
} from "./render.js";

/** @type {() => void} */
let onCommit = () => {};

export function clearPath() {
  state.path = [];
  updateSelection();
  updateTrace();
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

// Case de la grille contenant l'élément donné, ou null.
/**
 * @param {EventTarget|Element|null} el
 * @returns {HTMLElement|null}
 */
function cellFrom(el) {
  if (!(el instanceof Element)) return null;
  const cell = el.closest(".cell");
  return cell instanceof HTMLElement ? cell : null;
}

/** @param {PointerEvent} e */
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
  const cell = cellFrom(e.target);
  if (!cell) return;
  // Case déjà consommée par un mot trouvé (mode pavage) : hors jeu.
  if (state.usedCells.has(Number(cell.dataset.index))) return;
  e.preventDefault();
  // Neutralise la capture implicite du pointeur (tactile), sinon les
  // pointermove resteraient rattachés à cette case.
  try {
    cell.releasePointerCapture(e.pointerId);
  } catch (_) {
    /* pas de capture active */
  }
  state.pointerId = e.pointerId;
  state.path = [Number(cell.dataset.index)];
  buzz();
  updateSelection();
  updateTrace();
  renderPendingWord();
}

/** @param {PointerEvent} e */
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
  // Suivi du doigt : elementFromPoint plutôt que les events des autres
  // cases (le pointerdown tactile capture implicitement la case d'origine).
  const cell = cellFrom(document.elementFromPoint(e.clientX, e.clientY));
  if (!cell) return;
  const idx = Number(cell.dataset.index);
  if (state.usedCells.has(idx)) return; // case consommée (mode pavage)
  const last = state.path[state.path.length - 1];
  if (idx === last) return;

  // Zone de tolérance : le pointeur doit être proche du centre de la case.
  const rect = cell.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) > rect.width / 2) return;

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
  updateTrace();
  renderPendingWord();
}

/** @param {PointerEvent} e */
function onPointerUp(e) {
  if (e.pointerId !== state.pointerId) return;
  state.pointerId = null;
  if (state.won) return;
  onCommit();
}

/** @param {PointerEvent} e */
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
  gridEl.addEventListener("pointerdown", onPointerDown);
  // Filet de sécurité : certains navigateurs posent la capture implicite
  // après le pointerdown - on la relâche dès qu'elle apparaît.
  gridEl.addEventListener("gotpointercapture", (e) => {
    if (e.target instanceof Element) e.target.releasePointerCapture(e.pointerId);
  });
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
  gridEl.addEventListener("contextmenu", (e) => e.preventDefault());
  gridEl.addEventListener("dragstart", (e) => e.preventDefault());
  window.addEventListener("resize", updateTrace);
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
