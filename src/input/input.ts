// Arbitrage des gestes sur la grille Pixi. Machine à états sur les pointeurs
// actifs (Map<pointerId>), events fédérés sur app.stage + clavier sur window.
//
// Modes exclusifs :
//   - "trace" : 1er pointeur, bouton principal, parti d'une case libre
//               (comportement d'origine : adjacence orthogonale, backtrack,
//               cases inertes, filets de sécurité).
//   - "pan"   : pointeur parti hors case, ou bouton du milieu → translation
//               caméra par delta écran.
//   - "pinch" : 2e pointeur posé → abandonne un tracé en cours, puis
//               scale *= dist/dist0 autour du milieu des deux doigts, plus
//               pan par delta du milieu.
// Le zoom molette et les boutons +/− vivent dans scene.ts (Phase 2), intacts.
// Flèches et ZQSD/WASD → pan clavier via une boucle app.ticker.

import { KEY_PAN_SPEED } from "../game/config.ts";
import { state } from "../game/state.ts";
import { buzz, renderPendingWord, replayEl } from "../render/render.ts";
import {
  cellAtGlobal,
  getApp,
  getCamera,
  getStage,
  renderTrace,
  updateSelection,
} from "../render/scene.ts";
import type { FederatedPointerEvent, Ticker } from "pixi.js";

export type Vec2 = { x: number; y: number };

let onCommit: () => void = () => {};

// --- État d'arbitrage ------------------------------------------------------

/** Pointeurs actifs (au plus deux suivis), avec leur dernière position écran. */
const pointers = new Map<number, Vec2>();
let mode: "trace" | "pan" | "pinch" | null = null;

// Pan : pointeur porteur + dernière position écran.
let panPointerId: number | null = null;
let panLast = { x: 0, y: 0 };

// Pinch : les deux pointeurs et l'état caméra figé au début du geste.
let pinchA: number | null = null;
let pinchB: number | null = null;
let pinchDist0 = 1;
let pinchMid0 = { x: 0, y: 0 };
let pinchScale0 = 1;
let pinchCam0 = { x: 0, y: 0 };

// --- Tracé (repris de l'ancien input.ts) -----------------------------------

export function clearPath() {
  state.path = [];
  updateSelection();
  renderTrace();
  renderPendingWord();
}

// Adjacence orthogonale : voisins précalculés de la géométrie du mode.
function isOrthAdjacent(a: number, b: number) {
  return state.geometry.neighbors[a].includes(b);
}

// Démarre un tracé sur la case idx avec le pointeur courant.
function beginTrace(e: FederatedPointerEvent, idx: number) {
  mode = "trace";
  state.pointerId = e.pointerId;
  state.path = [idx];
  buzz();
  updateSelection();
  renderTrace();
  renderPendingWord();
}

// Étend le tracé vers la case idx selon les règles (adjacence orthogonale,
// backtrack, cases consommées inertes).
function extendTraceTo(idx: number | null) {
  if (idx === null) return false;
  if (state.usedCells.has(idx)) return false; // case consommée par un mot trouvé
  const last = state.path[state.path.length - 1];
  if (idx === last) return false;

  // Retour sur l'avant-dernière case : backtrack.
  if (state.path.length >= 2 && idx === state.path[state.path.length - 2]) {
    state.path.pop();
  } else if (!state.path.includes(idx) && isOrthAdjacent(last, idx)) {
    state.path.push(idx);
    buzz();
  } else {
    return false;
  }
  updateSelection();
  renderTrace();
  renderPendingWord();
  return true;
}

// Étend le tracé selon la case sous le pointeur (règles inchangées).
function traceMove(e: FederatedPointerEvent) {
  if (e.pointerId !== state.pointerId || state.won) return;
  // Bouton souris relâché sans pointerup délivré (perte de focus) : on annule
  // le tracé au lieu de l'étendre au survol.
  if (e.pointerType === "mouse" && e.buttons === 0) {
    endGesture();
    clearPath();
    return;
  }
  extendTraceTo(cellAtGlobal(e.global));
}

// --- Pan -------------------------------------------------------------------

function beginPan(pointerId: number, pos: Vec2) {
  mode = "pan";
  panPointerId = pointerId;
  panLast = { x: pos.x, y: pos.y };
}

