// Génération hors-ligne des 288 niveaux (4 modes × 4 sections × 18 niveaux :
// 15 normaux en 3 lignes de 5, plus les 3 défis A/B/C qui closent ces lignes).
// Écrit packages/game/public/levels/<modeId>.json (que le jeu embarque) ; le
// runtime ne génère plus rien et ne charge plus de dictionnaire. Exécuté par
// Node 22 (les types sont strippés) :
//
//   npm run generate:levels -- [--mode=8x8] [--section=3] [--only=1-7]
//                              [--resume] [--dry-run]
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
// run complet, et le corpus est rejouable à l'identique. C'est aussi ce qui
// permet de RÉUTILISER (--resume) les normaux déjà générés : leurs
// identifiants « 1-1 » … « 1-15 » n'ont pas bougé, seuls les défis sont neufs.

// PREMIER IMPORT, impérativement : il installe le PRNG avant l'évaluation du
// solveur (les modules importés sont évalués avant le corps de celui-ci).
import { reseed } from "../src/seeded-random.ts";

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DIFFICULTY_QUOTAS,
  GAME_MODES,
  MODE_ORDER,
  defiMode,
} from "@tracemot/core";
import type {
  Difficulty,
  GameMode,
  ModeId,
  Section,
  Tier,
} from "@tracemot/core";
import { createGeometry } from "@tracemot/core";
import type { Geometry } from "@tracemot/core";
import {
  FULL_DICT_FILE,
  TIER_FILES,
  TIER_NAMES,
  buildLengthSets,
  parseWordList,
} from "../src/dictionary.ts";
import { canonKey, createGridGenerator } from "../src/solver.ts";
import type { SolverSets } from "../src/solver.ts";
import {
  DEFI_KEYS,
  NORMALS_PER_SECTION,
  allLevelIds,
  compareLevelIds,
  defiId,
  levelId,
} from "@tracemot/core";
import type {
  DefiKey,
  LevelData,
  LevelId,
  ModeLevels,
} from "@tracemot/core";

// --- Plan canonique -------------------------------------------------------

// Les 72 identifiants d'un mode (identiques d'un mode à l'autre : seule la
// géométrie change). Sert à trois choses : valider --only, ordonner le fichier,
// et ÉLAGUER à l'écriture tout id hors plan (cf. writeMode).
const PLAN = allLevelIds();
const PLAN_SET = new Set<LevelId>(PLAN);

// --- Arguments ------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const ONLY_MODE = flag("mode") as ModeId | null;
// Number(x) plutôt qu'un cast : le drapeau vient de la ligne de commande, et un
// `--section=x` (NaN, donc falsy) désactiverait silencieusement le filtre —
// 72 niveaux régénérés au lieu d'un — d'où la validation explicite plus bas.
const RAW_SECTION = flag("section");
const ONLY_SECTION: Section | null =
  RAW_SECTION === null ? null : (Number(RAW_SECTION) as Section);
// Un seul niveau, normal (--only=3-12) ou défi (--only=3-B). Majuscules forcées
// pour tolérer « 3-b » ; « 3-12 » est insensible à la casse.
const ONLY_LEVEL = flag("only")?.toUpperCase() ?? null;
const RESUME = args.includes("--resume");
const DRY_RUN = args.includes("--dry-run");

const SECTIONS: Section[] = [1, 2, 3, 4];

if (ONLY_MODE && !MODE_ORDER.includes(ONLY_MODE)) {
  console.error(`Mode inconnu : ${ONLY_MODE}`);
  process.exit(1);
}
// Même piège que --only : une section hors 1..4 (la difficulté « Brûlant » = 5
// existe encore dans DIFFICULTY_QUOTAS, la faute de frappe est naturelle) ne
// générerait RIEN, et le script rendrait « (rien à générer) » sans un mot.
if (ONLY_SECTION !== null && !SECTIONS.includes(ONLY_SECTION)) {
  console.error(
    `Section inconnue : ${RAW_SECTION} — attendu 1, 2, 3 ou 4.`,
  );
  process.exit(1);
}
// Un --only mal orthographié ne générerait RIEN en silence (aucun id ne matche)
// et le script rendrait « rien à générer » comme s'il n'y avait rien à faire.
if (ONLY_LEVEL && !PLAN_SET.has(ONLY_LEVEL)) {
  console.error(
    `Niveau inconnu : ${ONLY_LEVEL} — attendu « s-n » (n de 1 à ` +
      `${NORMALS_PER_SECTION}) ou « s-A » / « s-B » / « s-C », s de 1 à 4.`,
  );
  process.exit(1);
}

// Tirages complets (un tirage = un appel à generate(), soit jusqu'à
// MAX_GRID_TRIES tentatives internes) avant d'abandonner un niveau. Un tirage
// rendant une grille imparfaite est rejeté et relancé avec une autre graine.
// Plafond LOCAL au script : config.ts reste la référence du solveur.
const MAX_DRAWS_PER_LEVEL = 12;

// --- Dictionnaires (packages/studio/dictionnaires) ------------------------
// Les grilles sont écrites dans le public du jeu (packages/game/public/levels)
// qu'il embarque au build ; le studio ne dépend d'aucun asset du jeu.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "..", "game", "public", "levels");

function readWords(file: string): Set<string> {
  return parseWordList(readFileSync(path.join(ROOT, file), "utf8")).words;
}

const fullWords = readWords(FULL_DICT_FILE);
const tierWords = {} as Record<Tier, Set<string>>;
for (const tier of TIER_NAMES) tierWords[tier] = readWords(TIER_FILES[tier]);

