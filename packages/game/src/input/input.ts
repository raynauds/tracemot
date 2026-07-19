// Arbitrage des gestes sur la grille Pixi. Machine à états sur les pointeurs
// actifs (Map<pointerId>), events fédérés sur app.stage + clavier sur window.
//
// Modes exclusifs :
//   - "trace" : 1er pointeur, bouton principal, parti d'une case libre
//               (extension en ligne droite avec rattrapage des cases sautées,
//               backtrack, cases inertes, filets de sécurité).
//   - "pan"   : pointeur parti hors case, ou bouton du milieu → translation
//               caméra par delta écran.
//   - "pinch" : 2e pointeur posé → abandonne un tracé en cours, puis
//               scale *= dist/dist0 autour du milieu des deux doigts, plus
//               pan par delta du milieu.
// Le zoom molette et les boutons +/− vivent dans scene.ts (Phase 2), intacts.
// Flèches et ZQSD/WASD → pan clavier via une boucle app.ticker.
// Pendant un tracé, la caméra ne bouge pas : la vue reste figée sous le geste.

import { playSound } from "../audio/audio.ts";
import { KEY_PAN_SPEED } from "../game/config.ts";
import {
  cancelTracePublish,
  flushEmptyTrace,
  local,
  publishTrace,
  usedCells,
} from "../client/local-state.ts";
import { buzz, renderPendingWord } from "../render/render.ts";
import {
  cellAtGlobal,
  getApp,
  getCamera,
  getStage,
  popCell,
  renderTrace,
  setHoverCell,
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

// Garde-fou pinch pendant un tracé actif : un 2e doigt posé (paume, doigt qui
// tient le téléphone) n'escalade en pinch qu'après un mouvement franc des
// DEUX doigts depuis leur position de pose — sinon le tracé continue et ce
// doigt superflu est simplement ignoré (voir checkPinchEscalation).
const PINCH_ESCALATE_PX = 12;
let pinchPending = false;
let pinchStart: Map<number, Vec2> | null = null;

// --- Tracé (repris de l'ancien input.ts) -----------------------------------

// Tick sonore de la case en tête du tracé : la hauteur suit sa position dans
// le mot (un demi-ton par lettre, plafonnée à la 10e sélection). Le backtrack
// rejoue la hauteur de la case sur laquelle on retombe — la même que lors de
// son ajout — donc la descente est le miroir exact de la montée.
function traceTick() {
  const step = Math.min(local.path.length - 1, 9);
  playSound("trace-letter", { rate: 2 ** (step / 12) });
}

// Remet le tracé local à zéro. `publish` (défaut true) efface aussitôt le
// tracé publié chez les autres (doigt levé sans soumission, doc 05) ; le seul
// cas où on veut `false` est un commit ACCEPTÉ (client.ts § commitWord) —
// `submitWord` vide déjà `traces[playerId]` côté logic, republier un
// effacement en plus n'apporterait rien (doc 05 § « pas d'action
// d'effacement supplémentaire dans le cas nominal »).
export function clearPath(publish: boolean = true) {
  local.path = [];
  updateSelection();
  renderTrace();
  renderPendingWord();
  // Le tracé finit d'une façon ou d'une autre : un envoi trailing programmé
  // ne doit jamais survivre à la remise à zéro locale, sans quoi il
  // republierait un contenu périmé après coup (doc 05).
  if (publish) flushEmptyTrace();
  else cancelTracePublish();
}

// Cases traversées en ligne droite de `from` (exclu) vers `to` (inclus), ou
// null si les deux cases ne partagent ni ligne ni colonne. Deux cases
// adjacentes donnent un segment d'une seule case : le cas courant est juste le
// plus court des sauts.
function straightSegment(from: number, to: number): number[] | null {
  const { cols } = local.geometry;
  let step: number;
  if (Math.floor(from / cols) === Math.floor(to / cols))
    step = to > from ? 1 : -1;
  else if (from % cols === to % cols) step = to > from ? cols : -cols;
  else return null; // diagonale ou quelconque : pas de chemin évident
  const out: number[] = [];
  for (let i = from + step; ; i += step) {
    out.push(i);
    if (i === to) break;
  }
  return out;
}

// Démarre un tracé sur la case idx avec le pointeur courant.
function beginTrace(e: FederatedPointerEvent, idx: number) {
  mode = "trace";
  local.pointerId = e.pointerId;
  local.path = [idx];
  buzz();
  traceTick();
  updateSelection();
  renderTrace();
  renderPendingWord();
  publishTrace(); // no-op tant que le tracé fait moins de 2 lettres (doc 05)
}

// Étend le tracé vers la case idx. Si idx est aligné avec la dernière case du
// tracé (même ligne ou même colonne), tout le segment qui les sépare est
// parcouru dans l'ordre — un doigt qui rate une case au passage la récupère au
// lieu de bloquer le tracé. Tout ou rien : une seule case du segment inerte ou
// déjà tracée annule le saut entier. Le segment qui retrace la fin du tracé à
// l'envers déroule un backtrack, d'une case ou de dix.
// Retourne true si le tracé a changé.
function extendTraceTo(idx: number | null) {
  if (idx === null) return false;
  const last = local.path[local.path.length - 1];
  if (idx === last) return false;

  const seg = straightSegment(last, idx);
  if (!seg) return false;

  const isBacktrack =
    local.path.length > seg.length &&
    seg.every((c, k) => c === local.path[local.path.length - 2 - k]);
  // Calculée une fois pour tout le segment, pas case par case : elle est
  // dérivée (cf. client/local-state.ts), plus stockée à part.
  const used = usedCells();
  if (isBacktrack) {
    // Miroir de l'avancée (buzz + petite animation de case) : seule la case
    // qui quitte réellement le tracé (l'ancienne tête) est animée, comme
    // l'avancée n'anime que la case qui le rejoint (updateSelection).
    const releasedHead = local.path[local.path.length - 1];
    local.path.length -= seg.length;
    buzz();
    traceTick();
    popCell(releasedHead);
  } else if (seg.every((c) => !used.has(c) && !local.path.includes(c))) {
    for (const c of seg) {
      local.path.push(c);
      buzz();
      traceTick();
    }
  } else {
    return false;
  }
  updateSelection();
  renderTrace();
  renderPendingWord();
  publishTrace(); // case accrochée ou retirée : changement de CONTENU (doc 05)
  return true;
}

// Étend le tracé selon la case sous le pointeur (règles inchangées).
function traceMove(e: FederatedPointerEvent) {
  if (e.pointerId !== local.pointerId || local.won) return;
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
    local.pointerId = null;
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

// Pinch en attente (2e doigt posé pendant un tracé actif) : bascule
// effectivement en pinch une fois que les DEUX doigts ont chacun parcouru
// PINCH_ESCALATE_PX depuis leur position de pose. Tant que ce n'est pas le
// cas, rien ne change : le tracé continue au premier doigt (traceMove ignore
// déjà tout pointeur qui n'est pas local.pointerId).
function checkPinchEscalation() {
  if (!pinchPending || !pinchStart) return;
  for (const [id, start] of pinchStart) {
    const cur = pointers.get(id);
    const dist = cur ? Math.hypot(cur.x - start.x, cur.y - start.y) : 0;
    if (dist < PINCH_ESCALATE_PX) return; // au moins un doigt n'a pas assez bougé
  }
  pinchPending = false;
  pinchStart = null;
  beginPinch();
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
    local.pointerId = null;
    clearPath();
  }
  mode = null;
  panPointerId = null;
  pinchA = null;
  pinchB = null;
  pinchPending = false;
  pinchStart = null;
  pointers.clear();
  setHoverCell(null);
}

// Termine proprement le mode courant sans toucher au tracé (utilitaire pan).
function endGesture() {
  mode = null;
  panPointerId = null;
  local.pointerId = null;
}

function onPointerDown(e: FederatedPointerEvent) {
  // Down répété pour un pointeur déjà suivi (pointerup manqué) : on repart net.
  if (pointers.has(e.pointerId)) cancelAllGestures();
  // On n'arbitre qu'avec deux pointeurs : les suivants sont ignorés.
  if (pointers.size >= 2) return;

  const pos = { x: e.global.x, y: e.global.y };
  pointers.set(e.pointerId, pos);

  // 2e pointeur posé pendant un tracé actif : pinch seulement PRESSENTI, tant
  // que les deux doigts n'ont pas franchi le seuil (checkPinchEscalation) —
  // sinon prioritaire sur pan comme avant.
  if (pointers.size === 2) {
    if (mode === "trace") {
      pinchPending = true;
      pinchStart = new Map(pointers);
      return;
    }
    beginPinch();
    return;
  }

  // 1er pointeur : bouton du milieu → pan ; sinon on tente le tracé.
  if (e.button !== 1 && local.ready && !local.won) {
    const idx = cellAtGlobal(e.global);
    if (idx !== null && !usedCells().has(idx)) {
      beginTrace(e, idx);
      return;
    }
  }
  // Hors case, bouton du milieu, ou partie non prête → pan.
  beginPan(e.pointerId, pos);
}

function onPointerMove(e: FederatedPointerEvent) {
  // Pointeur non suivi : survol souris sans bouton (avant tout tracé, état
  // visuel discret) si aucun geste n'est armé ; 3e doigt sinon, ignoré.
  if (!pointers.has(e.pointerId)) {
    const canHover =
      e.pointerType === "mouse" && mode === null && local.ready && !local.won;
    if (canHover) setHoverCell(cellAtGlobal(e.global));
    return;
  }
  setHoverCell(null); // un geste est actif : pas de survol simultané
  const pos = { x: e.global.x, y: e.global.y };
  pointers.set(e.pointerId, pos);

  if (pinchPending) checkPinchEscalation();

  if (mode === "trace") traceMove(e);
  else if (mode === "pan") panMove(e, pos);
  else if (mode === "pinch") pinchMove();
}

// Fin d'un pointeur (up, upoutside, cancel). commit = valider un tracé abouti.
function onPointerEnd(e: FederatedPointerEvent, commit: boolean) {
  const wasTrace = mode === "trace" && e.pointerId === local.pointerId;
  pointers.delete(e.pointerId);

  if (pinchPending && pointers.size < 2) {
    // Le doigt traceur ou le doigt surnuméraire s'est levé avant le seuil :
    // le pinch pressenti n'a plus lieu d'être.
    pinchPending = false;
    pinchStart = null;
  }

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
    local.pointerId = null;
    mode = null;
    if (commit) {
      if (!local.won) onCommit();
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

// Hors partie (carte affichée), les flèches appartiennent à la carte, qui
// défile : les capturer ici les lui volerait pour translater une caméra que
// personne ne voit.
function onKeyDown(e: KeyboardEvent) {
  const dir = KEY_DIRS[e.key.toLowerCase()];
  if (!dir || !local.ready || isTypingTarget(e.target)) return;
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

export function attachInputHandlers(handlers: { onCommit: () => void }) {
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
  // La souris quitte le canvas : plus de survol à afficher (aucun
  // globalpointermove ne suivra pour l'effacer de lui-même).
  canvas.addEventListener("pointerleave", () => setHoverCell(null));

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
}
