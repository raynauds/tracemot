// @ts-check
// Chargement et parsing des dictionnaires : un mot par ligne, en capitales,
// fichiers triés (la construction des préfixes s'appuie sur le tri).

import { CELL_COUNT, FIVE_WORD_LENGTH } from "./config.js";

/** @param {string} url */
async function fetchWordFile(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} sur ${url}`);
  return resp.text();
}

/**
 * @param {string} text
 * @param {boolean} withPrefixes Construire aussi le Set des préfixes
 *   (élagage du DFS) ; sinon `prefixes` est retourné vide.
 */
export function parseWordList(text, withPrefixes) {
  /** @type {Set<string>} */
  const words = new Set();
  /** @type {Set<string>} */
  const prefixes = new Set();
  let prev = "";

  for (const line of text.split("\n")) {
    const w = line.endsWith("\r") ? line.slice(0, -1) : line; // CRLF ou LF
    if (!w) continue;
    words.add(w);
    if (!withPrefixes) continue;
    // Le fichier est trié : on saute les préfixes déjà insérés via le
    // préfixe commun avec le mot précédent, et on plafonne à 25 lettres
    // (longueur maximale d'un tracé sur la grille).
    const max = Math.min(w.length, CELL_COUNT);
    let k = 0;
    const lim = Math.min(max, prev.length);
    while (k < lim && w[k] === prev[k]) k++;
    for (let i = k + 1; i <= max; i++) prefixes.add(w.slice(0, i));
    prev = w;
  }

  return { words, prefixes };
}

/**
 * Sous-ensembles « 5 lettres » pour les modes 5×5 : mots et préfixes du
 * dictionnaire complet (vérification qu'aucun mot parasite n'est traçable)
 * et mots candidats du dictionnaire enfant (les mots à cacher).
 * @param {Set<string>} fullWords
 * @param {Set<string>} childWords
 */
export function buildFiveLetterSets(fullWords, childWords) {
  /** @type {Set<string>} */
  const words5 = new Set();
  /** @type {Set<string>} */
  const prefixes5 = new Set();
  for (const w of fullWords) {
    if (w.length !== FIVE_WORD_LENGTH) continue;
    words5.add(w);
    for (let i = 1; i <= FIVE_WORD_LENGTH; i++) prefixes5.add(w.slice(0, i));
  }
  const candidates = [...childWords].filter(
    (w) => w.length === FIVE_WORD_LENGTH && words5.has(w),
  );
  return { candidates, words5, prefixes5 };
}

/**
 * Charge le dictionnaire complet (validation des tracés) et le dictionnaire
 * « enfant » (solvabilité des grilles). Les préfixes du dictionnaire complet
 * ne servent qu'au mode debug : `withFullPrefixes` évite de les construire
 * pour rien.
 * @param {boolean} withFullPrefixes
 */
export async function loadDictionaries(withFullPrefixes) {
  const [fullText, childText] = await Promise.all([
    fetchWordFile("dictionnaire.txt"),
    fetchWordFile("dicoentreeenfant.txt"),
  ]);
  return {
    full: parseWordList(fullText, withFullPrefixes),
    child: parseWordList(childText, true),
  };
}
