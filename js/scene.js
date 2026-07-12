// @ts-check
// Scène Pixi : rendu plein écran de la grille (fonds de cases + lettres),
// tracé actif et tracés fantômes. Le chrome (registre, chrono, difficulté,
// victoire) reste piloté par render.js. La caméra (zoom molette/boutons,
// cadrage) vit dans camera.js. L'arbitrage des gestes vit dans input.js, qui
// s'appuie sur cellAtGlobal / getStage exposés ici.

import { Application, Container, Graphics, Text } from "pixi.js";
import {
  CELL_GAP,
  CELL_SIZE,
  CARD,
  CARD_HOVER,
  GHOST,
  INK,
  LINE,
  PAPER,
  VERMILION,
  ZOOM_STEP,
} from "./config.js";
import { Camera } from "./camera.js";
import { state } from "./state.js";
import { cancelTweens, easeOutCubic, initTweens, tween } from "./tween.js";

// Géométrie de la grille, tirée du mode actif. Réadoptée au changement de
// mode par rebuildGrid (les fonctions du module la lisent à l'appel).
let rows = 0;
let cols = 0;
let cellCount = 0;
function adoptGeometry() {
  ({ rows, cols, cellCount } = state.geometry);
}

// Constantes de design (proportions), en « unités design ». Elles sont
// multipliées par baseScale (caméra) pour donner les métriques de rendu.
const CELL_RADIUS = 8;
const CELL_STROKE = 3;
const FONT_SIZE = 42; // ≈ rapport lettre/case du DOM
const TRACE_WIDTH = 10; // largeur du trait

// Métriques de rendu = unités design × baseScale. baseScale (caméra) vaut le
// nombre de px natifs par unité design au zoom max : la scène est donc gravée à
// la taille du zoom max, et la caméra ne fait plus que dézoomer (world.scale
// ≤ 1). Conséquence : le texte (une texture) n'est jamais agrandi → jamais
// flou ; les niveaux de zoom inférieurs ne sont que des minifications nettes.
const metrics = {
  base: 1,
  pitch: CELL_SIZE + CELL_GAP,
  cell: CELL_SIZE,
  radius: CELL_RADIUS,
  stroke: CELL_STROKE,
  trace: TRACE_WIDTH,
  font: FONT_SIZE,
};

/** @param {number} base facteur px-natifs / unité design (baseScale caméra) */
function updateMetrics(base) {
  metrics.base = base;
  metrics.pitch = (CELL_SIZE + CELL_GAP) * base;
  metrics.cell = CELL_SIZE * base;
  metrics.radius = CELL_RADIUS * base;
  metrics.stroke = CELL_STROKE * base;
  metrics.trace = TRACE_WIDTH * base;
  metrics.font = FONT_SIZE * base;
}

// --- Réglages d'animation (Pixi-natif : alpha/scale/tint/position) ---------
const DEAL_MS = 300; // distribution : durée d'apparition d'une case
const DEAL_STAGGER = 18; // décalage par indice (cascade), repris du --i CSS
const DEAL_SCALE = 1.18; // échelle de départ d'une case distribuée
const POP_MS = 160; // case rejoignant le tracé : durée du rebond
const POP_AMP = 0.09; // amplitude du rebond (scale 1→1+POP_AMP→1)
const STAMP_MS = 220; // mot validé : durée du tassement des cases
const STAMP_SCALE = 1.12; // échelle de départ du tampon
const FLASH_MS = 400; // refus : durée du flash vermillon d'une case
const GHOST_FADE_MS = 300; // fondu d'apparition d'un tracé fantôme validé
const SHAKE_MS = 400; // refus : durée de la secousse
const SHAKE_AMP = 14; // amplitude écran de la secousse (px)
const SHAKE_FREQ = 22; // pulsation de la secousse (rad/unité de temps normalisée)

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
/** @type {Set<number>} Cases du tracé survolé dans le panneau debug. */
const debugHint = new Set();

/**
 * Coin haut-gauche (monde) d'une case selon son indice.
 * @param {number} i
 */
