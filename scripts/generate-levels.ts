// Génération hors-ligne des 400 niveaux (4 modes × 4 sections × 25 niveaux).
// Écrit public/levels/<modeId>.json ; le runtime ne génère plus rien et ne
// charge plus de dictionnaire. Exécuté par Node 22 (les types sont strippés) :
//
//   node scripts/generate-levels.ts [--mode=8x8] [--section=3] [--only=1-7]
//                                   [--resume] [--dry-run]
//
// POURQUOI ce script re-vérifie tout au lieu de faire confiance au solveur :
// generate() peut rendre sa « meilleure grille imparfaite » après
// MAX_GRID_TRIES tentatives. Une grille livrée doit être parfaite (aucun tracé
// parasite, un seul tracé par mot), donc chaque grille est recontrôlée ici par
// un énumérateur INDÉPENDANT du solveur (DFS exhaustif sans élagage par
// préfixes, repris de tools/solver-check.mjs) — une régression du solveur ne
// peut pas se valider elle-même. Toute grille imparfaite est rejetée et le
// tirage relancé ; au-delà de MAX_DRAWS_PER_LEVEL tirages, le script échoue
// bruyamment plutôt que d'écrire une grille douteuse.
//
// DÉTERMINISME : le solveur tire dans Math.random(), écrasé par le PRNG seedé
// de ./seeded-random.ts (importé EN PREMIER — voir l'en-tête de ce module,
// l'ordre d'import fait l'invariant) et reseedé AVANT CHAQUE TIRAGE avec une
// graine dérivée de (modeId, id du niveau, numéro de tirage). Conséquence : un
// niveau ne dépend que de son identifiant — régénérer un sous-ensemble
// (--mode / --section / --only) reproduit exactement les mêmes grilles que le
// run complet, et le corpus est rejouable à l'identique.

// PREMIER IMPORT, impérativement : il installe le PRNG avant l'évaluation du
// solveur (les modules importés sont évalués avant le corps de celui-ci).
import { reseed } from "./seeded-random.ts";

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DIFFICULTY_QUOTAS,
  GAME_MODES,
  MODE_ORDER,
  bossMode,
} from "../src/game/config.ts";
import type {
  Difficulty,
  GameMode,
  ModeId,
  Section,
  Tier,
} from "../src/game/config.ts";
import { createGeometry } from "../src/game/geometry.ts";
import type { Geometry } from "../src/game/geometry.ts";
import {
  FULL_DICT_FILE,
  TIER_FILES,
  TIER_NAMES,
  buildLengthSets,
  parseWordList,
} from "../src/game/dictionary.ts";
import { canonKey, createGridGenerator } from "../src/game/solver.ts";
import type { SolverSets } from "../src/game/solver.ts";
import { BOSS_NUMBER, LEVELS_PER_SECTION, levelId } from "../src/game/levels.ts";
import type { LevelData, LevelId, ModeLevels } from "../src/game/levels.ts";

// --- Arguments ------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const ONLY_MODE = flag("mode") as ModeId | null;
const ONLY_SECTION = flag("section") ? Number(flag("section")) : null;
const ONLY_LEVEL = flag("only"); // ex. --only=4-25 (un seul niveau)
const RESUME = args.includes("--resume");
const DRY_RUN = args.includes("--dry-run");

if (ONLY_MODE && !MODE_ORDER.includes(ONLY_MODE)) {
  console.error(`Mode inconnu : ${ONLY_MODE}`);
  process.exit(1);
}

// Tirages complets (un tirage = un appel à generate(), soit jusqu'à
// MAX_GRID_TRIES tentatives internes) avant d'abandonner un niveau. Un tirage
// rendant une grille imparfaite est rejeté et relancé avec une autre graine.
// Plafond LOCAL au script : config.ts reste la référence du solveur.
const MAX_DRAWS_PER_LEVEL = 12;

// --- Dictionnaires (lus dans public/, comme tools/solver-check.mjs) --------

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, "public");
const OUT_DIR = path.join(PUBLIC, "levels");