function panMove(e: FederatedPointerEvent, pos: Vec2) {
  if (e.pointerId !== panPointerId) return;
  if (e.pointerType === "mouse" && e.buttons === 0) {
    mode = null;
    panPointerId = null;
    return;
  }
  const cam = getCamera();
  cam.set(cam.scale, cam.x + (pos.x - panLast.x), cam.y + (pos.y - panLast.y));
  panLast = { x: pos.x, y: pos.y };
}

// --- Pinch -----------------------------------------------------------------

// Bascule en pinch : abandonne un tracé en cours, fige l'état caméra de départ
// et la géométrie initiale des deux doigts.
function beginPinch() {
  if (mode === "trace") {
    state.pointerId = null;
    clearPath();
  }
  const ids = [...pointers.keys()];
  pinchA = ids[0];
  pinchB = ids[1];
  const a = pointers.get(pinchA);
  const b = pointers.get(pinchB);
  if (!a || !b) return;
  pinchDist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  pinchMid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cam = getCamera();
  pinchScale0 = cam.scale;
  pinchCam0 = { x: cam.x, y: cam.y };
  mode = "pinch";
}

// scale *= dist/dist0 autour du milieu des doigts, + pan par delta du milieu.
// Recalculé depuis l'état de départ (sans dérive) : le point monde sous le
// milieu initial est ramené sous le milieu courant à la nouvelle échelle.
function pinchMove() {
  const a = pinchA !== null ? pointers.get(pinchA) : undefined;
  const b = pinchB !== null ? pointers.get(pinchB) : undefined;
  if (!a || !b) return;
  const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const scale = pinchScale0 * (dist / pinchDist0);
  // Point monde sous le milieu initial (état caméra figé au début du geste).
  const wx = (pinchMid0.x - pinchCam0.x) / pinchScale0;
  const wy = (pinchMid0.y - pinchCam0.y) / pinchScale0;
  const cam = getCamera();
  cam.set(scale, mid.x - wx * scale, mid.y - wy * scale);
}

// --- Dispatch pointeurs ----------------------------------------------------

// Réinitialise tout arbitrage (pointerup manqué, perte de focus, changement
// de mode : un geste en vol référencerait les cases de l'ancienne grille).
export function cancelAllGestures() {
  if (mode === "trace") {
    state.pointerId = null;
    clearPath();
  }
  mode = null;
  panPointerId = null;
  pinchA = null;
  pinchB = null;
  pointers.clear();
}

// Termine proprement le mode courant sans toucher au tracé (utilitaire pan).
function endGesture() {
  mode = null;
  panPointerId = null;
  state.pointerId = null;
}

function onPointerDown(e: FederatedPointerEvent) {
  // Down répété pour un pointeur déjà suivi (pointerup manqué) : on repart net.
  if (pointers.has(e.pointerId)) cancelAllGestures();
  // On n'arbitre qu'avec deux pointeurs : les suivants sont ignorés.
  if (pointers.size >= 2) return;

  const pos = { x: e.global.x, y: e.global.y };
  pointers.set(e.pointerId, pos);

  // 2e pointeur posé → pinch (prioritaire sur tout tracé/pan en cours).
  if (pointers.size === 2) {
    beginPinch();
    return;
  }

  // 1er pointeur : bouton du milieu → pan ; sinon on tente le tracé.
  if (e.button !== 1 && state.ready && !state.won) {
    const idx = cellAtGlobal(e.global);
    if (idx !== null && !state.usedCells.has(idx)) {
      beginTrace(e, idx);
      return;
    }
  }
  // Hors case, bouton du milieu, ou partie non prête → pan.
  beginPan(e.pointerId, pos);
}

function onPointerMove(e: FederatedPointerEvent) {
  // Pointeur non suivi (survol souris sans bouton, 3e doigt) : ignoré.
  if (!pointers.has(e.pointerId)) return;
  const pos = { x: e.global.x, y: e.global.y };
  pointers.set(e.pointerId, pos);

  if (mode === "trace") traceMove(e);
  else if (mode === "pan") panMove(e, pos);
  else if (mode === "pinch") pinchMove();
}

