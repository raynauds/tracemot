// @ts-check
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
// Le zoom molette et les boutons +/− vivent dans scene.js (Phase 2), intacts.
// Flèches et ZQSD/WASD → pan clavier via une boucle app.ticker.
// Auto-pan : en mode "trace", approcher un bord du viewport translate la
// caméra (boucle app.ticker) pour continuer le mot hors de la vue courante.

import {
  EDGE_PAN_MARGIN,
  EDGE_PAN_MAX_SPEED,
  GRID_SIZE,
  KEY_PAN_SPEED,
} from "./config.js";
import { state } from "./state.js";
import { buzz, renderPendingWord, replayEl } from "./render.js";
import {
  cellAtGlobal,
  getApp,
  getCamera,
  getStage,
  renderTrace,
  updateSelection,
} from "./scene.js";

/** @typedef {import("pixi.js").FederatedPointerEvent} FederatedPointerEvent */
/** @typedef {{ x: number, y: number }} Vec2 */

/** @type {() => void} */
let onCommit = () => {};

// --- État d'arbitrage ------------------------------------------------------

/** Pointeurs actifs (au plus deux suivis), avec leur dernière position écran.
 * @type {Map<number, Vec2>} */
const pointers = new Map();
/** @type {"trace"|"pan"|"pinch"|null} */
let mode = null;

// Pan : pointeur porteur + dernière position écran.
/** @type {number|null} */
let panPointerId = null;
let panLast = { x: 0, y: 0 };

// Pinch : les deux pointeurs et l'état caméra figé au début du geste.
/** @type {number|null} */
let pinchA = null;
/** @type {number|null} */
let pinchB = null;
let pinchDist0 = 1;
let pinchMid0 = { x: 0, y: 0 };
let pinchScale0 = 1;
let pinchCam0 = { x: 0, y: 0 };

// --- Tracé (repris de l'ancien input.js) -----------------------------------

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

// Dernière position écran du pointeur de tracé (event ou auto-pan), lue par la
// boucle d'auto-pan pour tester la proximité des bords et réévaluer la case.
let traceScreen = { x: 0, y: 0 };

// Démarre un tracé sur la case idx avec le pointeur courant.
/**
 * @param {FederatedPointerEvent} e
 * @param {number} idx
 */
function beginTrace(e, idx) {
  mode = "trace";
  state.pointerId = e.pointerId;
  state.path = [idx];
  traceScreen = { x: e.global.x, y: e.global.y };
  buzz();
  updateSelection();
  renderTrace();
  renderPendingWord();
}

