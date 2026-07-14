// Tirage des lettres et solveur. Logique pure : aucune dépendance au DOM
// ni à l'état de la partie. La géométrie de la grille, le mode de jeu et
// les dictionnaires sont passés en paramètres — createGridGenerator
// fabrique un générateur fermé sur ces réglages.

import {
  DIFFICULTY_QUOTAS,
  LETTER_WEIGHTS,
  MAX_GRID_TRIES,
  GRID_REPAIRS_PER_WORD,
  MIN_WORD_LENGTH,
  REPAIR_CANDIDATES,
} from "./config.ts";
import type { GameMode, Tier, Difficulty } from "./config.ts";
import type { Geometry } from "./geometry.ts";

// --- Tirage pondéré des lettres ---------------------------------------

const WEIGHTED_LETTERS = Object.keys(LETTER_WEIGHTS);
const WEIGHT_TOTAL = WEIGHTED_LETTERS.reduce(
  (s, l) => s + LETTER_WEIGHTS[l],
  0,
);

function drawLetter(): string {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const letter of WEIGHTED_LETTERS) {
    r -= LETTER_WEIGHTS[letter];
    if (r < 0) return letter;
  }
  return "E";
}

function drawLetters(count: number): string[] {
  return Array.from({ length: count }, drawLetter);
}

// --- Utilitaires --------------------------------------------------------

/** copie mélangée (Fisher-Yates) */
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Un tracé et son inverse comptent pour un seul tracé : la clé canonique
// est identique dans les deux sens (évite de compter deux fois les
// palindromes, et permet de comparer un tracé trouvé au tracé posé).
export function canonKey(path: number[]): string {
  const fwd = path.join(",");
  const rev = [...path].reverse().join(",");
  return fwd < rev ? fwd : rev;
}

/**
 * Nombre de positions où deux mots de même longueur diffèrent.
 */
function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function randInt(lo: number, hi: number): number {
  return lo + ((Math.random() * (hi - lo + 1)) | 0);
}

// --- Générateur de grilles « pavage parfait » -----------------------------
//
// La grille garantit qu'exactement wordCount mots de wordLength lettres
// sont traçables - ceux de la solution, choisis dans les paliers de
// vocabulaire dosés par la difficulté - vérifié contre le dictionnaire
// complet, chaque mot n'ayant qu'un seul tracé possible. Génération par
// tirage + vérification : on découpe un pavage, on y pose les mots, on
// contrôle l'exclusivité et on remplace un mot impliqué dans un tracé
// parasite jusqu'à obtenir une grille propre.

/**
 * Sous-ensembles « wordLength lettres » des dictionnaires : mots candidats
 * par palier (les mots à cacher) et mots/préfixes du dictionnaire complet
 * (vérification qu'aucun mot parasite n'est traçable).
 */
export interface SolverSets {
  candidates: Record<Tier, string[]>;
  words: Set<string>;
  prefixes: Set<string>;
}

