// Validation d'un mot. Partagé entre la validation au lâcher du tracé
// (main.js) et le hint d'encre du registre (render.js).

import { state } from "./state.ts";

/**
 * Motif de refus du mot, ou null s'il est valable.
 */
export function wordRejectReason(word: string): string | null {
  if (word.length !== state.mode.wordLength) {
    return `${state.mode.wordLength} LETTRES REQUISES`;
  }
  if (state.found.includes(word)) return "DÉJÀ TROUVÉ";
  if (!state.words.has(word)) return "ABSENT DU DICTIONNAIRE";
  return null;
}
