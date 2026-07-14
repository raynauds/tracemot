// @ts-check
// Harnais de vérification de la progression : rejoue les exemples de référence
// de la spec (docs/work/2026-07-14_niveaux-et-progression.md) — premier
// lancement, après 1-1, après 1-1…1-6, et l'état de référence de la maquette
// (51 validés). C'est le filet de sécurité de toute la logique de carte : la
// dérivation des états n'a aucune autre couverture.
//
// Le schéma ✔/●/○/· de la section 3 de la spec est recopié tel quel ci-dessous
// et comparé case par case : si la spec et le code divergent, ça se voit ici.
//
//   node tools/progress-check.mjs
//
// Deux voies de test :
//  - dérivation pure (cellState/bossState/sectionStats) via makeProgress, sans
//    stockage ;
//  - persistance (isModeUnlocked, visibleModes…) via un stub localStorage posé
//    sur globalThis AVANT l'import du module (d'où l'import dynamique).

/** Stub localStorage minimal : Map en mémoire, même contrat que le navigateur. */
class MemoryStorage {
  /** @type {Map<string, string>} */
  #store = new Map();
  /** @param {string} k */
  getItem(k) {
    return this.#store.has(k) ? /** @type {string} */ (this.#store.get(k)) : null;
  }
  /** @param {string} k @param {string} v */
  setItem(k, v) {
    this.#store.set(k, String(v));
  }
  /** @param {string} k */
  removeItem(k) {
    this.#store.delete(k);
  }
  clear() {
    this.#store.clear();
  }
}

const storage = new MemoryStorage();
/** @type {any} */ (globalThis).localStorage = storage;

const {
  makeProgress,
  cellState,
  bossState,
  sectionStats,
  loadProgress,
  saveValidated,
  totalValidated,
  isModeUnlocked,
  nextLockedMode,
  visibleModes,
  isFirstLaunch,
  loadLastMode,
  saveLastMode,
  isModeSeen,
  markModeSeen,
  purgeLegacyKeys,
} = await import("../src/game/progress.ts");

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

/**
 * @param {import("../src/game/progress.ts").ModeProgress} p
 * @param {string} id
 * @param {import("../src/game/progress.ts").CellState} expected
 * @param {string} tag
 */
function checkCell(p, id, expected, tag) {
  const got = cellState(p, id);
  check(got === expected, `${tag} : ${id} attendu « ${expected} », obtenu « ${got} »`);
}

/**
 * @param {import("../src/game/progress.ts").ModeProgress} p
 * @param {import("../src/game/config.ts").Section} s
 * @param {import("../src/game/progress.ts").CellState} expected
 * @param {string} tag
 */
function checkBoss(p, s, expected, tag) {
  const got = bossState(p, s);
  check(
    got === expected,
    `${tag} : boss ${s}-25 attendu « ${expected} », obtenu « ${got} »`,
  );
}

/** @param {number} from @param {number} to */
const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** @param {number} s @param {number[]} ns */
const ids = (s, ns) => ns.map((n) => `${s}-${n}`);

// --- 1. Premier lancement ---------------------------------------------------
{
  const tag = "premier lancement";
  const p = makeProgress([]);
  checkCell(p, "1-1", "active", tag);
  for (const id of ["1-2", "1-7"]) checkCell(p, id, "disabled", tag);
  for (const id of ["1-3", "1-8", "1-13", "1-24"]) checkCell(p, id, "hidden", tag);
  checkBoss(p, 1, "hidden", tag);
  for (const s of /** @type {const} */ ([2, 3, 4])) {
    const st = sectionStats(p, s);
    check(!st.anyVisible, `${tag} : section ${s} ne doit pas être visible`);
    check(st.lastVisibleRow === 0, `${tag} : section ${s} lastVisibleRow ≠ 0`);
  }
  const st1 = sectionStats(p, 1);
  check(st1.anyVisible && st1.lastVisibleRow === 2, `${tag} : section 1 = 2 lignes`);
  console.log("Premier lancement : OK");
}

