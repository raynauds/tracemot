// @ts-check
// Modèle caméra : état { scale, x, y } appliqué au container monde
// (world.scale = scale, world.position = (x, y)). Centralise les conversions
// écran<->monde, le cadrage « fit », les bornes (clamp) et le zoom centré
// pointeur. Le pan au drag et le pinch arrivent en phase 4.

import { CELL_GAP, CELL_SIZE, FIT_PADDING, ZOOM_MAX_CELLS } from "./config.js";

/** @typedef {import("pixi.js").Application} Application */
/** @typedef {import("pixi.js").Container} Container */
/** @typedef {{ x: number, y: number }} Vec2 */

/**
 * Borne une coordonnée d'axe pour garder le viewport inclus dans la grille
 * projetée. Si la grille est plus petite que l'écran (cas du fit), on centre.
 * @param {number} pos     position monde de l'origine grille (px écran)
 * @param {number} screen  taille écran de l'axe (px)
 * @param {number} gridProj taille projetée de la grille sur l'axe (px)
 * @returns {number}
 */
function clampAxis(pos, screen, gridProj) {
  const min = screen - gridProj; // bord bas/droit de la grille au ras de l'écran
  const max = 0; // bord haut/gauche au ras de l'écran
  if (min >= max) return (screen - gridProj) / 2; // grille plus étroite : centrage
  return Math.min(max, Math.max(min, pos));
}

export class Camera {
  /**
   * @param {Application} app
   * @param {Container} world  container monde recevant la transform.
   * @param {{ rows: number, cols: number }} grid
   */
  constructor(app, world, grid) {
    this.app = app;
    this.world = world;
    this.pitchDesign = CELL_SIZE + CELL_GAP;
    // Géométrie de la grille en unités design (avant baseScale).
    this.gridWDesign = grid.cols * CELL_SIZE + (grid.cols - 1) * CELL_GAP;
    this.gridHDesign = grid.rows * CELL_SIZE + (grid.rows - 1) * CELL_GAP;
    // baseScale : px natifs par unité design au zoom max (ZOOM_MAX_CELLS cases
    // remplissent le petit côté). La scène est gravée à cette taille ; la caméra
    // ne fait plus que dézoomer (world.scale ≤ 1). Recalculé au resize.
    this.baseScale = 1;
    // Géométrie de la grille en unités monde (design × baseScale = px natifs).
    this.gridW = this.gridWDesign;
    this.gridH = this.gridHDesign;
    // État caméra.
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    // Bornes de world.scale, recalculées au resize. maxScale = 1 = rendu natif
    // (zoom max, jamais dépassé) ; fitScale ≤ 1 = grille entière visible.
    this.fitScale = 1;
    this.maxScale = 1;
    this.recompute();
    this.fit();
  }

  // Recalcule baseScale (px natifs / unité design au zoom max), la géométrie
  // monde et les bornes : fitScale (world.scale montrant toute la grille) et
  // maxScale = 1 (rendu natif : la scène est déjà gravée à la taille du zoom
  // max, on ne dépasse jamais 1, donc le texte n'est jamais agrandi).
  recompute() {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.baseScale = Math.min(sw, sh) / (ZOOM_MAX_CELLS * this.pitchDesign);
    this.gridW = this.gridWDesign * this.baseScale;
    this.gridH = this.gridHDesign * this.baseScale;
    this.fitScale = Math.min(sw / this.gridW, sh / this.gridH) * FIT_PADDING;
    this.maxScale = 1;
    // Garde-fou : sur une grille tenant en moins de ZOOM_MAX_CELLS cases,
    // fitScale pourrait dépasser 1.
    if (this.maxScale < this.fitScale) this.maxScale = this.fitScale;
  }

  // Contraint un état : scale dans [fitScale, maxScale] et position telle que
  // le viewport reste inclus dans la grille (centrage si plus petite).
  /**
   * @param {number} scale
   * @param {number} x
   * @param {number} y
   * @returns {{ scale: number, x: number, y: number }}
   */
  clamp(scale, x, y) {
    const s = Math.min(this.maxScale, Math.max(this.fitScale, scale));
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    return {
      scale: s,
      x: clampAxis(x, sw, this.gridW * s),
      y: clampAxis(y, sh, this.gridH * s),
    };
  }

  // Écrit l'état sur le container monde.
  apply() {
    this.world.scale.set(this.scale);
    this.world.position.set(this.x, this.y);
  }

  // Adopte un état clampé puis l'applique.
  /**
   * @param {number} scale
   * @param {number} x
   * @param {number} y
   */
  set(scale, x, y) {
    const c = this.clamp(scale, x, y);
    this.scale = c.scale;
    this.x = c.x;
    this.y = c.y;
    this.apply();
  }

  // Point écran (px) → point monde.
  /**
   * @param {number} sx
   * @param {number} sy
   * @returns {Vec2}
   */
  toWorld(sx, sy) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  // Point monde → point écran (px).
  /**
   * @param {number} wx
   * @param {number} wy
   * @returns {Vec2}
   */
  toScreen(wx, wy) {
    return { x: wx * this.scale + this.x, y: wy * this.scale + this.y };
  }

  // Cadrage « tout voir » : scale minimum, grille centrée.
  fit() {
    this.set(this.fitScale, 0, 0);
  }

  // Zoom centré sur un point écran : le point monde sous le pointeur reste
  // fixe. factor > 1 zoome en avant.
  /**
   * @param {Vec2} pointer  point écran (px)
   * @param {number} factor
   */
  zoomAt(pointer, factor) {
    const target = Math.min(
      this.maxScale,
      Math.max(this.fitScale, this.scale * factor),
    );
    if (target === this.scale) return;
    // Point monde sous le pointeur, conservé après changement d'échelle.
    const w = this.toWorld(pointer.x, pointer.y);
    this.set(target, pointer.x - w.x * target, pointer.y - w.y * target);
  }

  // Centre de l'écran (px) : cible des boutons + / −.
  /** @returns {Vec2} */
  screenCenter() {
    return { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
  }

  // Recalcule les bornes et re-clampe l'état après un resize.
  resize() {
    this.recompute();
    this.set(this.scale, this.x, this.y);
  }
}
