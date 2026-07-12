// @ts-check
// Chargement et parsing des dictionnaires : un mot par ligne, en capitales,
// fichiers triés (la construction des préfixes s'appuie sur le tri).
// Aucune dépendance au DOM ni à l'état : parseWordList et buildLengthSets
// sont réutilisables hors navigateur (harnais de test Node).

// Fichiers des quatre paliers de vocabulaire, du plus courant au plus rare.
// Les paliers sont disjoints : un mot n'apparaît que dans son palier.
/** @type {Record<import("./config.js").Tier, string>} */
export const TIER_FILES = {
  enfant: "dictionnaires/1_dico_entree_enfant.txt",
  ado: "dictionnaires/2_dico_entree_ado.txt",
  adulte: "dictionnaires/3_dico_entree_adulte.txt",
  inconnu: "dictionnaires/4_dico_entree_non_connu.txt",
};
export const FULL_DICT_FILE = "dictionnaires/dictionnaire.txt";
export const TIER_NAMES = /** @type {import("./config.js").Tier[]} */ (
  Object.keys(TIER_FILES)
);

/** @param {string} url */
async function fetchWordFile(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} sur ${url}`);
  return resp.text();
}

/**
 * @param {string} text
 * @param {number} maxPrefixLen Longueur maximale des préfixes construits
 *   (élagage du DFS) — la longueur maximale d'un tracé sur la grille, soit
 *   son nombre de cases. 0 : pas de préfixes, `prefixes` est retourné vide.
 */
export function parseWordList(text, maxPrefixLen = 0) {
  /** @type {Set<string>} */
  const words = new Set();
  /** @type {Set<string>} */
  const prefixes = new Set();
  let prev = "";

  for (const line of text.split("\n")) {
    const w = line.endsWith("\r") ? line.slice(0, -1) : line; // CRLF ou LF
    if (!w) continue;
    words.add(w);
    if (maxPrefixLen === 0) continue;
    // Le fichier est trié : on saute les préfixes déjà insérés via le
    // préfixe commun avec le mot précédent.
    const max = Math.min(w.length, maxPrefixLen);
    let k = 0;
    const lim = Math.min(max, prev.length);
    while (k < lim && w[k] === prev[k]) k++;
    for (let i = k + 1; i <= max; i++) prefixes.add(w.slice(0, i));
    prev = w;
  }

  return { words, prefixes };
}

/**
 * Sous-ensembles « length lettres » pour la génération de la grille : mots
 * et préfixes du dictionnaire complet (vérification qu'aucun mot parasite
 * n'est traçable) et mots candidats de chaque palier de vocabulaire (les
 * mots à cacher, dosés selon la difficulté).
 * @param {Set<string>} fullWords
 * @param {Record<import("./config.js").Tier, Set<string>>} tierWords
 * @param {number} length Longueur des mots du mode (wordLength).
 */
export function buildLengthSets(fullWords, tierWords, length) {
  /** @type {Set<string>} */
  const words = new Set();
  /** @type {Set<string>} */
  const prefixes = new Set();
  for (const w of fullWords) {
    if (w.length !== length) continue;
    words.add(w);
    for (let i = 1; i <= length; i++) prefixes.add(w.slice(0, i));
  }
  const candidates =
    /** @type {Record<import("./config.js").Tier, string[]>} */ ({});
  for (const tier of TIER_NAMES) {
    candidates[tier] = [...tierWords[tier]].filter(
      (w) => w.length === length && words.has(w),
    );
  }
  return { candidates, words, prefixes };
}

/**
 * Charge le dictionnaire complet (validation des tracés) et les quatre
 * paliers de vocabulaire (choix des mots cachés selon la difficulté).
 * Les préfixes du dictionnaire complet ne servent qu'au mode debug :
 * `maxPrefixLen` = 0 évite de les construire pour rien (sinon passer le
 * nombre de cases de la grille, longueur maximale d'un tracé). Aucun
 * palier n'a besoin de ses préfixes.
 * @param {number} maxPrefixLen
 */
export async function loadDictionaries(maxPrefixLen) {
  const [fullText, ...tierTexts] = await Promise.all([
    fetchWordFile(FULL_DICT_FILE),
    ...TIER_NAMES.map((tier) => fetchWordFile(TIER_FILES[tier])),
  ]);
  const tiers =
    /** @type {Record<import("./config.js").Tier, ReturnType<typeof parseWordList>>} */ ({});
  TIER_NAMES.forEach((tier, i) => {
    tiers[tier] = parseWordList(tierTexts[i]);
  });
  return { full: parseWordList(fullText, maxPrefixLen), tiers };
}
