// @ts-check
// Harnais de vérification du solveur : génère N grilles par mode et par
// difficulté, et vérifie les invariants du contrat « pavage parfait » avec
// un énumérateur de tracés INDÉPENDANT du solveur (DFS naïf sans élagage
// par préfixes) — une régression dans findWordPaths ne peut donc pas se
// valider elle-même. Rapporte tirages et temps par grille (profilage).
//
//   node tools/solver-check.mjs [N] [mode]
//   N : grilles par cas (défaut 20) ; mode : limite à un mode (ex. double)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { DIFFICULTY_QUOTAS, GAME_MODES } from "../js/config.js";
import { createGeometry } from "../js/geometry.js";
import {
  FULL_DICT_FILE,
  TIER_FILES,
  TIER_NAMES,
  buildLengthSets,
  parseWordList,
} from "../js/dictionary.js";
import { canonKey, createGridGenerator } from "../js/solver.js";

// Les dictionnaires vivent dans public/ (servis à la racine par Vite).
const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);
const GRIDS_PER_CASE = Number(process.argv[2]) || 20;
const MODE_FILTER = process.argv[3];
/** @type {import("../js/config.js").Difficulty[]} */
const DIFFICULTIES = [1, 2, 3, 4, 5];

/** @param {string} file */
function readWords(file) {
  return parseWordList(readFileSync(path.join(ROOT, file), "utf8")).words;
}

const fullWords = readWords(FULL_DICT_FILE);
/** @type {Record<import("../js/config.js").Tier, Set<string>>} */
const tierWords = /** @type {any} */ ({});
for (const tier of TIER_NAMES) tierWords[tier] = readWords(TIER_FILES[tier]);

/**
 * Énumérateur indépendant : tous les tracés de `length` cases dont le mot est
 * dans `words`, par DFS exhaustif (sans préfixes). Retourne mot → Set de clés
 * canoniques de tracés.
 * @param {import("../js/geometry.js").Geometry} geometry
 * @param {string[]} letters
 * @param {Set<string>} words
 * @param {number} length
 */
function naiveFindPaths(geometry, letters, words, length) {
  const { cellCount, neighbors } = geometry;
  /** @type {Map<string, Set<string>>} */
  const found = new Map();
  const visited = new Uint8Array(cellCount);
  /** @type {number[]} */
  const stack = [];

  /** @param {number} idx */
  function dfs(idx) {
    visited[idx] = 1;
    stack.push(idx);
    if (stack.length === length) {
      const word = stack.map((i) => letters[i]).join("");
      if (words.has(word)) {
        let keys = found.get(word);
        if (!keys) found.set(word, (keys = new Set()));
        keys.add(canonKey(stack));
      }
    } else {
      for (const nb of neighbors[idx]) if (!visited[nb]) dfs(nb);
    }
    stack.pop();
    visited[idx] = 0;
  }

  for (let i = 0; i < cellCount; i++) dfs(i);
  return found;
}

let failures = 0;
/**
 * @param {boolean} ok
 * @param {string} label
 */
function check(ok, label) {
  if (!ok) {
    failures++;
    console.error(`  ÉCHEC : ${label}`);
  }
}

for (const [modeId, mode] of Object.entries(GAME_MODES)) {
  if (MODE_FILTER && modeId !== MODE_FILTER) continue;
  const geometry = createGeometry(mode.rows, mode.cols);
  const sets = buildLengthSets(fullWords, tierWords, mode.wordLength);
  console.log(
    `\nMode « ${modeId} » : ${mode.rows}×${mode.cols}, ` +
      `${mode.wordCount} mots de ${mode.wordLength} lettres — viviers : ` +
      TIER_NAMES.map((t) => `${t} ${sets.candidates[t].length}`).join(", "),
  );
  const generator = createGridGenerator(geometry, mode, sets);

  for (const difficulty of DIFFICULTIES) {
    let totalTries = 0;
    let totalMs = 0;
    let maxMs = 0;
    let imperfect = 0;

    for (let n = 0; n < GRIDS_PER_CASE; n++) {
      const t0 = performance.now();
      const { letters, solution, tries } = generator.generate(difficulty);
      const ms = performance.now() - t0;
      totalTries += tries;
      totalMs += ms;
      if (ms > maxMs) maxMs = ms;

      const tag = `difficulté ${difficulty}, grille ${n + 1}`;
      check(
        letters.length === geometry.cellCount &&
          letters.every((l) => /^[A-Z]$/.test(l)),
        `${tag} : ${geometry.cellCount} lettres A-Z attendues`,
      );
      check(
        solution.length === mode.wordCount &&
          new Set(solution).size === mode.wordCount,
        `${tag} : ${mode.wordCount} mots distincts attendus`,
      );
      check(
        solution.every(
          (w) => w.length === mode.wordLength && fullWords.has(w),
        ),
        `${tag} : mots de ${mode.wordLength} lettres du dictionnaire attendus`,
      );

      // Composition des paliers dans les quotas (fractions arrondies).
      const q = DIFFICULTY_QUOTAS[difficulty];
      for (const tier of /** @type {const} */ (["ado", "adulte", "inconnu"])) {
        const count = solution.filter((w) => tierWords[tier].has(w)).length;
        const lo = Math.round(q[tier][0] * mode.wordCount);
        const hi = Math.round(q[tier][1] * mode.wordCount);
        check(
          count >= lo && count <= hi,
          `${tag} : ${count} mot(s) « ${tier} » hors quota [${lo}, ${hi}]`,
        );
      }

      // Vérification indépendante : les mots traçables sont exactement ceux
      // de la solution, chacun par un unique tracé, et l'union des tracés
      // couvre la grille (pavage). Tolérance : le générateur peut rendre sa
      // meilleure grille imparfaite après MAX_GRID_TRIES (compté à part).
      const found = naiveFindPaths(
        geometry,
        letters,
        sets.words,
        mode.wordLength,
      );
      const words = [...found.keys()];
      const extra = words.filter((w) => !solution.includes(w));
      const multi = words.filter(
        (w) => (found.get(w)?.size ?? 0) > 1,
      );
      const missing = solution.filter((w) => !found.has(w));
      check(missing.length === 0, `${tag} : solution introuvable ${missing}`);
      if (extra.length > 0 || multi.length > 0) {
        imperfect++;
      } else if (missing.length === 0) {
        const covered = new Set();
        for (const w of solution) {
          for (const c of /** @type {string} */ (
            [...(found.get(w) ?? [])][0]
          ).split(","))
            covered.add(Number(c));
        }
        check(
          covered.size === geometry.cellCount,
          `${tag} : pavage incomplet (${covered.size}/${geometry.cellCount})`,
        );
      }
    }

    console.log(
      `  difficulté ${difficulty} : ${GRIDS_PER_CASE} grilles, ` +
        `${(totalTries / GRIDS_PER_CASE).toFixed(1)} tirage(s)/grille, ` +
        `${(totalMs / GRIDS_PER_CASE).toFixed(0)} ms/grille ` +
        `(max ${maxMs.toFixed(0)} ms)` +
        (imperfect > 0 ? ` — ${imperfect} grille(s) imparfaite(s)` : ""),
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nTous les invariants sont vérifiés.");
