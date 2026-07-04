// @ts-check
// Tirage des lettres et solveur. Logique pure : aucune dépendance au DOM
// ni à l'état de la partie, les dictionnaires sont passés en paramètres.

import {
  CELL_COUNT,
  DIFFICULTY_QUOTAS,
  FIVE_WORD_LENGTH,
  GRID_SIZE,
  LETTER_WEIGHTS,
  MAX_FIVE_GRID_TRIES,
  MAX_GRID_REPAIRS,
  MAX_GRID_TRIES,
  MIN_WORD_LENGTH,
  WORDS_TO_WIN,
} from "./config.js";

// --- Tirage pondéré des lettres ---------------------------------------

const WEIGHTED_LETTERS = Object.keys(LETTER_WEIGHTS);
const WEIGHT_TOTAL = WEIGHTED_LETTERS.reduce(
  (s, l) => s + LETTER_WEIGHTS[l],
  0,
);

function drawLetter() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const letter of WEIGHTED_LETTERS) {
    r -= LETTER_WEIGHTS[letter];
    if (r < 0) return letter;
  }
  return "E";
}

function drawLetters() {
  return Array.from({ length: CELL_COUNT }, drawLetter);
}

// --- Solveur (garantie de solvabilité) --------------------------------

// Voisins orthogonaux précalculés pour chaque case.
const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, i) => {
  const row = Math.floor(i / GRID_SIZE);
  const col = i % GRID_SIZE;
  const out = [];
  if (row > 0) out.push(i - GRID_SIZE);
  if (row < GRID_SIZE - 1) out.push(i + GRID_SIZE);
  if (col > 0) out.push(i - 1);
  if (col < GRID_SIZE - 1) out.push(i + 1);
  return out;
});

/**
 * Compte les mots distincts de `words` trouvables dans la grille, avec
 * arrêt anticipé dès que `target` mots sont atteints. DFS orthogonal,
 * élagage par le Set des préfixes.
 * @param {string[]} letters
 * @param {number} target
 * @param {Set<string>} words
 * @param {Set<string>} prefixes
 */
export function countSolvableWords(letters, target, words, prefixes) {
  /** @type {Set<string>} */
  const found = new Set();

  /**
   * @param {number} idx
   * @param {number} mask
   * @param {string} prefix
   */
  function dfs(idx, mask, prefix) {
    const next = prefix + letters[idx];
    if (!prefixes.has(next)) return;
    if (next.length >= MIN_WORD_LENGTH && words.has(next)) {
      found.add(next);
      if (found.size >= target) return;
    }
    for (const nb of NEIGHBORS[idx]) {
      const bit = 1 << nb;
      if (mask & bit) continue;
      dfs(nb, mask | bit, next);
      if (found.size >= target) return;
    }
  }

  for (let i = 0; i < CELL_COUNT && found.size < target; i++) {
    dfs(i, 1 << i, "");
  }
  return found.size;
}

/**
 * Tire des grilles jusqu'à en obtenir une où au moins WORDS_TO_WIN mots
 * « enfant » sont traçables. La validation en jeu reste sur le dictionnaire
 * complet : on garantit seulement que la grille contient assez de mots
 * connus des enfants.
 * @param {Set<string>} childWords
 * @param {Set<string>} childPrefixes
 * @returns {{ letters: string[], tries: number }}
 */
export function generateGrid(childWords, childPrefixes) {
  let best = drawLetters();
  let bestCount = -1;
  for (let t = 0; t < MAX_GRID_TRIES; t++) {
    const letters = t === 0 ? best : drawLetters();
    const count = countSolvableWords(
      letters,
      WORDS_TO_WIN,
      childWords,
      childPrefixes,
    );
    if (count >= WORDS_TO_WIN) return { letters, tries: t + 1 };
    if (count > bestCount) {
      bestCount = count;
      best = letters;
    }
  }
  console.warn(
    `Tracemot : plafond de ${MAX_GRID_TRIES} essais atteint - ` +
      `meilleure grille conservée (${bestCount} mots enfant trouvables sur ${WORDS_TO_WIN} demandés).`,
  );
  return { letters: best, tries: MAX_GRID_TRIES };
}

