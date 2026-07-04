// @ts-check
// Validation d'un mot. Partagé entre la validation au lâcher du tracé
// (main.js) et le hint d'encre du registre (render.js).

import { FIVE_WORD_LENGTH } from "./config.js";
import { state } from "./state.js";

/**
 * Motif de refus du mot, ou null s'il est valable.
 * @param {string} word
 * @returns {string|null}
 */
export function wordRejectReason(word) {
  if (word.length !== FIVE_WORD_LENGTH) {
    return `${FIVE_WORD_LENGTH} LETTRES REQUISES`;
  }
  if (state.found.includes(word)) return "DÉJÀ TROUVÉ";
  if (!state.words.has(word)) return "ABSENT DU DICTIONNAIRE";
  return null;
}
