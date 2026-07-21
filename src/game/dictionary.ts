// Chargement et parsing des dictionnaires : un mot par ligne, en capitales,
// fichiers triés (la construction des préfixes s'appuie sur le tri).
// Aucune dépendance au DOM ni à l'état : parseWordList et buildLengthSets
// sont réutilisables hors navigateur (harnais de test Node).

import type { Tier } from "./config.ts";

// Fichiers des quatre paliers de vocabulaire, du plus courant au plus rare.
// Les paliers sont disjoints : un mot n'apparaît que dans son palier.
export const TIER_FILES: Record<Tier, string> = {
  enfant: "dictionnaires/1_dico_entree_enfant.txt",
  ado: "dictionnaires/2_dico_entree_ado.txt",
  adulte: "dictionnaires/3_dico_entree_adulte.txt",
  inconnu: "dictionnaires/4_dico_entree_non_connu.txt",
};
export const FULL_DICT_FILE = "dictionnaires/dictionnaire.txt";
export const TIER_NAMES = Object.keys(TIER_FILES) as Tier[];

/**
 * Variante d'un fichier dictionnaire restreinte aux mots de `length`
 * lettres : suffixe « _NN » zéro-paddé avant l'extension. Ces fichiers
 * sont produits par `node tools/split-dicts.mjs` — à relancer si les
 * dictionnaires source ou les longueurs des GAME_MODES changent.
 */
export function lengthFile(file: string, length: number): string {
  return file.replace(/\.txt$/, `_${String(length).padStart(2, "0")}.txt`);
}

async function fetchWordFile(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} sur ${url}`);
  return resp.text();
}

/**
 * @param maxPrefixLen Longueur maximale des préfixes construits
 *   (élagage du DFS) — la longueur maximale d'un tracé sur la grille, soit
 *   son nombre de cases. 0 : pas de préfixes, `prefixes` est retourné vide.
 */
export function parseWordList(text: string, maxPrefixLen = 0) {
  const words = new Set<string>();
  const prefixes = new Set<string>();
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
 * @param length Longueur des mots du mode (wordLength).
 */
export function buildLengthSets(
  fullWords: Set<string>,
  tierWords: Record<Tier, Set<string>>,
  length: number,
) {
  const words = new Set<string>();
  const prefixes = new Set<string>();
  for (const w of fullWords) {
    if (w.length !== length) continue;
    words.add(w);
    for (let i = 1; i <= length; i++) prefixes.add(w.slice(0, i));
  }
  const candidates = {} as Record<Tier, string[]>;
  for (const tier of TIER_NAMES) {
    candidates[tier] = [...tierWords[tier]].filter(
      (w) => w.length === length && words.has(w),
    );
  }
  return { candidates, words, prefixes };
}

/**
 * Charge le dictionnaire complet (validation des tracés) et les quatre
 * paliers de vocabulaire (choix des mots cachés selon la difficulté),
 * restreints aux longueurs jouées (`lengths`, wordLength des modes actifs)
 * via les fichiers « _NN » — voir `lengthFile`. Un tracé devant faire
 * exactement wordLength lettres, les autres longueurs ne servent à rien.
 * Exception : `maxPrefixLen` > 0 (mode debug) charge le dictionnaire
 * complet entier — findAllWords cherche toutes les longueurs — et
 * construit ses préfixes (passer le nombre de cases de la grille,
 * longueur maximale d'un tracé). Aucun palier n'a besoin de ses préfixes.
 */
export async function loadDictionaries(maxPrefixLen: number, lengths: number[]) {
  const fullFiles =
    maxPrefixLen > 0
      ? [FULL_DICT_FILE]
      : lengths.map((len) => lengthFile(FULL_DICT_FILE, len));
  const [fullTexts, ...tierTexts] = await Promise.all(
    [fullFiles, ...TIER_NAMES.map((tier) => lengths.map((len) => lengthFile(TIER_FILES[tier], len)))].map(
      (files) => Promise.all(files.map(fetchWordFile)),
    ),
  );

  // Chaque fichier est trié, leur concaténation ne l'est pas : on parse
  // fichier par fichier (les préfixes s'appuient sur le tri) puis on unit.
  const full = { words: new Set<string>(), prefixes: new Set<string>() };
  for (const text of fullTexts) {
    const part = parseWordList(text, maxPrefixLen);
    for (const w of part.words) full.words.add(w);
    for (const p of part.prefixes) full.prefixes.add(p);
  }
  const tiers = {} as Record<Tier, Set<string>>;
  TIER_NAMES.forEach((tier, i) => {
    const words = new Set<string>();
    for (const text of tierTexts[i]) {
      for (const w of parseWordList(text).words) words.add(w);
    }
    tiers[tier] = words;
  });
  return { full, tiers };
}
