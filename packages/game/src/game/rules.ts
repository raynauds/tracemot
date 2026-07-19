// Validation d'un mot. Partagée entre la validation au lâcher du tracé
// (client/client.ts, commitWord) et le hint d'encre du registre (render.ts)
// — et destinée à logic ET client (doc 01) : fonction PURE, aucun import du
// singleton `state`.
//
// Le dictionnaire n'est plus chargé au runtime : la référence est la
// solution du niveau, prégénérée. Un mot traçable mais hors solution est
// donc « incorrect » — le joueur cherche LES mots cachés, pas des mots.

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

// Code de refus : les libellés (français, `Rune.t()` demain) migrent côté
// client (render.ts) — logic ne connaît que le motif, pas sa présentation.
export type WordRejectCode = "length" | "notInSolution" | "alreadyFound";

export interface WordCheckContext {
  wordLength: number;
  solution: string[];
  found: string[];
}

/**
 * Code de refus du mot, ou null s'il est valable. Pure : ni lecture ni
 * écriture d'un état partagé, tout arrive en argument.
 */
export function wordRejectReason(
  word: string,
  ctx: WordCheckContext,
): WordRejectCode | null {
  if (word.length !== ctx.wordLength) return "length";
  const expected = count(ctx.solution, word);
  if (expected === 0) return "notInSolution";
  if (count(ctx.found, word) >= expected) return "alreadyFound";
  return null;
}