// --- Modes 5×5 (chevauchement et pavage parfait) ------------------------
//
// Ces modes garantissent une grille où exactement WORDS_TO_WIN mots de
// FIVE_WORD_LENGTH lettres sont traçables - ceux de la solution, choisis
// dans les paliers de vocabulaire dosés par la difficulté - vérifié contre
// le dictionnaire complet,
// chaque mot n'ayant qu'un seul tracé possible. Génération par tirage +
// vérification : on place les mots, on contrôle l'exclusivité, on répare
// (chevauchement) ou on retire (pavage) jusqu'à obtenir une grille propre.

const ALL_CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i);

/**
 * @template T
 * @param {T[]} arr
 * @returns {T[]} copie mélangée (Fisher-Yates)
 */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** @param {string} current */
function drawLetterOther(current) {
  for (;;) {
    const l = drawLetter();
    if (l !== current) return l;
  }
}

// Un tracé et son inverse comptent pour un seul tracé : la clé canonique
// est identique dans les deux sens (évite de compter deux fois les
// palindromes, et permet de comparer un tracé trouvé au tracé posé).
/** @param {number[]} path */
function canonKey(path) {
  const fwd = path.join(",");
  const rev = [...path].reverse().join(",");
  return fwd < rev ? fwd : rev;
}

/**
 * Nombre de positions où deux mots de même longueur diffèrent.
 * @param {string} a
 * @param {string} b
 */
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * @param {number} lo
 * @param {number} hi
 */
function randInt(lo, hi) {
  return lo + ((Math.random() * (hi - lo + 1)) | 0);
}

/**
 * Tire la composition des mots cachés pour une difficulté : nombre de mots
 * par palier, dans les bornes des quotas, le reste en mots enfant. Les
 * paliers les plus contraints (inconnu, adulte) sont tirés d'abord, les
 * quotas suivants sont plafonnés aux places restantes.
 * @param {import("./config.js").Difficulty} difficulty
 * @returns {Record<import("./config.js").Tier, number>}
 */
function drawTierCounts(difficulty) {
  const q = DIFFICULTY_QUOTAS[difficulty];
  let left = WORDS_TO_WIN;
  const inconnu = randInt(q.inconnu[0], Math.min(q.inconnu[1], left));
  left -= inconnu;
  const adulte = randInt(q.adulte[0], Math.min(q.adulte[1], left));
  left -= adulte;
  const ado = randInt(Math.min(q.ado[0], left), Math.min(q.ado[1], left));
  left -= ado;
  return { enfant: left, ado, adulte, inconnu };
}

/**
 * Tire WORDS_TO_WIN mots candidats respectant la composition de la
 * difficulté, deux à deux distants d'au moins 2 lettres (pas de
 * SALLE/BALLE dans la même solution). `tiers[i]` est le palier du mot
 * `words[i]` : un remplacement (réparation) se fait dans le même palier
 * pour préserver la composition.
 * @param {Record<import("./config.js").Tier, string[]>} candidates
 * @param {import("./config.js").Difficulty} difficulty
 * @returns {{words: string[], tiers: import("./config.js").Tier[]}|null}
 */
function pickSolutionWords(candidates, difficulty) {
  for (let t = 0; t < 50; t++) {
    const counts = drawTierCounts(difficulty);
    /** @type {import("./config.js").Tier[]} */
    const tiers = [];
    for (const tier of /** @type {import("./config.js").Tier[]} */ (
      Object.keys(counts)
    )) {
      if (candidates[tier].length < counts[tier]) break; // palier trop pauvre
      for (let k = 0; k < counts[tier]; k++) tiers.push(tier);
    }
    if (tiers.length !== WORDS_TO_WIN) continue;
    /** @type {string[]} */
    const chosen = [];
    for (let g = 0; g < 200 && chosen.length < WORDS_TO_WIN; g++) {
      const pool = candidates[tiers[chosen.length]];
      const w = pool[(Math.random() * pool.length) | 0];
      if (chosen.every((c) => hamming(c, w) >= 2)) chosen.push(w);
    }
    if (chosen.length === WORDS_TO_WIN) return { words: chosen, tiers };
  }
  return null;
}