function cellOrigin(i) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: col * metrics.pitch, y: row * metrics.pitch };
}

/**
 * Centre (monde) d'une case selon son indice.
 * @param {number} i
 */
function cellCenter(i) {
  const o = cellOrigin(i);
  return { x: o.x + metrics.cell / 2, y: o.y + metrics.cell / 2 };
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
  // Survol d'un mot du panneau debug : la case prend l'apparence « hover »
  // (fond CARD_HOVER, bord et lettre encre), quel que soit son état.
  if (debugHint.has(i)) {
    fill = CARD_HOVER;
    stroke = INK;
    textFill = INK;
  }
  const g = cellBgs[i];
  g.clear();
  // Géométrie centrée sur (0,0) local : le fond est placé au centre de la case
  // (layoutCells), donc scale/pop grandissent autour du centre, sans dérive.
  g.roundRect(
    -metrics.cell / 2,
    -metrics.cell / 2,
    metrics.cell,
    metrics.cell,
    metrics.radius,
  )
    .fill(fill)
    .stroke({ width: metrics.stroke, color: stroke, alignment: 0.5 });
  cellTexts[i].style.fill = textFill;
}

// Applique scale + alpha à une case (fond + lettre ensemble). Base des
// animations deal/pop/stamp ; les couleurs restent gérées par paintCell.
/**
 * @param {number} i
 * @param {number} scale
 * @param {number} alpha
 */
function setCellTransform(i, scale, alpha) {
  cellBgs[i].scale.set(scale);
  cellBgs[i].alpha = alpha;
  cellTexts[i].scale.set(scale);
  cellTexts[i].alpha = alpha;
}

