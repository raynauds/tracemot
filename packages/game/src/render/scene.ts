// Scène Pixi : rendu plein écran de la grille (fonds de cases + lettres),
// tracé actif et tracés fantômes. Le chrome (registre, chrono, difficulté,
// victoire) reste piloté par render.ts. La caméra (zoom molette/boutons,
// cadrage) vit dans camera.ts. L'arbitrage des gestes vit dans input.ts, qui
// s'appuie sur cellAtGlobal / getStage exposés ici.

import { Application, Container, Graphics, Text } from "pixi.js";
import type { PointData, TextStyle, Ticker } from "pixi.js";
import { playSound } from "../audio/audio.ts";
import { Camera } from "./camera.ts";
import {
  CARD,
  CARD_HOVER,
  CELL_GAP,
  CELL_SIZE,
  GHOST,
  INK,
  LINE,
  PAPER,
  VERMILION,
  ZOOM_STEP,
} from "../game/config.ts";
import { SERIF_NAME } from "../theme/tokens.ts";
import { local, usedCells } from "../client/local-state.ts";
import { cancelTweens, easeOutCubic, initTweens, tween } from "./tween.ts";
import { maximizeIcon, minusIcon, plusIcon } from "./icons.ts";

// Géométrie de la grille, tirée du mode actif. Réadoptée au changement de
// mode par rebuildGrid (les fonctions du module la lisent à l'appel).
let rows = 0;
let cols = 0;
let cellCount = 0;
function adoptGeometry(): void {
  ({ rows, cols, cellCount } = local.geometry);
}

// Constantes de design (proportions), en « unités design ». Elles sont
// multipliées par baseScale (caméra) pour donner les métriques de rendu.
const CELL_RADIUS = 0;
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

/** @param base facteur px-natifs / unité design (baseScale caméra) */
function updateMetrics(base: number): void {
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
const DEAL_WAVE_MS = 380; // durée du front de vague (coin haut-gauche → bas-droit)
const DEAL_JITTER_MS = 40; // amplitude du micro-décalage par case (±20 ms)
const DEAL_SCALE = 1.18; // échelle de départ d'une case distribuée
const POP_MS = 160; // case rejoignant le tracé : durée du rebond
const POP_AMP = 0.09; // amplitude du rebond (scale 1→1+POP_AMP→1)
const STAMP_MS = 220; // mot validé : durée du tassement des cases
const STAMP_SCALE = 1.12; // échelle de départ du tampon
const FLASH_MS = 400; // refus : durée du flash vermillon d'une case
const GHOST_FADE_MS = 300; // fondu d'apparition d'un tracé fantôme validé
const SHAKE_MS = 400; // refus : durée de la secousse
const SHAKE_AMP = 0.08; // amplitude de la secousse (fraction de la largeur d'une case à l'écran)
const SHAKE_MIN_PX = 6; // plancher écran (px) : garde la secousse perceptible très dézoomé
const SHAKE_FREQ = 22; // pulsation de la secousse (rad/unité de temps normalisée)

// prefers-reduced-motion : lu une fois à l'init de la scène (initScene). Coupe
// la secousse de refus (déclencheur vestibulaire), rend le flash de refus
// instantané (pas d'oscillation) et la distribution des cases sans vague ni
// tassement animé. Le reste (pop, tampon, fondu fantôme) n'est pas concerné —
// les confettis de victoire, eux, sont traités côté CSS (autre lot).
let reducedMotion = false;

let app: Application;
/** Repère monde (transform caméra). */
let world: Container;
/** Modèle caméra appliqué à world. */
let camera: Camera;
let cellsLayer: Container;
let traceLayer: Container;
let lettersLayer: Container;
/** Tracés fantômes des mots trouvés (sous le tracé actif). */
let ghostTrace: Graphics;
/** Tracé en cours. */
let activeTrace: Graphics;
/** Fonds de cases, dans l'ordre des indices. */
const cellBgs: Graphics[] = [];
/** Lettres des cases, dans l'ordre des indices. */
const cellTexts: Text[] = [];

/**
 * Coin haut-gauche (monde) d'une case selon son indice.
 */
function cellOrigin(i: number): { x: number; y: number } {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: col * metrics.pitch, y: row * metrics.pitch };
}

/**
 * Centre (monde) d'une case selon son indice.
 */
function cellCenter(i: number): { x: number; y: number } {
  const o = cellOrigin(i);
  return { x: o.x + metrics.cell / 2, y: o.y + metrics.cell / 2 };
}

// Case survolée à la souris (desktop), avant tout tracé — état visuel
// discret. Posée par input.ts (setHoverCell) sur globalpointermove quand
// aucun geste n'est actif ; sans effet si la case est déjà disabled/head/sel
// (cellState les fait passer avant).
let hoverCell: number | null = null;