/**
 * Énumère tous les mots de FIVE_WORD_LENGTH lettres de `words5` traçables
 * dans la grille, avec leurs tracés canoniques.
 * @param {string[]} letters
 * @param {Set<string>} words5
 * @param {Set<string>} prefixes5
 * @returns {Map<string, Map<string, number[]>>} mot → (clé canonique → tracé)
 */
function findFivePaths(letters, words5, prefixes5) {
  /** @type {Map<string, Map<string, number[]>>} */
  const found = new Map();

  /**
   * @param {number} idx
   * @param {number} mask
   * @param {string} prefix
   * @param {number[]} path
   */
  function dfs(idx, mask, prefix, path) {
    const next = prefix + letters[idx];
    if (!prefixes5.has(next)) return;
    path.push(idx);
    if (path.length === FIVE_WORD_LENGTH) {
      if (words5.has(next)) {
        let paths = found.get(next);
        if (!paths) found.set(next, (paths = new Map()));
        const key = canonKey(path);
        if (!paths.has(key)) paths.set(key, path.slice());
      }
    } else {
      for (const nb of NEIGHBORS[idx]) {
        const bit = 1 << nb;
        if (!(mask & bit)) dfs(nb, mask | bit, next, path);
      }
    }
    path.pop();
  }

  for (let i = 0; i < CELL_COUNT; i++) dfs(i, 1 << i, "", []);
  return found;
}

/**
 * Tracés fautifs d'une grille : tout tracé d'un mot hors solution, et tout
 * tracé d'un mot de la solution autre que celui posé. Une grille est valide
 * quand cette liste est vide.
 * @param {Map<string, Map<string, number[]>>} found
 * @param {Map<string, string>} intended mot de la solution → clé canonique du tracé posé
 * @returns {number[][]}
 */
function collectIssues(found, intended) {
  /** @type {number[][]} */
  const issues = [];
  for (const [word, paths] of found) {
    const wanted = intended.get(word);
    for (const [key, path] of paths) {
      if (key !== wanted) issues.push(path);
    }
  }
  return issues;
}

/**
 * Place `word` sur la grille partielle (null = case libre) : DFS randomisé,
 * une case convient si elle est libre ou porte déjà la bonne lettre. Si
 * `requireOverlap`, le tracé doit réutiliser au moins une case occupée
 * (croisement avec les mots déjà posés, façon mots croisés).
 * @param {(string|null)[]} letters
 * @param {string} word
 * @param {boolean} requireOverlap
 * @returns {number[]|null}
 */
function placeWordPath(letters, word, requireOverlap) {
  /** @type {number[]|null} */
  let result = null;

  /**
   * @param {number[]} path
   * @param {number} overlaps
   */
  function dfs(path, overlaps) {
    if (path.length === word.length) {
      if (!requireOverlap || overlaps > 0) result = path.slice();
      return;
    }
    const last = path[path.length - 1];
    for (const nb of shuffled(NEIGHBORS[last])) {
      if (path.includes(nb)) continue;
      const cell = letters[nb];
      if (cell !== null && cell !== word[path.length]) continue;
      path.push(nb);
      dfs(path, overlaps + (cell !== null ? 1 : 0));
      path.pop();
      if (result) return;
    }
  }

  for (const start of shuffled(ALL_CELLS)) {
    const cell = letters[start];
    if (cell !== null && cell !== word[0]) continue;
    dfs([start], cell !== null ? 1 : 0);
    if (result) return result;
  }
  return null;
}

/**
 * Mot de remplacement pour la position `i` de la solution : distinct des
 * mots en place et à distance de Hamming ≥ 2 de chacun des autres.
 * `candidates` est le vivier du palier du mot remplacé (la composition de
 * la difficulté est ainsi préservée).
 * @param {string[]} candidates
 * @param {string[]} words
 * @param {number} i
 * @returns {string|null}
 */
