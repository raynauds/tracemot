// Validation autoritaire d'un tracé (doc 01 § Données de niveaux, doc 02 §
// submitWord/updateTrace) : longueur, contiguïté orthogonale (via
// geometry.neighbors) et cases non consommées. Le mot lui-même (∈ solution,
// « déjà trouvé ») reste du ressort de wordRejectReason (../game/rules.ts,
// fonction pure, doc 01 § conformité #5) — ce module ne connaît pas la
// solution.

import type { Geometry } from "@traceword/core";
import type { FoundWord } from "./types.ts";

// Cases consommées par les mots déjà trouvés : DÉRIVÉES de found[].path,
// jamais stockées à part (même principe que client/local-state.ts côté
// client, doc 01 § conformité #3) — impossible de désynchroniser un état
// qu'on ne garde pas.
export function usedCells(found: FoundWord[]): Set<number> {
  const used = new Set<number>();
  for (const entry of found) {
    for (const cell of entry.path) used.add(cell);
  }
  return used;
}

// Un tracé n'est structurellement valable que si : il n'est pas vide, chaque
// case appartient à la grille, aucune case n'y apparaît deux fois, chaque
// case suit la précédente par adjacence orthogonale, et aucune n'est déjà
// consommée par un mot trouvé. Ne dit rien du mot lui-même.
export function isValidTrace(
  path: number[],
  geometry: Geometry,
  found: FoundWord[],
): boolean {
  if (path.length === 0) return false;
  const consumed = usedCells(found);
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (cell < 0 || cell >= geometry.cellCount) return false;
    if (seen.has(cell) || consumed.has(cell)) return false;
    if (i > 0 && !geometry.neighbors[path[i - 1]].includes(cell)) return false;
    seen.add(cell);
  }
  return true;
}

// Tracé PARTIEL (updateTrace, doc 02) : validation légère, juste les bornes
// de la grille — pas de contiguïté imposée (le doigt peut reculer sur
// lui-même en cours de geste, cf. input.ts côté client) ni de vérification
// des cases consommées (l'invalidation d'un tracé en vol reste un geste
// local côté client, doc 02 § Q14). `[]` (doigt levé) est toujours valable.
export function isTraceWithinGrid(path: number[], geometry: Geometry): boolean {
  return path.every((cell) => cell >= 0 && cell < geometry.cellCount);
}

// Mot formé par un tracé sur les lettres de la grille courante.
export function wordFromPath(letters: string[], path: number[]): string {
  return path.map((cell) => letters[cell]).join("");
}