export function setHoverCell(i: number | null): void {
  if (hoverCell === i) return;
  hoverCell = i;
  repaintCells();
}

// État visuel d'une case : disabled (mot trouvé) > head (dernière du tracé) >
// sel (dans le tracé) > hover (survolée, souris) > normal. Les cases
// consommées sont inertes, jamais dans le tracé ni survolables.
function cellState(
  i: number,
): "disabled" | "head" | "sel" | "hover" | "normal" {
  if (usedCells().has(i)) return "disabled";
  const path = local.path;
  if (path.length && i === path[path.length - 1]) return "head";
  if (path.includes(i)) return "sel";
  if (i === hoverCell) return "hover";
  return "normal";
}

// Peint fond + lettre d'une case selon son état (couleurs de config.ts).
function paintCell(i: number): void {
  let fill: number, stroke: number, textFill: number;
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
    case "hover":
      // Même surface que le repos, survolée (card-hover) : filet et lettre
      // inchangés, comme .map-cell:hover (map.css) — seul le fond bouge.
      fill = CARD_HOVER;
      stroke = INK;
      textFill = INK;
      break;
    default:
      fill = CARD;
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
function setCellTransform(i: number, scale: number, alpha: number): void {
  cellBgs[i].scale.set(scale);
  cellBgs[i].alpha = alpha;
  cellTexts[i].scale.set(scale);
  cellTexts[i].alpha = alpha;
}

// Interpolation linéaire entre deux couleurs 0xRRGGBB (pour le flash de refus).
function lerpColor(a: number, b: number, t: number): number {
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
function repaintCells(): void {
  for (let i = 0; i < cellCount; i++) paintCell(i);
}

// Résolution de texture des lettres. Le glyphe est déjà gravé à la taille du
// zoom max (metrics.font = FONT_SIZE × baseScale) et la caméra ne dépasse
// jamais world.scale = 1 : il suffit donc de couvrir la densité écran (dpr)
// plus un léger sur-échantillonnage pour l'anticrénelage. Plus besoin du
// facteur d'échelle du zoom, ni d'un plafond élevé.
function letterResolution(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(4, dpr * 1.5);
}

// Construit les cellCount cases (fond + lettre vide) une fois pour toutes.
// Positions, tailles et résolution sont posées par layoutCells (rappelée au
// resize via relayout). Les lettres sont peuplées par renderSceneGrid.
function buildGrid(): void {
  for (let i = 0; i < cellCount; i++) {
    const bg = new Graphics();
    cellsLayer.addChild(bg);
    cellBgs.push(bg);

    const text = new Text({
      text: "",
      style: {
        fontFamily: SERIF_NAME,
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
function layoutCells(): void {
  const resolution = letterResolution();
  for (let i = 0; i < cellCount; i++) {
    const c = cellCenter(i);
    cellBgs[i].position.set(c.x, c.y);
    cellTexts[i].position.set(c.x, c.y);
    cellTexts[i].style.fontSize = metrics.font;
    // NOTE typage : TextStyle (Pixi v8) n'expose pas `resolution` (elle vit sur
    // Text). Assignation conservée telle quelle (aucun changement runtime).
    (cellTexts[i].style as TextStyle & { resolution?: number }).resolution =
      resolution;
    paintCell(i);
  }
}

// Recalcule les métriques (baseScale caméra) puis re-pose la grille et les
// tracés : appelé au resize, quand baseScale change (le zoom max reste
// ~ZOOM_MAX_CELLS cases, la scène est regravée à la nouvelle taille native).
function relayout(): void {
  updateMetrics(camera.baseScale);
  layoutCells();
  renderTrace();
  renderFoundTraces();
}

// --- Tracé (espace monde) --------------------------------------------------

// Trace la polyligne d'un chemin sur un Graphics (largeur/couleur/alpha donnés).
function strokePath(
  g: Graphics,
  path: number[],
  color: number,
  alpha: number = 1,
): void {
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
export function renderTrace(): void {
  activeTrace.clear();
  strokePath(activeTrace, local.path, INK);
}

// Dessine tous les tracés fantômes, le dernier avec un alpha donné (fondu du
// mot qu'on vient de valider). lastAlpha = 1 → tous pleinement visibles.
function drawFoundTraces(lastAlpha: number): void {
  ghostTrace.clear();
  const paths = local.foundPaths;
  for (let k = 0; k < paths.length; k++) {
    const a = k === paths.length - 1 ? lastAlpha : 1;
    strokePath(ghostTrace, paths[k], GHOST, a);
  }
}

// Tracés fantômes : les traits des mots validés restent affichés, dans les
// tons des cases désactivées, pour relire les mots sur la grille.
export function renderFoundTraces(): void {
  drawFoundTraces(1);
}

// Longueur du tracé à la dernière peinture : sert à détecter qu'une case
// vient de rejoindre la tête (croissance) pour déclencher le « pop ».
let prevPathLen = 0;

// Repeint les cases selon la sélection courante (tint sel/head) et anime d'un
// petit rebond la case qui vient de rejoindre le tracé.
export function updateSelection(): void {
  repaintCells();
  const len = local.path.length;
  if (len > prevPathLen && len > 0) popCell(local.path[len - 1]);
  prevPathLen = len;
}

// --- Animations ------------------------------------------------------------

// « Pop » : la case qui rejoint la tête du tracé rebondit brièvement. Exportée
// pour être rejouée en miroir sur la case qui QUITTE le tracé (backtrack,
// input.ts) — rejoindre et quitter se lisent par le même geste.
export function popCell(i: number): void {
  tween({
    id: `cell-${i}`,
    duration: POP_MS,
    onUpdate: (k) =>
      setCellTransform(i, 1 + POP_AMP * Math.sin(Math.PI * k), 1),
    onComplete: () => setCellTransform(i, 1, 1),
  });
}

// « Deal » : distribution des cases (fondu + léger tassement) en vague
// circulaire depuis le coin haut-gauche — délai proportionnel à la distance
// euclidienne, plus un micro-jitter déterministe qui casse le lockstep.
function dealCells(): void {
  prevPathLen = 0;
  if (reducedMotion) {
    // Distribution instantanée : pas de vague, pas de tassement animé.
    for (let i = 0; i < cellCount; i++) {
      cellBgs[i].tint = 0xffffff; // efface un éventuel flash en cours
      setCellTransform(i, 1, 1);
    }
    return;
  }
  const norm = Math.hypot(rows - 1, cols - 1) || 1;
  for (let i = 0; i < cellCount; i++) {
    cellBgs[i].tint = 0xffffff; // efface un éventuel flash en cours
    setCellTransform(i, DEAL_SCALE, 0);
    const d = Math.hypot(Math.floor(i / cols), i % cols) / norm;
    const jitter = (((i * 2654435761) >>> 16) & 0xff) / 255 - 0.5;
    tween({
      id: `cell-${i}`,
      delay: Math.max(0, d * DEAL_WAVE_MS + jitter * DEAL_JITTER_MS),
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
export function flashPath(indices: number[]): void {
  if (reducedMotion) {
    // Teinte instantanée, sans oscillation animée : un aller-retour net.
    for (const i of indices) cellBgs[i].tint = VERMILION;
    setTimeout(() => {
      for (const i of indices) cellBgs[i].tint = 0xffffff;
    }, FLASH_MS);
    return;
  }
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
export function stampWord(traced: number[]): void {
  for (const i of traced) {
    setCellTransform(i, STAMP_SCALE, 1);
    tween({
      id: `cell-${i}`,
      duration: STAMP_MS,
      ease: easeOutCubic,
      onUpdate: (k) =>
        setCellTransform(i, STAMP_SCALE + (1 - STAMP_SCALE) * k, 1),
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

export function shakeGrid(): void {
  if (reducedMotion) return; // secousse désactivée (déclencheur vestibulaire)
  shakeElapsed = 0;
  shaking = true;
}

function applyShake(ticker: Ticker): void {
  if (!shaking || !camera) return;
  shakeElapsed += ticker.deltaMS;
  const t = shakeElapsed / SHAKE_MS;
  if (t >= 1) {
    shaking = false;
    world.position.set(camera.x, camera.y); // retour à la position caméra pure
    return;
  }
  // Amplitude proportionnelle à la taille écran d'une case (constante perçue
  // quel que soit le zoom), avec un plancher en px écran très dézoomé.
  const amp = Math.max(SHAKE_AMP * metrics.cell * camera.scale, SHAKE_MIN_PX);
  const off = amp * (1 - t) * Math.sin(t * SHAKE_FREQ);
  world.position.set(camera.x + off, camera.y);
}

// Repeint les cases consommées par les mots trouvés (état disabled).
export function renderUsedCells(): void {
  repaintCells();
}

// --- Hit-test / accès stage (pour input.ts) --------------------------------

// Case sous un point écran (Point global d'un event fédéré), ou null.
// Conversion écran→monde via world.toLocal, puis tolérance carrée pitch/2
// autour du centre de la case la plus proche : un test au rayon cell/2 (le
// disque inscrit dans la case) laisse ~21,5 % de zone morte aux quatre coins.
// Le carré pitch/2 couvre les coins ET la moitié du gap inter-cases de chaque
// côté — la moitié restante revient symétriquement à la case voisine.
export function cellAtGlobal(global: PointData): number | null {
  if (!world) return null;
  const p = world.toLocal(global);
  const col = Math.round((p.x - metrics.cell / 2) / metrics.pitch);
  const row = Math.round((p.y - metrics.cell / 2) / metrics.pitch);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const cx = col * metrics.pitch + metrics.cell / 2;
  const cy = row * metrics.pitch + metrics.cell / 2;
  if (
    Math.abs(p.x - cx) > metrics.pitch / 2 ||
    Math.abs(p.y - cy) > metrics.pitch / 2
  )
    return null;
  return row * cols + col;
}

// Stage Pixi : cible des events fédérés du tracé (configuré dans initScene).
export function getStage(): Container {
  return app.stage;
}

// Application Pixi : input.ts s'en sert pour le canvas (contextmenu/dragstart)
// et le Ticker (pan clavier).
export function getApp(): Application {
  return app;
}

// Caméra : input.ts la pilote pour le pan (translation) et le pinch (zoom
// autour du milieu des doigts). Le zoom molette/boutons reste géré ici.
export function getCamera(): Camera {
  return camera;
}

// Molette → zoom centré sur le pointeur. Facteur exponentiel (doublement
// tous les ~500 px) pour un zoom lisse ; la caméra borne fit/max.
function onWheel(e: WheelEvent): void {
  if (!camera) return;
  e.preventDefault();
  const rect = app.canvas.getBoundingClientRect();
  const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  camera.zoomAt(pointer, Math.pow(2, -e.deltaY / 500));
}

// Boutons flottants + / − / tout voir : câblés sur zoomAt(centre, ±ZOOM_STEP)
// et fit(). Style « chip » (bordure INK) défini dans zoom.css.
function buildZoomControls(): void {
  const bar = document.createElement("div");
  bar.className = "zoom-controls";

  /**
   * @param extraClass modificateur optionnel (ex. bouton de pas)
   */
  const addButton = (
    icon: SVGSVGElement,
    title: string,
    onClick: () => void,
    extraClass?: string,
  ): void => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = extraClass ? `zoom-btn ${extraClass}` : "zoom-btn";
    btn.appendChild(icon);
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", () => {
      playSound("ui-secondary");
      onClick();
    });
    bar.appendChild(btn);
  };

  // Boutons de pas + / − : masqués sur mobile (le pinch suffit), voir zoom.css.
  addButton(
    plusIcon(),
    "Zoomer",
    () => camera.zoomAt(camera.screenCenter(), ZOOM_STEP),
    "zoom-btn--step",
  );
  addButton(
    minusIcon(),
    "Dézoomer",
    () => camera.zoomAt(camera.screenCenter(), 1 / ZOOM_STEP),
    "zoom-btn--step",
  );
  addButton(maximizeIcon(), "Tout voir", () => camera.fit(), "zoom-btn--fit");
  document.body.appendChild(bar);
}

/**
 * Initialise l'application Pixi et le graphe de scène. À appeler (await) avant
 * toute partie. Attend les polices pour éviter des lettres en fallback.
 */
export async function initScene(): Promise<void> {
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    await document.fonts.load(`700 42px "${SERIF_NAME}"`);
    await document.fonts.ready;
  } catch (_) {
    /* API Font indisponible : on construit quand même */
  }

  buildGrid();

  // Resize : recalcule baseScale (caméra) puis regrave la grille à la nouvelle
  // taille native (le zoom max reste ~ZOOM_MAX_CELLS cases, texte net).
  // Débounce léger : évite un relayout complet (25 Text) à chaque pixel d'un
  // redimensionnement continu (barre latérale tirée, rotation d'écran…).
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  app.renderer.on("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      camera.resize();
      relayout();
    }, 120);
  });

  // Secousse de refus : offset écran ajouté chaque frame après le clamp caméra.
  app.ticker.add(applyShake);

  // Zoom molette (vers le pointeur) + boutons flottants.
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  buildZoomControls();
}

// Reconstruit la grille Pixi à la forme du niveau lancé (elle change d'un
// niveau à l'autre — un défi double le côté) : annule les animations en cours,
// détruit cases et lettres, recadre la caméra sur la nouvelle forme, recrée la
// grille. Les lettres sont reposées ensuite par renderSceneGrid (main.ts,
// startLevel).
export function rebuildGrid(): void {
  if (!app) return;
  cancelTweens(); // aucun onUpdate ne doit toucher une case détruite
  shaking = false; // fin de secousse : la caméra recale world via fit
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
export function renderSceneGrid(): void {
  if (!app) return;
  for (let i = 0; i < cellCount; i++) {
    cellTexts[i].text = local.letters[i] ?? "";
  }
  repaintCells();
  renderTrace(); // local.path vide → efface le tracé actif
  renderFoundTraces(); // local.foundPaths vide → efface les fantômes
  dealCells(); // distribution en cascade des cases (fondu + tassement)
  // Nouvelle partie : on revient au cadrage « tout voir ».
  if (camera) camera.fit();
}