// --- 2. Après 1-1 -----------------------------------------------------------
{
  const tag = "après 1-1";
  const p = makeProgress(["1-1"]);
  checkCell(p, "1-1", "validated", tag);
  for (const id of ["1-2", "1-7"]) checkCell(p, id, "active", tag);
  for (const id of ["1-3", "1-8", "1-13"]) checkCell(p, id, "disabled", tag);
  for (const id of ["1-4", "1-9", "1-14", "1-19"]) checkCell(p, id, "hidden", tag);
  checkBoss(p, 1, "hidden", tag);
  console.log("Après 1-1 : OK");
}

// --- 3. Après 1-1…1-6 -------------------------------------------------------
{
  const tag = "après 1-1…1-6";
  const p = makeProgress(ids(1, range(1, 6)));
  for (const id of ids(1, range(1, 6))) checkCell(p, id, "validated", tag);
  for (const id of ids(1, range(7, 12))) checkCell(p, id, "active", tag);
  for (const id of ids(1, range(13, 18))) checkCell(p, id, "disabled", tag);
  for (const id of ids(1, range(19, 24))) checkCell(p, id, "hidden", tag);
  checkBoss(p, 1, "disabled", tag); // visible (adjacent à 1-6) mais pas jouable
  const st = sectionStats(p, 1);
  check(st.validatedCount === 6 && !st.complete, `${tag} : 6 validés, non complète`);
  check(st.lastVisibleRow === 3, `${tag} : 3 lignes rendues`);
  console.log("Après 1-1…1-6 : OK");
}

// --- 4. État de référence de la maquette (51 validés) ------------------------
// NB : la spec annonce « 51 niveaux validés », mais la liste qu'elle donne en
// compte 52 (25 + 24 + 3) — c'est la liste qui fait foi, pas le total.
const REFERENCE = [
  ...ids(1, range(1, 25)), // section 1 entière, boss compris
  ...ids(2, range(1, 24)), // section 2 : les 24 normaux, pas le boss
  "3-1",
  "3-2",
  "3-7",
];
const REFERENCE_COUNT = 52;

{
  const tag = "état de référence";
  const p = makeProgress(REFERENCE);
  check(
    REFERENCE.length === REFERENCE_COUNT,
    `${tag} : ${REFERENCE_COUNT} niveaux validés attendus`,
  );

  // Boss : les quatre états possibles, un par section.
  checkBoss(p, 1, "validated", tag);
  checkBoss(p, 2, "active", tag);
  checkBoss(p, 3, "disabled", tag);
  checkBoss(p, 4, "hidden", tag);

  // Schéma de la spec, ligne par ligne (✔ validé, ● actif, ○ disabled, · caché).
  const SECTION_3 = [
    "✔ ✔ ● ● ● ●",
    "✔ ● ○ ○ ○ ○",
    "● ○ · · · ·",
    "○ · · · · ·",
  ];
  /** @type {Record<string, import("../src/game/progress.ts").CellState>} */
  const GLYPHS = {
    "✔": "validated",
    "●": "active",
    "○": "disabled",
    "·": "hidden",
  };
  SECTION_3.forEach((row, r) => {
    row.split(" ").forEach((glyph, c) => {
      const n = r * 6 + c + 1;
      checkCell(p, `3-${n}`, GLYPHS[glyph], `${tag}, section 3`);
    });
  });

  // Section 4 : entièrement cachée, elle n'apparaît pas du tout.
  const st4 = sectionStats(p, 4);
  check(!st4.anyVisible, `${tag} : section 4 doit être invisible`);
  check(st4.lastVisibleRow === 0, `${tag} : section 4 lastVisibleRow ≠ 0`);
  check(st4.validatedCount === 0, `${tag} : section 4 sans validé`);

  const st1 = sectionStats(p, 1);
  check(
    st1.validatedCount === 25 && st1.complete,
    `${tag} : section 1 complète (25, boss compris)`,
  );
  const st2 = sectionStats(p, 2);
  check(
    st2.validatedCount === 24 && !st2.complete,
    `${tag} : section 2 = 24 validés, non complète`,
  );
  const st3 = sectionStats(p, 3);
  check(
    st3.validatedCount === 3 && st3.lastVisibleRow === 4,
    `${tag} : section 3 = 3 validés, 4 lignes rendues`,
  );
  console.log("État de référence (dérivation) : OK");
}

