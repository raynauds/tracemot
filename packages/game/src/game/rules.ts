// Validation d'un mot. Partagé entre la validation au lâcher du tracé
// (main.ts) et le hint d'encre du registre (render.ts).
//
// Le dictionnaire n'est plus chargé au runtime : la référence est la
// solution du niveau, prégénérée. Un mot traçable mais hors solution est
// donc « incorrecte » — le joueur cherche LES mots cachés, pas des mots.

import { state } from "./state.ts";

// Occurrences d'un mot dans une liste. Les mots d'une solution sont deux à
// deux distincts (le solveur impose une distance de Hamming ≥ 2), donc
// `expected` vaut toujours 1 aujourd'hui. Compter plutôt que tester la
// présence rend malgré tout la règle indépendante de cet invariant du
// générateur : si un niveau cachait un jour deux tracés du même mot, un
// `found.includes(word)` refuserait la seconde trouvaille « déjà trouvé » et
// le niveau deviendrait infinissable.
function count(list: string[], word: string): number {
  let n = 0;
  for (const w of list) if (w === word) n++;
  return n;
}

/**
 * Motif de refus du mot, ou null s'il est valable.
 *
 * Casse normale, pas de majuscules : ce sont des messages (le motif d'un
 * refus), pas des labels — la règle du projet réserve les majuscules aux
 * labels, boutons et états (DESIGN.md).
 */
export function wordRejectReason(word: string): string | null {
  if (word.length !== state.mode.wordLength) {
    return `${state.mode.wordLength} lettres requises`;
  }
  const expected = count(state.solution, word);
  if (expected === 0) return "Incorrecte";
  if (count(state.found, word) >= expected) return "Déjà trouvé";
  return null;
}
