// @ts-check
// Scène Pixi : rendu plein écran de la grille (fonds de cases + lettres),
// tracé actif et tracés fantômes. Le chrome (registre, chrono, difficulté,
// victoire) reste piloté par render.js. La caméra (zoom molette/boutons,
// cadrage) vit dans camera.js. L'arbitrage des gestes vit dans input.js, qui
// s'appuie sur cellAtGlobal / getStage exposés ici.

import { Application, Container, Graphics, Text } from "pixi.js";
import {
  CELL_COUNT,
  CELL_GAP,
  CELL_SIZE,
  CARD,
  GHOST,
  GRID_SIZE,
  INK,
  LINE,
  PAPER,
  VERMILION,
  ZOOM_MAX_CELLS,
  ZOOM_STEP,
} from "./config.js";
import { Camera } from "./camera.js";
import { state } from "./state.js";

// Grille carrée dérivée de la config, sans hypothèse « 5 » en dur.
const rows = GRID_SIZE;
const cols = CELL_COUNT / GRID_SIZE;
const pitch = CELL_SIZE + CELL_GAP;
const CELL_RADIUS = 8;
const CELL_STROKE = 3; // unités monde
const FONT_SIZE = 42; // ≈ rapport lettre/case du DOM
const TRACE_WIDTH = 10; // largeur du trait, en unités monde (épaissit au zoom)

/** @type {Application} */
let app;
/** @type {Container} Repère monde (transform caméra). */
let world;
/** @type {Camera} Modèle caméra appliqué à world. */
let camera;
/** @type {Container} */
let cellsLayer;
/** @type {Container} */
let traceLayer;
/** @type {Container} */
let lettersLayer;
/** @type {Graphics} Tracés fantômes des mots trouvés (sous le tracé actif). */
let ghostTrace;
/** @type {Graphics} Tracé en cours. */
let activeTrace;
/** @type {Graphics[]} Fonds de cases, dans l'ordre des indices. */
const cellBgs = [];
/** @type {Text[]} Lettres des cases, dans l'ordre des indices. */
const cellTexts = [];

/**
 * Coin haut-gauche (monde) d'une case selon son indice.
 * @param {number} i
 */
function cellOrigin(i) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: col * pitch, y: row * pitch };
}

/**
 * Centre (monde) d'une case selon son indice.
 * @param {number} i
 */
function cellCenter(i) {
  const o = cellOrigin(i);
  return { x: o.x + CELL_SIZE / 2, y: o.y + CELL_SIZE / 2 };
}

// État visuel d'une case : disabled (mot trouvé) > head (dernière du tracé) >
// sel (dans le tracé) > normal. Les cases consommées sont inertes, jamais
// dans le tracé.
/** @param {number} i */
function cellState(i) {
  if (state.usedCells.has(i)) return "disabled";
  const path = state.path;
  if (path.length && i === path[path.length - 1]) return "head";
  if (path.includes(i)) return "sel";
  return "normal";
}