// Étend le tracé vers la case idx selon les règles (adjacence orthogonale,
// backtrack, cases consommées inertes). Source unique partagée par le déplacement
// du pointeur (traceMove) et la réévaluation post auto-pan. Retourne true si le
// tracé a changé.
/** @param {number|null} idx */
function extendTraceTo(idx) {
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
/** @param {FederatedPointerEvent} e */
function traceMove(e) {
  if (e.pointerId !== state.pointerId || state.won) return;
  // Bouton souris relâché sans pointerup délivré (perte de focus) : on annule
  // le tracé au lieu de l'étendre au survol.
  if (e.pointerType === "mouse" && e.buttons === 0) {
    endGesture();
    clearPath();
    return;
  }
  traceScreen = { x: e.global.x, y: e.global.y };
  extendTraceTo(cellAtGlobal(e.global));
}

// --- Pan -------------------------------------------------------------------

/**
 * @param {number} pointerId
 * @param {Vec2} pos
 */
function beginPan(pointerId, pos) {
  mode = "pan";
  panPointerId = pointerId;
  panLast = { x: pos.x, y: pos.y };
}

/**
 * @param {FederatedPointerEvent} e
 * @param {Vec2} pos
 */
function panMove(e, pos) {
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

// Réinitialise tout arbitrage (pointerup manqué, perte de focus).
function cancelAllGestures() {
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

/** @param {FederatedPointerEvent} e */
function onPointerDown(e) {
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

/** @param {FederatedPointerEvent} e */
function onPointerMove(e) {
  // Pointeur non suivi (survol souris sans bouton, 3e doigt) : ignoré.
  if (!pointers.has(e.pointerId)) return;
  const pos = { x: e.global.x, y: e.global.y };
  pointers.set(e.pointerId, pos);

  if (mode === "trace") traceMove(e);
  else if (mode === "pan") panMove(e, pos);
  else if (mode === "pinch") pinchMove();
}

// Fin d'un pointeur (up, upoutside, cancel). commit = valider un tracé abouti.
/**
 * @param {FederatedPointerEvent} e
 * @param {boolean} commit
 */
function onPointerEnd(e, commit) {
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
/** @type {Record<string, "up"|"down"|"left"|"right">} */
const KEY_DIRS = {
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
/** @type {Set<"up"|"down"|"left"|"right">} */
const pressed = new Set();

// Ne pas capturer les flèches/lettres quand l'utilisateur saisit du texte.
/** @param {EventTarget|null} target */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** @param {KeyboardEvent} e */
function onKeyDown(e) {
  const dir = KEY_DIRS[e.key.toLowerCase()];
  if (!dir || isTypingTarget(e.target)) return;
  e.preventDefault();
  pressed.add(dir);
}

/** @param {KeyboardEvent} e */
function onKeyUp(e) {
  const dir = KEY_DIRS[e.key.toLowerCase()];
  if (dir) pressed.delete(dir);
}

// Boucle Ticker : translate la caméra tant qu'une touche de pan est enfoncée.
// La direction suit la vue (flèche droite → on découvre la droite de la grille).
/** @param {import("pixi.js").Ticker} ticker */
function keyPan(ticker) {
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

// --- Auto-pan au bord (pendant le tracé) -----------------------------------

// Vitesse d'auto-pan sur un axe selon la position écran du pointeur : nulle
// hors de la bande EDGE_PAN_MARGIN, sinon ∝ pénétration (plafonnée à 1). Signe
// choisi pour révéler le contenu vers lequel le pointeur tend (près du bord
// droit → caméra vers la gauche).
/**
 * @param {number} pos   position écran sur l'axe (px)
 * @param {number} size  taille écran de l'axe (px)
 * @returns {number} facteur dans [-1, 1]
 */
function edgeVelocity(pos, size) {
  if (pos < EDGE_PAN_MARGIN) {
    return Math.min(1, (EDGE_PAN_MARGIN - pos) / EDGE_PAN_MARGIN);
  }
  if (pos > size - EDGE_PAN_MARGIN) {
    return -Math.min(1, (pos - (size - EDGE_PAN_MARGIN)) / EDGE_PAN_MARGIN);
  }
  return 0;
}

// Boucle Ticker : active uniquement en mode "trace". Si le pointeur est dans la
// bande de bord, translate la caméra (px/s, indépendant du framerate via
// deltaMS), puis réévalue la case sous le pointeur pour continuer le mot hors de
// la vue courante. Le clamp caméra arrête l'auto-pan aux limites de la grille.
/** @param {import("pixi.js").Ticker} ticker */
function edgePan(ticker) {
  if (mode !== "trace") return;
  const { width, height } = getApp().screen;
  const vx = edgeVelocity(traceScreen.x, width);
  const vy = edgeVelocity(traceScreen.y, height);
  if (vx === 0 && vy === 0) return;

  const dt = ticker.deltaMS / 1000;
  const cam = getCamera();
  const x0 = cam.x;
  const y0 = cam.y;
  cam.set(
    cam.scale,
    cam.x + vx * EDGE_PAN_MAX_SPEED * dt,
    cam.y + vy * EDGE_PAN_MAX_SPEED * dt,
  );
  // Caméra bloquée par le clamp (bord de grille atteint) : rien de neuf à voir.
  if (cam.x === x0 && cam.y === y0) return;
  // La vue a bougé sous un pointeur immobile : réévalue la case pour étendre.
  extendTraceTo(cellAtGlobal(traceScreen));
}

// --- Câblage ---------------------------------------------------------------

/**
 * @param {{ onCommit: () => void, onReplay: () => void }} handlers
 */
export function attachInputHandlers(handlers) {
  onCommit = handlers.onCommit;
  const stage = getStage();
  const app = getApp();

  stage.on("pointerdown", onPointerDown);
  // globalpointermove : suit le pointeur sur tout l'écran, y compris hors de
  // toute case (le hit-test filtre), sans capture implicite à gérer.
  stage.on("globalpointermove", onPointerMove);
  stage.on("pointerup", (e) => onPointerEnd(e, true));
  // Relâchement hors hitArea (bord de fenêtre) : traité comme un pointerup.
  stage.on("pointerupoutside", (e) => onPointerEnd(e, true));
  stage.on("pointercancel", (e) => onPointerEnd(e, false));

  // Neutralise le menu contextuel et le drag natif du canvas (clic droit,
  // glisser d'image) qui parasiteraient pan et tracé.
  const canvas = app.canvas;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("dragstart", (e) => e.preventDefault());

  // Pan clavier.
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  app.ticker.add(keyPan);

  // Auto-pan au bord pendant le tracé (inerte hors du mode "trace").
  app.ticker.add(edgePan);

  // Perte de focus : annule un geste armé et vide les touches enfoncées, pour
  // ne rien laisser actif au retour.
  window.addEventListener("blur", () => {
    cancelAllGestures();
    pressed.clear();
  });

  replayEl.addEventListener("click", handlers.onReplay);
}