// Un mode et ses défis partagent wordLength : les sous-ensembles sont
// construits une fois par longueur (5, 6, 7, 8) et non par géométrie.
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

/** Clés dans l'ordre canonique de jeu (section, ligne, normaux puis défi de la
 *  ligne) : à contenu égal, octets égaux — quel que soit l'ordre dans lequel
 *  les niveaux ont été (re)générés. Le tri vient de levels.ts : lui seul sait
 *  intercaler « 1-A » entre « 1-5 » et « 1-6 ». */
function sortLevels(
  levels: Record<LevelId, LevelData>,
): Record<LevelId, LevelData> {
  const out: Record<LevelId, LevelData> = {};
  for (const key of Object.keys(levels).sort(compareLevelIds)) {
    out[key] = levels[key];
  }
  return out;
}

/**
 * Sérialisation : UN NIVEAU PAR LIGNE. Le fichier est téléchargé par le jeu
 * (donc pas d'indentation à quatre niveaux), mais il est aussi versionné et
 * régénérable niveau par niveau (--only) : un JSON.stringify() nu mettrait les
 * 72 niveaux sur UNE seule ligne, et régénérer un niveau produirait un diff
 * illisible de plusieurs dizaines de ko. Une ligne par niveau coûte 72 octets
 * et rend le diff exact. Le format reste du JSON strict, relu tel quel par
 * levels.ts.
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
 * Retire du corpus tout niveau hors du plan canonique, EN PLACE. Le fichier
 * versionné peut contenir des identifiants d'un modèle antérieur (« 1-16 » …
 * « 1-25 », d'avant les 18 niveaux par section) : --resume les conserverait
 * indéfiniment et le jeu se les verrait livrer. On les supprime à l'écriture,
 * bruyamment — c'est une perte de calcul, elle doit se voir dans le journal.
 * Mutation volontaire : le record est réécrit après chaque section, l'élagage
 * n'a donc lieu (et ne se journalise) qu'une fois.
 */
function pruneLevels(modeId: ModeId, levels: Record<LevelId, LevelData>): void {
  const dead = Object.keys(levels).filter((id) => !PLAN_SET.has(id));
  if (dead.length === 0) return;
  for (const id of dead) delete levels[id];
  const shown = dead.slice(0, 10).join(", ");
  console.log(
    `  élagage ${modeId} : ${dead.length} niveau(x) hors plan supprimé(s) — ` +
      shown +
      (dead.length > 10 ? ` (+${dead.length - 10})` : ""),
  );
}

/**
 * Écrit le fichier du mode. Appelé après CHAQUE section, et non une seule fois
 * en fin de mode : makeLevel jette dès qu'un niveau résiste, et un mode complet
 * se compte en minutes — un échec (ou un Ctrl-C) au niveau 3-12 perdait sinon
 * les 47 niveaux déjà calculés, et --resume, dont c'est toute la raison d'être,
 * n'avait rien à reprendre.
 */
function writeMode(modeId: ModeId, levels: Record<LevelId, LevelData>): void {
  pruneLevels(modeId, levels);
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
  const defi = defiMode(mode);
  const levels = readExisting(modeId);
  const modeT0 = performance.now();
  let modeDraws = 0;
  let modeLevels = 0;

  console.log(
    `\n=== Mode ${modeId} — grilles ${mode.rows}×${mode.cols} ` +
      `(${mode.wordCount}×${mode.wordLength}), défis ${defi.rows}×${defi.cols} ` +
      `(${defi.wordCount}×${defi.wordLength})`,
  );

  for (const section of SECTIONS) {
    if (ONLY_SECTION !== null && section !== ONLY_SECTION) continue;
    const difficulty: Difficulty = section; // section s ⇒ difficulté s
    const sectionT0 = performance.now();
    let sectionDraws = 0;
    let done = 0;

    // Les 15 normaux de la section, puis ses 3 défis : même difficulté (donc
    // mêmes quotas de vocabulaire), seule la géométrie change — un défi joue
    // sur la grille doublée de defiMode(). Les défis en dernier parce qu'ils
    // coûtent l'essentiel du temps : une section qui casse sur un normal
    // échoue vite.
    const plan: { id: LevelId; geometry: GameMode; defiKey: DefiKey | null }[] =
      [];
    for (let n = 1; n <= NORMALS_PER_SECTION; n++) {
      plan.push({ id: levelId(section, n), geometry: mode, defiKey: null });
    }
    for (const key of DEFI_KEYS) {
      plan.push({ id: defiId(section, key), geometry: defi, defiKey: key });
    }

    for (const { id, geometry, defiKey } of plan) {
      if (ONLY_LEVEL && id !== ONLY_LEVEL) continue;
      if (RESUME && levels[id]) continue;
      const { data, stats } = makeLevel(modeId, id, geometry, difficulty);
      levels[id] = data;
      sectionDraws += stats.draws;
      done++;
      if (defiKey) {
        console.log(
          `    défi ${id} : ${stats.draws} tirage(s), ` +
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
    // Rien de neuf, mais le fichier peut encore porter des identifiants d'un
    // modèle antérieur : un --resume sur un mode déjà complet est précisément
    // le cas où l'élagage n'aurait jamais lieu (writeMode n'est appelé que par
    // une section qui a produit quelque chose). On réécrit alors, et seulement
    // alors — sinon le corpus mort survivrait à tous les runs.
    const stale = Object.keys(levels).some((id) => !PLAN_SET.has(id));
    if (stale && !DRY_RUN) writeMode(modeId, levels);
    else console.log("  (rien à générer)");
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