// Les plafonds du générateur (MAX_GRID_TRIES, GRID_REPAIRS_PER_WORD,
// REPAIR_CANDIDATES) sont lus dans config.ts, seule référence : ils valent pour
// le jeu comme pour le script de génération hors-ligne, qui doit produire des
// grilles avec exactement le budget que le solveur s'accorde.
export function createGridGenerator(
  geometry: Geometry,
  mode: GameMode,
  sets: SolverSets,
) {
  const { cellCount, neighbors, allCells } = geometry;
  const { wordLength, wordCount } = mode;
  const { candidates, words: fullWords, prefixes } = sets;

  /**
   * Tire la composition des mots cachés pour une difficulté : nombre de mots
   * par palier, dans les bornes des quotas (fractions de wordCount arrondies
   * au plus proche), le reste en mots enfant. Les paliers les plus contraints
   * (inconnu, adulte) sont tirés d'abord, les quotas suivants sont plafonnés
   * aux places restantes.
   */
  function drawTierCounts(difficulty: Difficulty): Record<Tier, number> {
    const q = DIFFICULTY_QUOTAS[difficulty];
    const scale = (f: number) => Math.round(f * wordCount);
    let left = wordCount;
    const inconnu = randInt(
      scale(q.inconnu[0]),
      Math.min(scale(q.inconnu[1]), left),
    );
    left -= inconnu;
    const adulte = randInt(
      scale(q.adulte[0]),
      Math.min(scale(q.adulte[1]), left),
    );
    left -= adulte;
    const ado = randInt(
      Math.min(scale(q.ado[0]), left),
      Math.min(scale(q.ado[1]), left),
    );
    left -= ado;
    return { enfant: left, ado, adulte, inconnu };
  }

  /**
   * Tire wordCount mots candidats respectant la composition de la
   * difficulté, deux à deux distants d'au moins 2 lettres (pas de
   * SALLE/BALLE dans la même solution). `tiers[i]` est le palier du mot
   * `words[i]` : un remplacement (réparation) se fait dans le même palier
   * pour préserver la composition.
   */
  function pickSolutionWords(
    difficulty: Difficulty,
  ): { words: string[]; tiers: Tier[] } | null {
    for (let t = 0; t < 50; t++) {
      const counts = drawTierCounts(difficulty);
      const tiers: Tier[] = [];
      for (const tier of Object.keys(counts) as Tier[]) {
        if (candidates[tier].length < counts[tier]) break; // palier trop pauvre
        for (let k = 0; k < counts[tier]; k++) tiers.push(tier);
      }
      if (tiers.length !== wordCount) continue;
      const chosen: string[] = [];
      for (let g = 0; g < 40 * wordCount && chosen.length < wordCount; g++) {
        const pool = candidates[tiers[chosen.length]];
        const w = pool[(Math.random() * pool.length) | 0];
        if (chosen.every((c) => hamming(c, w) >= 2)) chosen.push(w);
      }
      if (chosen.length === wordCount) return { words: chosen, tiers };
    }
    return null;
  }

  /**
   * Énumère tous les mots de wordLength lettres du dictionnaire complet
   * traçables dans la grille, avec leurs tracés canoniques.
   * Retourne mot → (clé canonique → tracé).
   */
  function findWordPaths(letters: string[]): Map<string, Map<string, number[]>> {
    const found: Map<string, Map<string, number[]>> = new Map();
    const visited = new Uint8Array(cellCount);

    function dfs(idx: number, prefix: string, path: number[]) {
      const next = prefix + letters[idx];
      if (!prefixes.has(next)) return;
      visited[idx] = 1;
      path.push(idx);
      if (path.length === wordLength) {
        if (fullWords.has(next)) {
          let paths = found.get(next);
          if (!paths) found.set(next, (paths = new Map()));
          const key = canonKey(path);
          if (!paths.has(key)) paths.set(key, path.slice());
        }
      } else {
        for (const nb of neighbors[idx]) {
          if (!visited[nb]) dfs(nb, next, path);
        }
      }
      path.pop();
      visited[idx] = 0;
    }

    for (let i = 0; i < cellCount; i++) dfs(i, "", []);
    return found;
  }

  /**
   * Tracés fautifs d'une grille : tout tracé d'un mot hors solution, et tout
   * tracé d'un mot de la solution autre que celui posé. Une grille est valide
   * quand cette liste est vide.
   * `intended` : mot de la solution → clé canonique du tracé posé.
   */
  function collectIssues(
    found: Map<string, Map<string, number[]>>,
    intended: Map<string, string>,
  ): number[][] {
    const issues: number[][] = [];
    for (const [word, paths] of found) {
      const wanted = intended.get(word);
      for (const [key, path] of paths) {
        if (key !== wanted) issues.push(path);
      }
    }
    return issues;
  }

  /**
   * Mot de remplacement pour la position `i` de la solution : distinct des
   * mots en place et à distance de Hamming ≥ 2 de chacun des autres.
   * `pool` est le vivier du palier du mot remplacé (la composition de la
   * difficulté est ainsi préservée).
   */
  function pickReplacementWord(
    pool: string[],
    words: string[],
    i: number,
  ): string | null {
    for (let g = 0; g < 100; g++) {
      const w = pool[(Math.random() * pool.length) | 0];
      if (words.includes(w)) continue;
      if (words.every((c, j) => j === i || hamming(c, w) >= 2)) return w;
    }
    return null;
  }

  /**
   * Tous les tracés de wordLength cases passant par `cell` dans les cases
   * libres : bras gauche + cell + bras droit, dédoublonnés (un tracé et son
   * inverse comptent pour un).
   */
  function pathsThrough(cell: number, free: Set<number>): number[][] {
    const out: Map<string, number[]> = new Map();
    const used = new Set([cell]);
    const left: number[] = [];
    const right: number[] = [];

    function growRight(need: number) {
      if (need === 0) {
        const path = [...left].reverse().concat(cell, right);
        const key = canonKey(path);
        if (!out.has(key)) out.set(key, path);
        return;
      }
      const last = right.length > 0 ? right[right.length - 1] : cell;
      for (const nb of neighbors[last]) {
        if (!free.has(nb) || used.has(nb)) continue;
        used.add(nb);
        right.push(nb);
        growRight(need - 1);
        right.pop();
        used.delete(nb);
      }
    }

    function growLeft(need: number, rightNeed: number) {
      if (need === 0) {
        growRight(rightNeed);
        return;
      }
      const last = left.length > 0 ? left[left.length - 1] : cell;
      for (const nb of neighbors[last]) {
        if (!free.has(nb) || used.has(nb)) continue;
        used.add(nb);
        left.push(nb);
        growLeft(need - 1, rightNeed);
        left.pop();
        used.delete(nb);
      }
    }

    for (let i = 0; i < wordLength; i++) {
      growLeft(i, wordLength - 1 - i);
    }
    return [...out.values()];
  }

  /**
   * Découpe la grille en wordCount tracés de wordLength cases couvrant
   * toutes les cases (backtracking randomisé sur la plus petite case libre).
   * Un pavage existe toujours dès que wordLength divise rows ou cols (les
   * lignes ou colonnes en sont un).
   */
  function carveTiling(): number[][] {
    const free = new Set(allCells);
    const paths: number[][] = [];

    // Budget de nœuds du backtracking. Le pavage est trouvé en quelques
    // dizaines de nœuds dans l'immense majorité des tirages, mais une branche
    // malheureuse peut partir en exploration exhaustive : sur une grille de
    // défi (14×14, 16×16) une seule mauvaise graine bloquait la génération
    // pendant des dizaines de minutes. Au-delà du budget, le pavage est
    // abandonné (paths incomplet) et la tentative repart sur un autre tirage —
    // c'est un abandon, pas un échec : la relance coûte quelques ms.
    let budget = 40 * cellCount;

    // Élagage : un pavage n'est possible que si chaque composante connexe
    // de cases libres a une taille multiple de wordLength. Sans ce test, un
    // tracé qui enclave une poche impossible à paver n'est découvert que
    // bien plus tard, et le backtracking explose sur les grandes grilles
    // (le 8×8 en serpents de 8 passait de quelques ms à plusieurs minutes).
    const seen = new Uint8Array(cellCount);
    function componentsOk() {
      seen.fill(0);
      for (const start of free) {
        if (seen[start]) continue;
        seen[start] = 1;
        let size = 0;
        const queue = [start];
        while (queue.length > 0) {
          const c = queue.pop() as number;
          size++;
          for (const nb of neighbors[c]) {
            if (free.has(nb) && !seen[nb]) {
              seen[nb] = 1;
              queue.push(nb);
            }
          }
        }
        if (size % wordLength !== 0) return false;
      }
      return true;
    }

    function carve(): boolean {
      if (free.size === 0) return true;
      if (--budget < 0) return false;
      let lowest = -1;
      for (const c of free) if (lowest < 0 || c < lowest) lowest = c;
      for (const path of shuffled(pathsThrough(lowest, free))) {
        for (const c of path) free.delete(c);
        if (componentsOk()) {
          paths.push(path);
          if (carve()) return true;
          paths.pop();
        }
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
   */
  function attemptTilingGrid(difficulty: Difficulty): {
    letters: string[];
    solution: string[];
    paths: number[][];
    issues: number;
  } | null {
    const picked = pickSolutionWords(difficulty);
    if (!picked) return null;
    const { words, tiers } = picked;

    const carved = carveTiling();
    // Budget de backtracking épuisé : pavage incomplet, tentative abandonnée.
    if (carved.length !== wordCount) return null;
    const paths = carved.map((p) =>
      Math.random() < 0.5 ? [...p].reverse() : p,
    );
    const letters: string[] = new Array(cellCount).fill("");
    /** case → index du mot qui l'occupe */
    const owner: number[] = new Array(cellCount).fill(0);
    function writeWord(i: number) {
      for (let k = 0; k < paths[i].length; k++) {
        letters[paths[i][k]] = words[i][k];
        owner[paths[i][k]] = i;
      }
    }
    for (let i = 0; i < words.length; i++) writeWord(i);

    const verify = () =>
      collectIssues(
        findWordPaths(letters),
        new Map(words.map((w, i) => [w, canonKey(paths[i])])),
      );

    // Réparation par hill-climbing : à chaque ronde, un mot impliqué dans un
    // tracé parasite est mis en concurrence avec REPAIR_CANDIDATES
    // remplaçants (sens de pose aléatoire) ; le candidat laissant le moins
    // de tracés parasites est retenu, à égalité comprise (mouvement latéral,
    // pour ne pas rester coincé sur un plateau), sinon on revient au mot en
    // place. Un remplacement aveugle suffit sur 25 cases mais ne converge
    // pas sur les grandes grilles, où les tracés parasites abondent.
    let issues = verify();
    const maxRepairs = GRID_REPAIRS_PER_WORD * wordCount;
    for (let r = 0; r < maxRepairs && issues.length > 0; r++) {
      const involved: Set<number> = new Set();
      for (const path of issues) for (const c of path) involved.add(owner[c]);
      const list = [...involved];
      const i = list[(Math.random() * list.length) | 0];
      const origWord = words[i];
      const origPath = paths[i];
      let best: { word: string; path: number[]; issues: number[][] } | null =
        null;
      for (let k = 0; k < REPAIR_CANDIDATES; k++) {
        const repl = pickReplacementWord(candidates[tiers[i]], words, i);
        if (repl === null) break;
        words[i] = repl;
        paths[i] = Math.random() < 0.5 ? [...origPath].reverse() : origPath;
        writeWord(i);
        const cand = verify();
        if (!best || cand.length < best.issues.length) {
          best = { word: repl, path: paths[i], issues: cand };
        }
        if (cand.length < issues.length) break; // amélioration : adoptée
      }
      if (!best) {
        // Vivier épuisé : on restaure le mot en place et on s'arrête là.
        words[i] = origWord;
        paths[i] = origPath;
        writeWord(i);
        break;
      }
      if (best.issues.length <= issues.length) {
        words[i] = best.word;
        paths[i] = best.path;
        issues = best.issues;
      } else {
        words[i] = origWord;
        paths[i] = origPath;
      }
      writeWord(i);
    }
    // Les tracés sont copiés : `paths[i]` peut pointer sur le tableau d'un
    // essai de réparation, qu'une tentative ultérieure réutiliserait.
    return {
      letters,
      solution: words.slice(),
      paths: paths.map((p) => p.slice()),
      issues: issues.length,
    };
  }

  /**
   * Génère une grille de pavage parfait : tirages successifs jusqu'à une
   * grille sans tracé fautif. Au-delà de MAX_GRID_TRIES tentatives, la
   * grille la moins fautive rencontrée est rendue (avertissement en console).
   *
   * `paths` est le tracé posé de chaque mot, aligné sur `solution` : le script
   * de génération des niveaux le fige dans le JSON (le runtime n'a plus à le
   * redécouvrir). Cas dégradé (grille aléatoire de repli) : solution et paths
   * sont vides ensemble — jamais désalignés.
   */
  function generate(difficulty: Difficulty): {
    letters: string[];
    solution: string[];
    paths: number[][];
    tries: number;
  } {
    let best: {
      letters: string[];
      solution: string[];
      paths: number[][];
      issues: number;
    } | null = null;
    for (let t = 0; t < MAX_GRID_TRIES; t++) {
      const result = attemptTilingGrid(difficulty);
      if (!result) continue;
      if (result.issues === 0) {
        return {
          letters: result.letters,
          solution: result.solution,
          paths: result.paths,
          tries: t + 1,
        };
      }
      if (!best || result.issues < best.issues) best = result;
    }
    if (!best) {
      // Paliers de vocabulaire trop pauvres pour composer la solution : ne
      // devrait jamais arriver avec les fichiers fournis.
      console.warn(
        "Tracemot : génération du pavage impossible, grille aléatoire.",
      );
      return {
        letters: drawLetters(cellCount),
        solution: [],
        paths: [],
        tries: MAX_GRID_TRIES,
      };
    }
    console.warn(
      `Tracemot : plafond de ${MAX_GRID_TRIES} tentatives atteint - ` +
        `meilleure grille conservée (${best.issues} tracé(s) parasite(s)).`,
    );
    return {
      letters: best.letters,
      solution: best.solution,
      paths: best.paths,
      tries: MAX_GRID_TRIES,
    };
  }

  return { generate };
}

/**
 * Énumère tous les mots de `words` trouvables dans la grille, avec un tracé
 * (le premier rencontré) pour chacun. Même DFS que le solveur, sans arrêt
 * anticipé. Utilisé par le mode debug uniquement.
 * Retourne mot → tracé (indices de cases).
 */
export function findAllWords(
  geometry: Geometry,
  letters: string[],
  words: Set<string>,
  prefixes: Set<string>,
): Map<string, number[]> {
  const { cellCount, neighbors } = geometry;
  const found: Map<string, number[]> = new Map();
  const visited = new Uint8Array(cellCount);

  function dfs(idx: number, prefix: string, path: number[]) {
    const next = prefix + letters[idx];
    if (!prefixes.has(next)) return;
    visited[idx] = 1;
    path.push(idx);
    if (next.length >= MIN_WORD_LENGTH && words.has(next) && !found.has(next)) {
      found.set(next, path.slice());
    }
    for (const nb of neighbors[idx]) {
      if (!visited[nb]) dfs(nb, next, path);
    }
    path.pop();
    visited[idx] = 0;
  }

  for (let i = 0; i < cellCount; i++) dfs(i, "", []);
  return found;
}