function pickReplacementWord(candidates, words, i) {
  for (let g = 0; g < 100; g++) {
    const w = candidates[(Math.random() * candidates.length) | 0];
    if (words.includes(w)) continue;
    if (words.every((c, j) => j === i || hamming(c, w) >= 2)) return w;
  }
  return null;
}

/**
 * Tentative de grille « chevauchement » : les mots se croisent (chaque mot
 * après le premier partage au moins une case avec les précédents), les cases
 * restantes reçoivent des lettres de remplissage. Réparation locale tant
 * qu'il reste des tracés parasites : redistribution d'une lettre de
 * remplissage quand le tracé en contient une, sinon remplacement d'un des
 * mots impliqués (retiré puis reposé ailleurs sous un autre mot).
 * @param {{candidates: Record<import("./config.js").Tier, string[]>, words5: Set<string>, prefixes5: Set<string>}} five
 * @param {import("./config.js").Difficulty} difficulty
 * @returns {{letters: string[], solution: string[], issues: number}|null}
 */
function attemptOverlapGrid(five, difficulty) {
  const picked = pickSolutionWords(five.candidates, difficulty);
  if (!picked) return null;
  const { words, tiers } = picked;

  /** @type {number[][]} */
  const paths = [];
  /** @type {(string|null)[]} */
  const partial = new Array(CELL_COUNT).fill(null);
  for (let i = 0; i < words.length; i++) {
    const path = placeWordPath(partial, words[i], i > 0);
    if (!path) return null;
    for (let k = 0; k < path.length; k++) partial[path[k]] = words[i][k];
    paths.push(path);
  }

  /** @type {string[]} */
  let letters = [];
  /** @type {Set<number>} */
  let fillers = new Set();
  // (Re)matérialise la grille depuis words/paths ; les lettres de
  // remplissage encore en place sont conservées (réparations comprises).
  function materialize() {
    /** @type {(string|null)[]} */
    const next = new Array(CELL_COUNT).fill(null);
    for (let i = 0; i < words.length; i++) {
      for (let k = 0; k < paths[i].length; k++) next[paths[i][k]] = words[i][k];
    }
    /** @type {Set<number>} */
    const nextFillers = new Set();
    for (let c = 0; c < CELL_COUNT; c++) {
      if (next[c] === null) {
        next[c] = fillers.has(c) ? letters[c] : drawLetter();
        nextFillers.add(c);
      }
    }
    letters = /** @type {string[]} */ (next);
    fillers = nextFillers;
  }
  materialize();

  const verify = () =>
    collectIssues(
      findFivePaths(letters, five.words5, five.prefixes5),
      new Map(words.map((w, i) => [w, canonKey(paths[i])])),
    );

  let issues = verify();
  for (let r = 0; r < MAX_GRID_REPAIRS && issues.length > 0; r++) {
    const fixable = issues.filter((p) => p.some((c) => fillers.has(c)));
    if (fixable.length > 0) {
      for (const path of fixable) {
        const cells = path.filter((c) => fillers.has(c));
        const cell = cells[(Math.random() * cells.length) | 0];
        letters[cell] = drawLetterOther(letters[cell]);
      }
    } else {
      // Tracé fautif entièrement sur les mots posés : remplacer un des
      // mots impliqués est la seule issue.
      const bad = issues[(Math.random() * issues.length) | 0];
      const involved = words
        .map((_, i) => i)
        .filter((i) => bad.some((c) => paths[i].includes(c)));
      const i = involved[(Math.random() * involved.length) | 0];
      /** @type {(string|null)[]} */
      const others = new Array(CELL_COUNT).fill(null);
      for (let j = 0; j < words.length; j++) {
        if (j === i) continue;
        for (let k = 0; k < paths[j].length; k++) {
          others[paths[j][k]] = words[j][k];
        }
      }
      /** @type {number[]|null} */
      let path = null;
      for (let g = 0; g < 12 && path === null; g++) {
        const repl = pickReplacementWord(five.candidates[tiers[i]], words, i);
        if (repl === null) break;
        path = placeWordPath(others, repl, true);
        if (path) words[i] = repl;
      }
      if (!path) break; // pas de remplaçant plaçable : on rend tel quel
      paths[i] = path;
      materialize();
    }
    issues = verify();
  }
  return { letters, solution: words.slice(), issues: issues.length };
}