// --- 5. Persistance et déblocage des modes (via le stub localStorage) --------
{
  const tag = "persistance";
  storage.clear();

  check(isFirstLaunch(), `${tag} : premier lancement attendu sur stockage vide`);
  check(isModeUnlocked("5x5"), `${tag} : 5x5 toujours débloqué`);
  check(!isModeUnlocked("6x6"), `${tag} : 6x6 verrouillé au départ`);
  check(nextLockedMode() === "6x6", `${tag} : prochain verrouillé = 6x6`);
  check(
    JSON.stringify(visibleModes()) === JSON.stringify(["5x5", "6x6"]),
    `${tag} : modes visibles = 5x5, 6x6 au départ`,
  );
  check(loadLastMode() === "5x5", `${tag} : dernier mode par défaut = 5x5`);

  // Écriture de l'état de référence, puis relecture.
  for (const id of REFERENCE) saveValidated("5x5", id);
  saveValidated("5x5", "1-1"); // idempotence du rejeu
  check(
    totalValidated("5x5") === REFERENCE_COUNT,
    `${tag} : ${REFERENCE_COUNT} validés persistés`,
  );
  check(
    loadProgress("5x5").validated.size === REFERENCE_COUNT,
    `${tag} : relecture de ${REFERENCE_COUNT} ids`,
  );
  check(!isFirstLaunch(), `${tag} : plus un premier lancement`);

  // Boss 1-25 validé en 5x5 ⇒ 6x6 débloqué ; 7x7 verrouillé (aucun boss 6x6).
  check(isModeUnlocked("6x6"), `${tag} : 6x6 débloqué par le boss 1-25`);
  check(!isModeUnlocked("7x7"), `${tag} : 7x7 verrouillé`);
  check(!isModeUnlocked("8x8"), `${tag} : 8x8 verrouillé`);
  check(nextLockedMode() === "7x7", `${tag} : prochain verrouillé = 7x7`);
  check(
    JSON.stringify(visibleModes()) === JSON.stringify(["5x5", "6x6", "7x7"]),
    `${tag} : modes visibles = 5x5, 6x6, 7x7`,
  );

  // Dernier mode consulté et pastille « jamais visité ».
  saveLastMode("6x6");
  check(loadLastMode() === "6x6", `${tag} : dernier mode = 6x6`);
  check(!isModeSeen("6x6"), `${tag} : 6x6 pas encore visité`);
  markModeSeen("6x6");
  check(isModeSeen("6x6"), `${tag} : 6x6 marqué visité`);

  // Un mode mémorisé mais verrouillé (progression effacée) retombe sur 5x5.
  storage.setItem("tracemot.lastMode", "8x8");
  check(loadLastMode() === "5x5", `${tag} : mode verrouillé mémorisé ⇒ 5x5`);

  // Purge des clés du jeu libre.
  storage.setItem("tracemot.mode", "classique");
  storage.setItem("tracemot.difficulty", "3");
  purgeLegacyKeys();
  check(
    storage.getItem("tracemot.mode") === null &&
      storage.getItem("tracemot.difficulty") === null,
    `${tag} : clés héritées purgées`,
  );
  console.log("Persistance et déblocage des modes : OK");
}

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nTous les états de progression sont conformes à la spec.");