// Peint fond + lettre d'une case selon son état (couleurs de config.js).
/** @param {number} i */
function paintCell(i) {
  let fill, stroke, textFill;
  switch (cellState(i)) {
    case "head":
      fill = VERMILION;
      stroke = VERMILION;
      textFill = PAPER;
      break;
    case "sel":
      fill = INK;
      stroke = INK;
      textFill = PAPER;
      break;
    case "disabled":
      fill = PAPER;
      stroke = LINE;
      textFill = GHOST;
      break;
    default:
      fill = CARD;
      stroke = INK;
      textFill = INK;
  }
  const g = cellBgs[i];
  g.clear();
  g.roundRect(0, 0, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
    .fill(fill)
    .stroke({ width: CELL_STROKE, color: stroke, alignment: 0.5 });
  cellTexts[i].style.fill = textFill;
}

// Repeint toutes les cases (25 petits roundRect : bon marché, appelé aux
// changements de tracé et de cases consommées).
function repaintCells() {
  for (let i = 0; i < CELL_COUNT; i++) paintCell(i);
}

// Résolution de texture des lettres : couvre le zoom maximal pour rester
// nette sans flou (un Text Pixi est une texture agrandie au zoom).
function letterResolution() {
  const dpr = window.devicePixelRatio || 1;
  const maxScale =
    Math.min(app.screen.width, app.screen.height) / (ZOOM_MAX_CELLS * pitch);
  return Math.min(8, Math.max(2, maxScale * dpr));
}

// Construit les CELL_COUNT cases (fond + lettre vide) une fois pour toutes.
// Les lettres sont peuplées par renderSceneGrid.
function buildGrid() {
  const resolution = letterResolution();
  for (let i = 0; i < CELL_COUNT; i++) {
    const { x, y } = cellOrigin(i);

    const bg = new Graphics();
    bg.position.set(x, y);
    cellsLayer.addChild(bg);
    cellBgs.push(bg);

    const text = new Text({
      text: "",
      style: {
        fontFamily: "Source Serif 4",
        fontWeight: "700",
        fontSize: FONT_SIZE,
        fill: INK,
        align: "center",
      },
    });
    text.style.resolution = resolution;
    text.anchor.set(0.5);
    text.position.set(x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    lettersLayer.addChild(text);
    cellTexts.push(text);

    paintCell(i);
  }
}

// --- Tracé (espace monde) --------------------------------------------------

// Trace la polyligne d'un chemin sur un Graphics (largeur/couleur donnés).
/**
 * @param {Graphics} g
 * @param {number[]} path
 * @param {number} color
 */
function strokePath(g, path, color) {
  if (path.length < 2) return;
  const p0 = cellCenter(path[0]);
  g.moveTo(p0.x, p0.y);
  for (let k = 1; k < path.length; k++) {
    const p = cellCenter(path[k]);
    g.lineTo(p.x, p.y);
  }
  g.stroke({ width: TRACE_WIDTH, color, cap: "round", join: "round" });
}

// Redessine le tracé en cours (ligne d'encre continue).
export function renderTrace() {
  activeTrace.clear();
  strokePath(activeTrace, state.path, INK);
}

// Tracés fantômes : les traits des mots validés restent affichés, dans les
// tons des cases désactivées, pour relire les mots sur la grille.
export function renderFoundTraces() {
  ghostTrace.clear();
  for (const path of state.foundPaths) strokePath(ghostTrace, path, GHOST);
}

// Repeint les cases selon la sélection courante (tint sel/head).
export function updateSelection() {
  repaintCells();
}

// Repeint les cases consommées par les mots trouvés (état disabled).
export function renderUsedCells() {
  repaintCells();
}

// --- Hit-test / accès stage (pour input.js) --------------------------------

// Case sous un point écran (Point global d'un event fédéré), ou null.
// Conversion écran→monde via world.toLocal, puis tolérance rayon CELL_SIZE/2
// autour du centre de la case la plus proche (reprise de la logique DOM).
/**
 * @param {import("pixi.js").PointData} global
 * @returns {number|null}
 */
export function cellAtGlobal(global) {
  if (!world) return null;
  const p = world.toLocal(global);
  const col = Math.round((p.x - CELL_SIZE / 2) / pitch);
  const row = Math.round((p.y - CELL_SIZE / 2) / pitch);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const cx = col * pitch + CELL_SIZE / 2;
  const cy = row * pitch + CELL_SIZE / 2;
  if (Math.hypot(p.x - cx, p.y - cy) > CELL_SIZE / 2) return null;
  return row * cols + col;
}

// Stage Pixi : cible des events fédérés du tracé (configuré dans initScene).
/** @returns {import("pixi.js").Container} */
export function getStage() {
  return app.stage;
}

// Molette → zoom centré sur le pointeur. Facteur exponentiel (doublement
// tous les ~500 px) pour un zoom lisse ; la caméra borne fit/max.
/** @param {WheelEvent} e */
function onWheel(e) {
  if (!camera) return;
  e.preventDefault();
  const rect = app.canvas.getBoundingClientRect();
  const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  camera.zoomAt(pointer, Math.pow(2, -e.deltaY / 500));
}

// Boutons flottants + / − / tout voir : câblés sur zoomAt(centre, ±ZOOM_STEP)
// et fit(). Style « chip » (mono, bordure INK) défini dans style.css.
function buildZoomControls() {
  const bar = document.createElement("div");
  bar.className = "zoom-controls";

  /**
   * @param {string} label
   * @param {string} title
   * @param {() => void} onClick
   */
  const addButton = (label, title, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zoom-btn";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", onClick);
    bar.appendChild(btn);
  };

  addButton("+", "Zoomer", () => camera.zoomAt(camera.screenCenter(), ZOOM_STEP));
  addButton("−", "Dézoomer", () =>
    camera.zoomAt(camera.screenCenter(), 1 / ZOOM_STEP),
  );
  addButton("⤢", "Tout voir", () => camera.fit());
  document.body.appendChild(bar);
}

/**
 * Initialise l'application Pixi et le graphe de scène. À appeler (await) avant
 * toute partie. Attend les polices pour éviter des lettres en fallback.
 */
export async function initScene() {
  app = new Application();
  await app.init({
    resizeTo: window,
    background: PAPER,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  // Canvas en fond plein écran, sous le chrome DOM. touch-action: none pour
  // que le tracé tactile ne déclenche pas scroll/zoom du navigateur.
  const canvas = app.canvas;
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "0";
  canvas.style.touchAction = "none";
  document.body.appendChild(canvas);

  world = new Container();
  cellsLayer = new Container();
  traceLayer = new Container();
  lettersLayer = new Container();
  // Lettres au-dessus du trait pour rester lisibles.
  world.addChild(cellsLayer, traceLayer, lettersLayer);
  app.stage.addChild(world);

  // Fantômes sous le tracé actif, tous deux dans traceLayer.
  ghostTrace = new Graphics();
  activeTrace = new Graphics();
  traceLayer.addChild(ghostTrace, activeTrace);

  // Le stage reçoit les events fédérés (tracé) sur tout l'écran.
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // Polices prêtes avant de créer les Text (sinon fallback figé en texture).
  try {
    await document.fonts.load('700 42px "Source Serif 4"');
    await document.fonts.ready;
  } catch (_) {
    /* API Font indisponible : on construit quand même */
  }

  buildGrid();

  // Caméra : cadrage initial « fit », recadrage au resize.
  camera = new Camera(app, world, { rows, cols });
  app.renderer.on("resize", () => camera.resize());

  // Zoom molette (vers le pointeur) + boutons flottants.
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  buildZoomControls();
}

// Réaffiche la grille pour la partie courante : pose les lettres, remet les
// cases à l'état normal, efface le tracé et les fantômes, recadre.
export function renderSceneGrid() {
  if (!app) return;
  for (let i = 0; i < CELL_COUNT; i++) {
    cellTexts[i].text = state.letters[i] ?? "";
  }
  repaintCells();
  renderTrace(); // state.path vide → efface le tracé actif
  renderFoundTraces(); // state.foundPaths vide → efface les fantômes
  // Nouvelle partie : on revient au cadrage « tout voir ».
  if (camera) camera.fit();
}