function readWords(file: string): Set<string> {
  return parseWordList(readFileSync(path.join(PUBLIC, file), "utf8")).words;
}

const fullWords = readWords(FULL_DICT_FILE);
const tierWords = {} as Record<Tier, Set<string>>;
for (const tier of TIER_NAMES) tierWords[tier] = readWords(TIER_FILES[tier]);

// Un mode et son boss partagent wordLength : les sous-ensembles sont construits
// une fois par longueur (5, 6, 7, 8) et non par géométrie.
const setsByLength = new Map<number, SolverSets>();
function lengthSets(length: number): SolverSets {
  let s = setsByLength.get(length);
  if (!s) {
    s = buildLengthSets(fullWords, tierWords, length);
    setsByLength.set(length, s);
  }
  return s;
}

// --- Vérification indépendante du solveur ---------------------------------

/**
 * Tous les tracés de `length` cases dont le mot est dans `words`, par DFS
 * exhaustif (aucun élagage par préfixes : ne partage rien avec le solveur).
 * Retourne mot → Set de clés canoniques de tracés.
 */
function naiveFindPaths(
  geometry: Geometry,
  letters: string[],
  words: Set<string>,
  length: number,
): Map<string, Set<string>> {
  const { cellCount, neighbors } = geometry;
  const found = new Map<string, Set<string>>();
  const visited = new Uint8Array(cellCount);
  const stack: number[] = [];

  function dfs(idx: number) {
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

/**
 * Contrôle complet d'une grille candidate. Retourne la liste des motifs de
 * rejet (vide = grille livrable). Aucun raccourci : on revalide même ce que le
 * solveur garantit en théorie, c'est le seul filet avant l'écriture du JSON.
 */
function auditGrid(
  geometry: Geometry,
  mode: GameMode,
  sets: SolverSets,
  difficulty: Difficulty,
  letters: string[],
  solution: string[],
  paths: number[][],
): string[] {
  const bad: string[] = [];
  const { cellCount, neighbors } = geometry;
  const { wordLength, wordCount } = mode;

  if (letters.length !== cellCount) {
    bad.push(`${letters.length} lettres au lieu de ${cellCount}`);
    return bad; // le reste n'a plus de sens
  }
  if (!letters.every((l) => /^[A-Z]$/.test(l))) bad.push("lettre hors A-Z");
  if (solution.length !== wordCount || new Set(solution).size !== wordCount) {
    bad.push(`${solution.length} mots au lieu de ${wordCount} distincts`);
  }
  if (paths.length !== solution.length) {
    bad.push("paths désaligné de la solution");
    return bad;
  }

  // Tracés : longueur, cases valides et non répétées, contiguïté, et lettres
  // effectivement posées sur la grille. Pavage : union = toutes les cases.
  const covered = new Set<number>();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const w = solution[i];
    if (p.length !== wordLength) {
      bad.push(`tracé ${i} de ${p.length} cases au lieu de ${wordLength}`);
      continue;
    }
    for (let k = 0; k < p.length; k++) {
      const c = p[k];
      if (!Number.isInteger(c) || c < 0 || c >= cellCount) {
        bad.push(`tracé ${i} : case ${c} hors grille`);
        break;
      }
      if (covered.has(c)) bad.push(`case ${c} couverte deux fois`);
      covered.add(c);
      if (letters[c] !== w[k]) bad.push(`tracé ${i} : lettre ${k} ≠ « ${w} »`);
      if (k > 0 && !neighbors[p[k - 1]].includes(c)) {
        bad.push(`tracé ${i} : cases ${p[k - 1]} et ${c} non adjacentes`);
      }
    }
  }
  if (covered.size !== cellCount) {
    bad.push(`pavage incomplet (${covered.size}/${cellCount})`);
  }

  // Composition des paliers dans les quotas de la difficulté.
  const q = DIFFICULTY_QUOTAS[difficulty];
  for (const tier of ["ado", "adulte", "inconnu"] as const) {
    const count = solution.filter((w) => tierWords[tier].has(w)).length;
    const lo = Math.round(q[tier][0] * wordCount);
    const hi = Math.round(q[tier][1] * wordCount);
    if (count < lo || count > hi) {
      bad.push(`${count} mot(s) « ${tier} » hors quota [${lo}, ${hi}]`);
    }
  }

  // Exclusivité : les mots traçables sont exactement ceux de la solution,
  // chacun par un unique tracé, celui posé.
  const found = naiveFindPaths(geometry, letters, sets.words, wordLength);
  for (const [w, keys] of found) {
    const i = solution.indexOf(w);
    if (i < 0) {
      bad.push(`mot parasite « ${w} »`);
      continue;
    }
    if (keys.size > 1) bad.push(`« ${w} » traçable de ${keys.size} façons`);
    if (!keys.has(canonKey(paths[i]))) {
      bad.push(`« ${w} » : tracé posé introuvable`);
    }
  }
  for (const w of solution) {
    if (!found.has(w)) bad.push(`« ${w} » de la solution introuvable`);
  }

  return bad;
}

// --- Génération -----------------------------------------------------------

interface Stats {
  draws: number;
  ms: number;
}

function makeLevel(
  modeId: ModeId,
  id: LevelId,
  mode: GameMode,
  difficulty: Difficulty,
): { data: LevelData; stats: Stats } {
  const geometry = createGeometry(mode.rows, mode.cols);
  const sets = lengthSets(mode.wordLength);
  const generator = createGridGenerator(geometry, mode, sets);
  const t0 = performance.now();

  for (let draw = 1; draw <= MAX_DRAWS_PER_LEVEL; draw++) {
    reseed(`${modeId}|${id}|${draw}`);
    const { letters, solution, paths } = generator.generate(difficulty);
    const bad = auditGrid(
      geometry,
      mode,
      sets,
      difficulty,
      letters,
      solution,
      paths,
    );
    if (bad.length === 0) {
      return {
        data: { id, letters: letters.join(""), words: solution, paths },
        stats: { draws: draw, ms: performance.now() - t0 },
      };
    }
    console.warn(
      `    ${id} : tirage ${draw} rejeté — ${bad.slice(0, 3).join(" ; ")}` +
        (bad.length > 3 ? ` (+${bad.length - 3})` : ""),
    );
  }

  throw new Error(
    `Tracemot : ${modeId} / niveau ${id} — aucune grille parfaite en ` +
      `${MAX_DRAWS_PER_LEVEL} tirages. Relever MAX_DRAWS_PER_LEVEL ou ` +
      `assouplir les quotas de la difficulté ${difficulty}.`,
  );
}

/** Clés triées (section, puis numéro) : à contenu égal, octets égaux — quel
 *  que soit l'ordre dans lequel les niveaux ont été (re)générés. */
function sortLevels(levels: Record<LevelId, LevelData>): Record<
  LevelId,
  LevelData
> {
  const out: Record<LevelId, LevelData> = {};
  for (const key of Object.keys(levels).sort((a, b) => {
    const [sa, na] = a.split("-").map(Number);
    const [sb, nb] = b.split("-").map(Number);
    return sa - sb || na - nb;
  })) {
    out[key] = levels[key];
  }
  return out;
}

/**
 * Sérialisation : UN NIVEAU PAR LIGNE. Le fichier est téléchargé par le jeu
 * (donc pas d'indentation à quatre niveaux), mais il est aussi versionné et
 * régénérable niveau par niveau (--only) : un JSON.stringify() nu mettrait les
 * 100 niveaux sur UNE seule ligne, et régénérer un niveau produirait un diff
 * illisible de 45 ko. Une ligne par niveau coûte 100 octets et rend le diff
 * exact. Le format reste du JSON strict, relu tel quel par levels.ts.
 */
function serialize(payload: ModeLevels): string {
  const lines = Object.entries(payload.levels).map(
    ([id, level]) => `${JSON.stringify(id)}:${JSON.stringify(level)}`,
  );
  return (
    `{"modeId":${JSON.stringify(payload.modeId)},"levels":{\n` +
    lines.join(",\n") +
    "\n}}\n"
  );
}

/**
 * Écrit le fichier du mode. Appelé après CHAQUE section, et non une seule fois
 * en fin de mode : makeLevel jette dès qu'un niveau résiste, et un mode complet
 * se compte en minutes — un échec (ou un Ctrl-C) au niveau 3-17 perdait sinon
 * les 66 niveaux déjà calculés, et --resume, dont c'est toute la raison d'être,
 * n'avait rien à reprendre.
 */
function writeMode(modeId: ModeId, levels: Record<LevelId, LevelData>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, `${modeId}.json`),
    serialize({ modeId, levels: sortLevels(levels) }),
    "utf8",
  );
}