/**
 * Tous les tracés de FIVE_WORD_LENGTH cases passant par `cell` dans les
 * cases libres : bras gauche + cell + bras droit, dédoublonnés (un tracé
 * et son inverse comptent pour un).
 * @param {number} cell
 * @param {Set<number>} free
 * @returns {number[][]}
 */
function pathsThrough(cell, free) {
  /** @type {Map<string, number[]>} */
  const out = new Map();
  const used = new Set([cell]);
  /** @type {number[]} */
  const left = [];
  /** @type {number[]} */
  const right = [];

  /** @param {number} need */
  function growRight(need) {
    if (need === 0) {
      const path = [...left].reverse().concat(cell, right);
      const key = canonKey(path);
      if (!out.has(key)) out.set(key, path);
      return;
    }
    const last = right.length > 0 ? right[right.length - 1] : cell;
    for (const nb of NEIGHBORS[last]) {
      if (!free.has(nb) || used.has(nb)) continue;
      used.add(nb);
      right.push(nb);
      growRight(need - 1);
      right.pop();
      used.delete(nb);
    }
  }

  /**
   * @param {number} need
   * @param {number} rightNeed
   */
  function growLeft(need, rightNeed) {
    if (need === 0) {
      growRight(rightNeed);
      return;
    }
    const last = left.length > 0 ? left[left.length - 1] : cell;
    for (const nb of NEIGHBORS[last]) {
      if (!free.has(nb) || used.has(nb)) continue;
      used.add(nb);
      left.push(nb);
      growLeft(need - 1, rightNeed);
      left.pop();
      used.delete(nb);
    }
  }

  for (let i = 0; i < FIVE_WORD_LENGTH; i++) {
    growLeft(i, FIVE_WORD_LENGTH - 1 - i);
  }
  return [...out.values()];
}

/**
 * Découpe la grille en WORDS_TO_WIN tracés de FIVE_WORD_LENGTH cases
 * couvrant les 25 cases (backtracking randomisé sur la plus petite case
 * libre). Un pavage existe toujours (les 5 lignes en sont un).
 * @returns {number[][]}
 */
function carveTiling() {
  const free = new Set(ALL_CELLS);
  /** @type {number[][]} */
  const paths = [];

  function carve() {
    if (free.size === 0) return true;
    let lowest = -1;
    for (const c of free) if (lowest < 0 || c < lowest) lowest = c;
    for (const path of shuffled(pathsThrough(lowest, free))) {
      for (const c of path) free.delete(c);
      paths.push(path);
      if (carve()) return true;
      paths.pop();
      for (const c of path) free.add(c);
    }
    return false;
  }

  carve();
  return paths;
}

/**
 * Tentative de grille « pavage parfait » : un pavage est découpé, les mots
 * y sont posés dans un sens aléatoire. Pas de case de remplissage, donc la
 * réparation locale remplace un mot impliqué dans un tracé parasite (les
 * tracés étant disjoints, changer un mot ne touche pas les autres).
 * @param {{candidates: Record<import("./config.js").Tier, string[]>, words5: Set<string>, prefixes5: Set<string>}} five
 * @param {import("./config.js").Difficulty} difficulty
 * @returns {{letters: string[], solution: string[], issues: number}|null}
 */