// Interpolation linéaire entre deux couleurs 0xRRGGBB (pour le flash de refus).
/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * t);
  const bl = Math.round(ab + ((b & 0xff) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Repeint toutes les cases (25 petits roundRect : bon marché, appelé aux
// changements de tracé et de cases consommées).
function repaintCells() {
  for (let i = 0; i < cellCount; i++) paintCell(i);
}

// Résolution de texture des lettres. Le glyphe est déjà gravé à la taille du
// zoom max (metrics.font = FONT_SIZE × baseScale) et la caméra ne dépasse
// jamais world.scale = 1 : il suffit donc de couvrir la densité écran (dpr)
// plus un léger sur-échantillonnage pour l'anticrénelage. Plus besoin du
// facteur d'échelle du zoom, ni d'un plafond élevé.
function letterResolution() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(4, dpr * 1.5);
}

// Construit les cellCount cases (fond + lettre vide) une fois pour toutes.
// Positions, tailles et résolution sont posées par layoutCells (rappelée au
// resize via relayout). Les lettres sont peuplées par renderSceneGrid.
function buildGrid() {
  for (let i = 0; i < cellCount; i++) {
    const bg = new Graphics();
    cellsLayer.addChild(bg);
    cellBgs.push(bg);

    const text = new Text({
      text: "",
      style: {
        fontFamily: "Source Serif 4",
        fontWeight: "700",
        fontSize: metrics.font,
        fill: INK,
        align: "center",
      },
    });
    text.anchor.set(0.5);
    lettersLayer.addChild(text);
    cellTexts.push(text);
  }
  layoutCells();
}

// Positionne et dimensionne cases + lettres selon les métriques courantes
// (unités design × baseScale). Géométrie centrée sur (0,0) local et placée au
// centre de la case : scale/pop grandissent autour du centre, sans dérive.
function layoutCells() {
  const resolution = letterResolution();
  for (let i = 0; i < cellCount; i++) {
    const c = cellCenter(i);
    cellBgs[i].position.set(c.x, c.y);
    cellTexts[i].position.set(c.x, c.y);
    cellTexts[i].style.fontSize = metrics.font;
    cellTexts[i].style.resolution = resolution;
    paintCell(i);
  }
}

// Recalcule les métriques (baseScale caméra) puis re-pose la grille et les
// tracés : appelé au resize, quand baseScale change (le zoom max reste
// ~ZOOM_MAX_CELLS cases, la scène est regravée à la nouvelle taille native).
function relayout() {
  updateMetrics(camera.baseScale);
  layoutCells();
  renderTrace();
  renderFoundTraces();
}

// --- Tracé (espace monde) --------------------------------------------------

// Trace la polyligne d'un chemin sur un Graphics (largeur/couleur/alpha donnés).
/**
 * @param {Graphics} g
 * @param {number[]} path
 * @param {number} color
 * @param {number} [alpha]
 */
function strokePath(g, path, color, alpha = 1) {
  if (path.length < 2) return;
  const p0 = cellCenter(path[0]);
  g.moveTo(p0.x, p0.y);
  for (let k = 1; k < path.length; k++) {
    const p = cellCenter(path[k]);
    g.lineTo(p.x, p.y);
  }
  g.stroke({ width: metrics.trace, color, alpha, cap: "round", join: "round" });
}

// Redessine le tracé en cours (ligne d'encre continue).
export function renderTrace() {
  activeTrace.clear();
  strokePath(activeTrace, state.path, INK);
}

// Dessine tous les tracés fantômes, le dernier avec un alpha donné (fondu du
// mot qu'on vient de valider). lastAlpha = 1 → tous pleinement visibles.
/** @param {number} lastAlpha */
function drawFoundTraces(lastAlpha) {
  ghostTrace.clear();
  const paths = state.foundPaths;
  for (let k = 0; k < paths.length; k++) {
    const a = k === paths.length - 1 ? lastAlpha : 1;
    strokePath(ghostTrace, paths[k], GHOST, a);
  }
}

// Tracés fantômes : les traits des mots validés restent affichés, dans les
// tons des cases désactivées, pour relire les mots sur la grille.
export function renderFoundTraces() {
  drawFoundTraces(1);
}

// Longueur du tracé à la dernière peinture : sert à détecter qu'une case
// vient de rejoindre la tête (croissance) pour déclencher le « pop ».
let prevPathLen = 0;

// Repeint les cases selon la sélection courante (tint sel/head) et anime d'un
// petit rebond la case qui vient de rejoindre le tracé.
export function updateSelection() {
  repaintCells();
  const len = state.path.length;
  if (len > prevPathLen && len > 0) popCell(state.path[len - 1]);
  prevPathLen = len;
}

// --- Animations ------------------------------------------------------------

// « Pop » : la case qui rejoint la tête du tracé rebondit brièvement.
/** @param {number} i */
function popCell(i) {
  tween({
    id: `cell-${i}`,
    duration: POP_MS,
    onUpdate: (k) => setCellTransform(i, 1 + POP_AMP * Math.sin(Math.PI * k), 1),
    onComplete: () => setCellTransform(i, 1, 1),
  });
}

// « Deal » : distribution en cascade des cases (fondu + léger tassement),
// décalée par indice comme l'impression CSS d'origine.
function dealCells() {
  prevPathLen = 0;
  for (let i = 0; i < cellCount; i++) {
    cellBgs[i].tint = 0xffffff; // efface un éventuel flash en cours
    setCellTransform(i, DEAL_SCALE, 0);
    tween({
      id: `cell-${i}`,
      delay: i * DEAL_STAGGER,
      duration: DEAL_MS,
      ease: easeOutCubic,
      onUpdate: (k) =>
        setCellTransform(i, DEAL_SCALE + (1 - DEAL_SCALE) * k, k),
      onComplete: () => setCellTransform(i, 1, 1),
    });
  }
}

// « Flash » de refus : les cases du tracé virent au vermillon puis reviennent
// (tint multiplicatif : les fonds clairs prennent la teinte, le noir résiste).
/** @param {number[]} indices */
export function flashPath(indices) {
  for (const i of indices) {
    tween({
      id: `flash-${i}`,
      duration: FLASH_MS,
      onUpdate: (k) => {
        cellBgs[i].tint = lerpColor(0xffffff, VERMILION, Math.sin(Math.PI * k));
      },
      onComplete: () => {
        cellBgs[i].tint = 0xffffff;
      },
    });
  }
}

// « Stamp » : un mot validé tasse ses cases (scale 1.12→1, déjà repeintes en
// disabled par renderUsedCells) et fait apparaître son tracé fantôme en fondu.
/** @param {number[]} traced */
export function stampWord(traced) {
  for (const i of traced) {
    setCellTransform(i, STAMP_SCALE, 1);
    tween({
      id: `cell-${i}`,
      duration: STAMP_MS,
      ease: easeOutCubic,
      onUpdate: (k) => setCellTransform(i, STAMP_SCALE + (1 - STAMP_SCALE) * k, 1),
      onComplete: () => setCellTransform(i, 1, 1),
    });
  }
  tween({
    id: "ghost-fade",
    duration: GHOST_FADE_MS,
    ease: easeOutCubic,
    onUpdate: (k) => drawFoundTraces(k),
    onComplete: () => renderFoundTraces(),
  });
}

// « Shake » de refus : secousse écran amortie (sinus décroissant) ajoutée à
// world.position APRÈS le clamp caméra, chaque frame. N'altère jamais l'état
// caméra : quand la secousse est finie, on recale world sur la caméra.
let shakeElapsed = 0;
let shaking = false;

export function shakeGrid() {
  shakeElapsed = 0;
  shaking = true;
}

/** @param {import("pixi.js").Ticker} ticker */
function applyShake(ticker) {
  if (!shaking || !camera) return;
  shakeElapsed += ticker.deltaMS;
  const t = shakeElapsed / SHAKE_MS;
  if (t >= 1) {
    shaking = false;
    world.position.set(camera.x, camera.y); // retour à la position caméra pure
    return;
  }
  const off = SHAKE_AMP * (1 - t) * Math.sin(t * SHAKE_FREQ);
  world.position.set(camera.x + off, camera.y);
}

// Repeint les cases consommées par les mots trouvés (état disabled).
export function renderUsedCells() {
  repaintCells();
}

// Survol d'un mot du panneau debug : surligne les cases de son tracé (apparence
// « hover »), ou efface le surlignage si path est null. Sans effet hors debug
// (setDebugHint n'est appelé que par debug.js, chargé si DEBUG).
/** @param {number[]|null} path */
export function setDebugHint(path) {
  if (!app) return;
  debugHint.clear();
  if (path) for (const i of path) debugHint.add(i);
  repaintCells();
}

// --- Hit-test / accès stage (pour input.js) --------------------------------

// Case sous un point écran (Point global d'un event fédéré), ou null.
// Conversion écran→monde via world.toLocal, puis tolérance rayon cell/2
// autour du centre de la case la plus proche (reprise de la logique DOM).
/**
 * @param {import("pixi.js").PointData} global
 * @returns {number|null}
 */
export function cellAtGlobal(global) {
  if (!world) return null;
  const p = world.toLocal(global);
  const col = Math.round((p.x - metrics.cell / 2) / metrics.pitch);
  const row = Math.round((p.y - metrics.cell / 2) / metrics.pitch);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const cx = col * metrics.pitch + metrics.cell / 2;
  const cy = row * metrics.pitch + metrics.cell / 2;
  if (Math.hypot(p.x - cx, p.y - cy) > metrics.cell / 2) return null;
  return row * cols + col;
}

// Stage Pixi : cible des events fédérés du tracé (configuré dans initScene).
/** @returns {import("pixi.js").Container} */
export function getStage() {
  return app.stage;
}

// Application Pixi : input.js s'en sert pour le canvas (contextmenu/dragstart)
// et le Ticker (pan clavier).
/** @returns {Application} */
export function getApp() {
  return app;
}

// Caméra : input.js la pilote pour le pan (translation) et le pinch (zoom
// autour du milieu des doigts). Le zoom molette/boutons reste géré ici.
/** @returns {Camera} */
export function getCamera() {
  return camera;
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
   * @param {string} [extraClass] modificateur optionnel (ex. bouton de pas)
   */
  const addButton = (label, title, onClick, extraClass) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = extraClass ? `zoom-btn ${extraClass}` : "zoom-btn";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", onClick);
    bar.appendChild(btn);
  };

  // Boutons de pas + / − : masqués sur mobile (le pinch suffit), voir style.css.
  addButton(
    "+",
    "Zoomer",
    () => camera.zoomAt(camera.screenCenter(), ZOOM_STEP),
    "zoom-btn--step",
  );
  addButton(
    "−",
    "Dézoomer",
    () => camera.zoomAt(camera.screenCenter(), 1 / ZOOM_STEP),
    "zoom-btn--step",
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

  // Moteur de tweens branché sur le Ticker de l'app (animations Pixi-natives).
  initTweens(app.ticker);

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
  // Ordre : trait SOUS les cases SOUS les lettres. Les fonds de cases sont
  // opaques : le trait n'apparaît que dans les espaces entre cases, jamais à
  // travers une lettre ni par-dessus un fond (rouge de la tête, etc.). Il relie
  // visuellement les cases par-dessous, comme un fil passant derrière les tuiles.
  world.addChild(traceLayer, cellsLayer, lettersLayer);
  app.stage.addChild(world);

  // Fantômes sous le tracé actif, tous deux dans traceLayer.
  ghostTrace = new Graphics();
  activeTrace = new Graphics();
  traceLayer.addChild(ghostTrace, activeTrace);

  // Le stage reçoit les events fédérés (tracé) sur tout l'écran.
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // Caméra : calcule baseScale (px natifs par unité design au zoom max) et le
  // cadrage initial « fit ». Créée AVANT la grille : celle-ci est gravée à
  // baseScale (taille du zoom max) pour que la caméra ne fasse que dézoomer.
  adoptGeometry();
  camera = new Camera(app, world, { rows, cols });
  updateMetrics(camera.baseScale);

  // Polices prêtes avant de créer les Text (sinon fallback figé en texture).
  try {
    await document.fonts.load('700 42px "Source Serif 4"');
    await document.fonts.ready;
  } catch (_) {
    /* API Font indisponible : on construit quand même */
  }

  buildGrid();

  // Resize : recalcule baseScale (caméra) puis regrave la grille à la nouvelle
  // taille native (le zoom max reste ~ZOOM_MAX_CELLS cases, texte net).
  app.renderer.on("resize", () => {
    camera.resize();
    relayout();
  });

  // Secousse de refus : offset écran ajouté chaque frame après le clamp caméra.
  app.ticker.add(applyShake);

  // Zoom molette (vers le pointeur) + boutons flottants.
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  buildZoomControls();
}

// Reconstruit la grille Pixi pour le mode actif (changement de mode à
// chaud) : annule les animations en cours, détruit cases et lettres, recadre
// la caméra sur la nouvelle forme, recrée la grille. Les lettres sont
// reposées par renderSceneGrid (startGame).
export function rebuildGrid() {
  if (!app) return;
  cancelTweens(); // aucun onUpdate ne doit toucher une case détruite
  shaking = false; // fin de secousse : la caméra recale world via fit
  debugHint.clear();
  prevPathLen = 0;
  for (const g of cellBgs) g.destroy();
  for (const t of cellTexts) t.destroy();
  cellBgs.length = 0;
  cellTexts.length = 0;
  ghostTrace.clear();
  activeTrace.clear();
  adoptGeometry();
  camera.setGrid({ rows, cols }); // bornes + cadrage « tout voir »
  updateMetrics(camera.baseScale); // baseScale inchangé, par principe
  buildGrid();
}

// Réaffiche la grille pour la partie courante : pose les lettres, remet les
// cases à l'état normal, efface le tracé et les fantômes, recadre.
export function renderSceneGrid() {
  if (!app) return;
  for (let i = 0; i < cellCount; i++) {
    cellTexts[i].text = state.letters[i] ?? "";
  }
  repaintCells();
  renderTrace(); // state.path vide → efface le tracé actif
  renderFoundTraces(); // state.foundPaths vide → efface les fantômes
  dealCells(); // distribution en cascade des cases (fondu + tassement)
  // Nouvelle partie : on revient au cadrage « tout voir ».
  if (camera) camera.fit();
}
