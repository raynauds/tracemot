// @ts-check
// Scène Pixi : rendu plein écran de la grille (fonds de cases + lettres).
// Le chrome (registre, chrono, difficulté, victoire) reste piloté par
// render.js. Le tracé et la caméra interactive arrivent en phases suivantes ;
// ici la caméra est en « fit » fixe.

import { Application, Container, Graphics, Text } from "pixi.js";
import {
  CELL_COUNT,
  CELL_GAP,
  CELL_SIZE,
  CARD,
  FIT_PADDING,
  GRID_SIZE,
  INK,
  PAPER,
  ZOOM_MAX_CELLS,
} from "./config.js";
import { state } from "./state.js";

// Grille carrée dérivée de la config, sans hypothèse « 5 » en dur.
const rows = GRID_SIZE;
const cols = CELL_COUNT / GRID_SIZE;
const pitch = CELL_SIZE + CELL_GAP;
const gridW = cols * CELL_SIZE + (cols - 1) * CELL_GAP;
const gridH = rows * CELL_SIZE + (rows - 1) * CELL_GAP;
const CELL_RADIUS = 8;
const CELL_STROKE = 3; // unités monde
const FONT_SIZE = 42; // ≈ rapport lettre/case du DOM

/** @type {Application} */
let app;
/** @type {Container} Repère monde (transform caméra). */
let world;
/** @type {Container} */
let cellsLayer;
/** @type {Container} */
let traceLayer;
/** @type {Container} */
let lettersLayer;
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

/** Fond normal d'une case (états sel/head/disabled arrivent en phase 3). */
function drawCell(/** @type {Graphics} */ g) {
  g.clear();
  g.roundRect(0, 0, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
    .fill(CARD)
    .stroke({ width: CELL_STROKE, color: INK, alignment: 0.5 });
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
    drawCell(bg);
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
  }
}

// Cadrage « fit » : la grille entière tient à l'écran, centrée. C'est aussi
// le scale minimum de la future caméra interactive.
function fit() {
  if (!app) return;
  const sw = app.screen.width;
  const sh = app.screen.height;
  const scale = Math.min(sw / gridW, sh / gridH) * FIT_PADDING;
  world.scale.set(scale);
  world.position.set((sw - gridW * scale) / 2, (sh - gridH * scale) / 2);
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

  // Canvas en fond plein écran, sous le chrome DOM.
  const canvas = app.canvas;
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "0";
  document.body.appendChild(canvas);

  world = new Container();
  cellsLayer = new Container();
  traceLayer = new Container();
  lettersLayer = new Container();
  // Lettres au-dessus du trait pour rester lisibles.
  world.addChild(cellsLayer, traceLayer, lettersLayer);
  app.stage.addChild(world);

  // Polices prêtes avant de créer les Text (sinon fallback figé en texture).
  try {
    await document.fonts.load('700 42px "Source Serif 4"');
    await document.fonts.ready;
  } catch (_) {
    /* API Font indisponible : on construit quand même */
  }

  buildGrid();
  fit();
  app.renderer.on("resize", fit);
}

// Réaffiche la grille pour la partie courante : pose les lettres, remet les
// fonds à l'état normal, recadre. Le tracé (fantômes, sélection) viendra en
// phase 3.
export function renderSceneGrid() {
  if (!app) return;
  for (let i = 0; i < CELL_COUNT; i++) {
    cellTexts[i].text = state.letters[i] ?? "";
    cellTexts[i].style.fill = INK;
    drawCell(cellBgs[i]);
  }
  fit();
}