// Fin d'un pointeur (up, upoutside, cancel). commit = valider un tracé abouti.
function onPointerEnd(e: FederatedPointerEvent, commit: boolean) {
  const wasTrace = mode === "trace" && e.pointerId === state.pointerId;
  pointers.delete(e.pointerId);

  if (mode === "pinch") {
    // Un doigt levé : le doigt restant reprend la main en pan ; sinon fin.
    if (pointers.size === 1) {
      const [id] = [...pointers.keys()];
      const p = pointers.get(id);
      if (p) beginPan(id, p);
    } else {
      mode = null;
      pinchA = null;
      pinchB = null;
    }
    return;
  }

  if (wasTrace) {
    state.pointerId = null;
    mode = null;
    if (commit) {
      if (!state.won) onCommit();
    } else {
      clearPath();
    }
    return;
  }

  if (mode === "pan" && e.pointerId === panPointerId) {
    mode = null;
    panPointerId = null;
  }
  if (pointers.size === 0) mode = null;
}

// --- Pan clavier (flèches, ZQSD/WASD) --------------------------------------

// Touche → direction de pan. On mappe par lettre (spec ZQSD + WASD explicite).
const KEY_DIRS: Record<string, "up" | "down" | "left" | "right"> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  z: "up",
  w: "up",
  s: "down",
  q: "left",
  a: "left",
  d: "right",
};
const pressed = new Set<"up" | "down" | "left" | "right">();

// Ne pas capturer les flèches/lettres quand l'utilisateur saisit du texte.
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function onKeyDown(e: KeyboardEvent) {
  const dir = KEY_DIRS[e.key.toLowerCase()];
  if (!dir || isTypingTarget(e.target)) return;
  e.preventDefault();
  pressed.add(dir);
}

function onKeyUp(e: KeyboardEvent) {
  const dir = KEY_DIRS[e.key.toLowerCase()];
  if (dir) pressed.delete(dir);
}

// Boucle Ticker : translate la caméra tant qu'une touche de pan est enfoncée.
// La direction suit la vue (flèche droite → on découvre la droite de la grille).
function keyPan(ticker: Ticker) {
  if (pressed.size === 0) return;
  const d = KEY_PAN_SPEED * (ticker.deltaMS / 1000);
  let dx = 0;
  let dy = 0;
  if (pressed.has("left")) dx += d;
  if (pressed.has("right")) dx -= d;
  if (pressed.has("up")) dy += d;
  if (pressed.has("down")) dy -= d;
  if (dx === 0 && dy === 0) return;
  const cam = getCamera();
  cam.set(cam.scale, cam.x + dx, cam.y + dy);
}

// --- Câblage ---------------------------------------------------------------

export function attachInputHandlers(handlers: {
  onCommit: () => void;
  onReplay: () => void;
}) {
  onCommit = handlers.onCommit;
  const stage = getStage();
  const app = getApp();

  stage.on("pointerdown", onPointerDown);
  // globalpointermove : suit le pointeur sur tout l'écran, y compris hors de
  // toute case (le hit-test filtre), sans capture implicite à gérer.
  stage.on("globalpointermove", onPointerMove);
  stage.on("pointerup", (e: FederatedPointerEvent) => onPointerEnd(e, true));
  // Relâchement hors hitArea (bord de fenêtre) : traité comme un pointerup.
  stage.on("pointerupoutside", (e: FederatedPointerEvent) =>
    onPointerEnd(e, true),
  );
  stage.on("pointercancel", (e: FederatedPointerEvent) =>
    onPointerEnd(e, false),
  );

  // Neutralise le menu contextuel et le drag natif du canvas (clic droit,
  // glisser d'image) qui parasiteraient pan et tracé.
  const canvas = app.canvas;
  canvas.addEventListener("contextmenu", (e: Event) => e.preventDefault());
  canvas.addEventListener("dragstart", (e: Event) => e.preventDefault());

  // Pan clavier.
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  app.ticker.add(keyPan);

  // Perte de focus : annule un geste armé et vide les touches enfoncées, pour
  // ne rien laisser actif au retour.
  window.addEventListener("blur", () => {
    cancelAllGestures();
    pressed.clear();
  });

  replayEl.addEventListener("click", handlers.onReplay);
}