function readExisting(modeId: ModeId): Record<LevelId, LevelData> {
  const file = path.join(OUT_DIR, `${modeId}.json`);
  if (!existsSync(file)) return {};
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as ModeLevels;
    return data.levels ?? {};
  } catch {
    return {};
  }
}

const totalT0 = performance.now();
let grandDraws = 0;
let grandLevels = 0;

for (const modeId of MODE_ORDER) {
  if (ONLY_MODE && modeId !== ONLY_MODE) continue;
  const mode = GAME_MODES[modeId];
  const boss = bossMode(mode);
  const levels = readExisting(modeId);
  const modeT0 = performance.now();
  let modeDraws = 0;
  let modeLevels = 0;

  console.log(
    `\n=== Mode ${modeId} — grilles ${mode.rows}×${mode.cols} ` +
      `(${mode.wordCount}×${mode.wordLength}), boss ${boss.rows}×${boss.cols} ` +
      `(${boss.wordCount}×${boss.wordLength})`,
  );

  for (const section of [1, 2, 3, 4] as Section[]) {
    if (ONLY_SECTION && section !== ONLY_SECTION) continue;
    const difficulty: Difficulty = section; // section s ⇒ difficulté s
    const sectionT0 = performance.now();
    let sectionDraws = 0;
    let done = 0;

    for (let n = 1; n <= LEVELS_PER_SECTION; n++) {
      const id = levelId(section, n);
      if (ONLY_LEVEL && id !== ONLY_LEVEL) continue;
      if (RESUME && levels[id]) continue;
      const { data, stats } = makeLevel(
        modeId,
        id,
        n === BOSS_NUMBER ? boss : mode,
        difficulty,
      );
      levels[id] = data;
      sectionDraws += stats.draws;
      done++;
      if (n === BOSS_NUMBER) {
        console.log(
          `    boss ${id} : ${stats.draws} tirage(s), ` +
            `${(stats.ms / 1000).toFixed(1)} s`,
        );
      }
    }

    if (done === 0) continue;
    if (!DRY_RUN) writeMode(modeId, levels); // point de reprise (cf. writeMode)
    const ms = performance.now() - sectionT0;
    console.log(
      `  section ${section} (difficulté ${difficulty}) : ${done} niveau(x), ` +
        `${(sectionDraws / done).toFixed(2)} tirage(s)/niveau, ` +
        `${(ms / 1000).toFixed(1)} s`,
    );
    modeDraws += sectionDraws;
    modeLevels += done;
  }

  if (modeLevels === 0) {
    console.log("  (rien à générer)");
    continue;
  }
  grandDraws += modeDraws;
  grandLevels += modeLevels;
  console.log(
    `  → ${modeLevels} niveau(x) en ${((performance.now() - modeT0) / 1000).toFixed(1)} s`,
  );

  if (DRY_RUN) {
    console.log("  (--dry-run : rien n'est écrit)");
    continue;
  }
  // Le fichier est déjà à jour (écrit après chaque section) : on ne fait ici
  // que le mesurer pour le rapport.
  const file = path.join(OUT_DIR, `${modeId}.json`);
  const kb = (readFileSync(file).length / 1024).toFixed(0);
  console.log(
    `  écrit ${path.relative(ROOT, file)} — ` +
      `${Object.keys(levels).length} niveaux, ${kb} ko`,
  );
}

console.log(
  `\nTotal : ${grandLevels} niveau(x), ${grandDraws} tirage(s), ` +
    `${((performance.now() - totalT0) / 1000).toFixed(1)} s`,
);