function attemptTilingGrid(five, difficulty) {
  const picked = pickSolutionWords(five.candidates, difficulty);
  if (!picked) return null;
  const { words, tiers } = picked;

  const paths = carveTiling().map((p) =>
    Math.random() < 0.5 ? [...p].reverse() : p,
  );
  const letters = new Array(CELL_COUNT).fill("");
  /** @type {number[]} case → index du mot qui l'occupe */
  const owner = new Array(CELL_COUNT).fill(0);
  /** @param {number} i */
  function writeWord(i) {
    for (let k = 0; k < paths[i].length; k++) {
      letters[paths[i][k]] = words[i][k];
      owner[paths[i][k]] = i;
    }
  }
  for (let i = 0; i < words.length; i++) writeWord(i);

  const verify = () =>
    collectIssues(
      findFivePaths(letters, five.words5, five.prefixes5),
      new Map(words.map((w, i) => [w, canonKey(paths[i])])),
    );

  let issues = verify();
  for (let r = 0; r < MAX_GRID_REPAIRS && issues.length > 0; r++) {
    /** @type {Set<number>} */
    const involved = new Set();
    for (const path of issues) for (const c of path) involved.add(owner[c]);
    const list = [...involved];
    const i = list[(Math.random() * list.length) | 0];
    const repl = pickReplacementWord(five.candidates[tiers[i]], words, i);
    if (repl === null) break;
    words[i] = repl;
    if (Math.random() < 0.5) paths[i] = [...paths[i]].reverse();
    writeWord(i);
    issues = verify();
  }
  return { letters, solution: words.slice(), issues: issues.length };
}

/**
 * Génère une grille pour un mode 5×5 : tirages successifs jusqu'à une
 * grille sans tracé fautif. Au-delà de MAX_FIVE_GRID_TRIES tentatives, la
 * grille la moins fautive rencontrée est rendue (avertissement en console).
 * @param {import("./config.js").Mode} mode "chevauchement" ou "pavage"
 * @param {{candidates: Record<import("./config.js").Tier, string[]>, words5: Set<string>, prefixes5: Set<string>}} five
 * @param {import("./config.js").Difficulty} difficulty
 * @returns {{ letters: string[], solution: string[], tries: number }}
 */
export function generateFiveGrid(mode, five, difficulty) {
  const attempt = mode === "pavage" ? attemptTilingGrid : attemptOverlapGrid;
  /** @type {{letters: string[], solution: string[], issues: number}|null} */
  let best = null;
  for (let t = 0; t < MAX_FIVE_GRID_TRIES; t++) {
    const result = attempt(five, difficulty);
    if (!result) continue;
    if (result.issues === 0) {
      return { letters: result.letters, solution: result.solution, tries: t + 1 };
    }
    if (!best || result.issues < best.issues) best = result;
  }
  if (!best) {
    // Paliers de vocabulaire trop pauvres pour composer la solution : ne
    // devrait jamais arriver avec les fichiers fournis.
    console.warn("Tracemot : génération 5×5 impossible, grille aléatoire.");
    return { letters: drawLetters(), solution: [], tries: MAX_FIVE_GRID_TRIES };
  }
  console.warn(
    `Tracemot : plafond de ${MAX_FIVE_GRID_TRIES} tentatives atteint - ` +
      `meilleure grille conservée (${best.issues} tracé(s) parasite(s)).`,
  );
  return { letters: best.letters, solution: best.solution, tries: MAX_FIVE_GRID_TRIES };
}

/**
 * Énumère tous les mots de `words` trouvables dans la grille, avec un tracé
 * (le premier rencontré) pour chacun. Même DFS que le solveur, sans arrêt
 * anticipé. Utilisé par le mode debug uniquement.
 * @param {string[]} letters
 * @param {Set<string>} words
 * @param {Set<string>} prefixes
 * @returns {Map<string, number[]>} mot → tracé (indices de cases)
 */
export function findAllWords(letters, words, prefixes) {
  /** @type {Map<string, number[]>} */
  const found = new Map();

  /**
   * @param {number} idx
   * @param {number} mask
   * @param {string} prefix
   * @param {number[]} path
   */
  function dfs(idx, mask, prefix, path) {
    const next = prefix + letters[idx];
    if (!prefixes.has(next)) return;
    path.push(idx);
    if (next.length >= MIN_WORD_LENGTH && words.has(next) && !found.has(next)) {
      found.set(next, path.slice());
    }
    for (const nb of NEIGHBORS[idx]) {
      const bit = 1 << nb;
      if (!(mask & bit)) dfs(nb, mask | bit, next, path);
    }
    path.pop();
  }

  for (let i = 0; i < CELL_COUNT; i++) dfs(i, 1 << i, "", []);
  return found;
}
