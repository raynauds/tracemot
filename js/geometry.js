// @ts-check
// Géométrie d'une grille rows × cols : indices de cases (index = row * cols
// + col), voisins orthogonaux précalculés. Partagée par le solveur, la scène
// et l'input — seule source de vérité sur la forme de la grille.

/**
 * @typedef {{
 *   rows: number,
 *   cols: number,
 *   cellCount: number,
 *   neighbors: number[][],
 *   allCells: number[],
 * }} Geometry
 */

/**
 * @param {number} rows
 * @param {number} cols
 * @returns {Geometry}
 */
export function createGeometry(rows, cols) {
  const cellCount = rows * cols;
  const neighbors = Array.from({ length: cellCount }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const out = [];
    if (row > 0) out.push(i - cols);
    if (row < rows - 1) out.push(i + cols);
    if (col > 0) out.push(i - 1);
    if (col < cols - 1) out.push(i + 1);
    return out;
  });
  const allCells = Array.from({ length: cellCount }, (_, i) => i);
  return { rows, cols, cellCount, neighbors, allCells };
}
