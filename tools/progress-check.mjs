// @ts-check
// Harnais de vérification de la progression : rejoue les déroulés de référence
// de la spec (docs/work/2026-07-14_progression-etoiles.md) — premier lancement,
// après 1-1, après 1-1…1-4, après 1-1…1-5, après le défi 1-A (l'étoile ouvre la
// section 2), puis l'état de référence de la maquette (27 validés, 3 étoiles).
// C'est le filet de sécurité de toute la logique de carte : la dérivation des
// états et le barème d'étoiles n'ont aucune autre couverture.
//
// Le schéma ✔/●/○/· de la section 3 de l'état de référence est recopié tel quel
// ci-dessous et comparé case par case, défi compris : si la spec et le code
// divergent, ça se voit ici.
//
//   node tools/progress-check.mjs
//
// Trois voies de test :
//  - l'arithmétique des identifiants (levels.ts), sur laquelle la carte compte
//    pour son ordre de rendu ;
//  - la dérivation pure (cellState/sectionStats/étoiles) via makeProgress, sans
//    stockage ;
//  - la persistance (isModeUnlocked, visibleModes, migrateStorage…) via un stub
//    localStorage posé sur globalThis AVANT l'import du module (d'où l'import
//    dynamique).

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
  /** Clés présentes, pour vérifier une purge sans les énumérer une à une. */
  keys() {
    return [...this.#store.keys()].sort();
  }
}

const storage = new MemoryStorage();
/** @type {any} */ (globalThis).localStorage = storage;

const {
  makeProgress,
  cellState,
  sectionStats,
  starCount,
  sectionUnlocked,
  starsMissingForSection,
  hasActiveDefi,
  sectionTeased,
  isModeTeased,
  nextChoices,
  starRewardAt,
  MAX_STARS,
  STARS_FOR_SECTION,
  STARS_FOR_NEXT_MODE,
  loadProgress,
  saveValidated,
  totalValidated,
  modeStars,
  isModeUnlocked,
  nextLockedMode,
  visibleModes,
  isFirstLaunch,
  loadLastMode,
  saveLastMode,
  isModeSeen,
  markModeSeen,
  migrateStorage,
} = await import("../src/game/progress.ts");

const {
  levelId,
  defiId,
  isDefi,
  sectionOf,
  levelNumber,
  defiKeyOf,
  rowOf,
  defiOfRow,
  rowOfDefi,
  lastNormalOfRow,
  levelMode,
  levelLabel,
  sectionLevelIds,
  allLevelIds,
  compareLevelIds,
  ROW_LENGTH,
  ROWS_PER_SECTION,
  NORMALS_PER_SECTION,
  DEFI_KEYS,
  LEVELS_PER_SECTION,
} = await import("../src/game/levels.ts");

const { GAME_MODES, defiMode } = await import("../src/game/config.ts");

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
 * @param {unknown} got
 * @param {unknown} expected
 * @param {string} label
 */
function checkEqual(got, expected, label) {
  const g = JSON.stringify(got);
  const e = JSON.stringify(expected);
  check(g === e, `${label} : attendu ${e}, obtenu ${g}`);
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
 * @param {import("../src/game/progress.ts").CellState} expected
 * @param {string[]} list
 * @param {string} tag
 */
function checkCells(p, expected, list, tag) {
  for (const id of list) checkCell(p, id, expected, tag);
}

/** @param {number} from @param {number} to */
const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** @param {number} s @param {number[]} ns */
const ids = (s, ns) => ns.map((n) => `${s}-${n}`);

// --- 0. Arithmétique des identifiants (levels.ts) ----------------------------
// La carte rend les 18 cases d'une section dans l'ordre canonique et lit chaque
// id pour savoir où le poser : une dérive ici décale toute la grille.
{
  const tag = "identifiants";
  check(ROW_LENGTH === 5, `${tag} : 5 normaux par ligne`);
  check(ROWS_PER_SECTION === 3, `${tag} : 3 lignes par section`);
  check(NORMALS_PER_SECTION === 15, `${tag} : 15 normaux par section`);
  check(LEVELS_PER_SECTION === 18, `${tag} : 18 niveaux par section`);
  checkEqual(DEFI_KEYS, ["A", "B", "C"], `${tag} : clés de défi`);

  check(levelId(1, 7) === "1-7", `${tag} : levelId(1, 7)`);
  check(defiId(1, "A") === "1-A", `${tag} : defiId(1, "A")`);
  check(isDefi("1-A") && isDefi("4-C"), `${tag} : "1-A" et "4-C" sont des défis`);
  check(!isDefi("1-1") && !isDefi("2-15"), `${tag} : les normaux ne le sont pas`);
  check(sectionOf("3-12") === 3 && sectionOf("4-B") === 4, `${tag} : sectionOf`);
  check(levelNumber("2-13") === 13, `${tag} : levelNumber`);
  check(defiKeyOf("2-B") === "B", `${tag} : defiKeyOf d'un défi`);
  check(defiKeyOf("2-6") === null, `${tag} : defiKeyOf d'un normal = null`);

  // Lignes : 1..5 → 1, 6..10 → 2, 11..15 → 3.
  checkEqual([1, 5, 6, 10, 11, 15].map(rowOf), [1, 1, 2, 2, 3, 3], `${tag} : rowOf`);
  checkEqual(
    [1, 2, 3].map((r) => defiOfRow(/** @type {any} */ (r))),
    ["A", "B", "C"],
    `${tag} : defiOfRow`,
  );
  checkEqual(
    ["A", "B", "C"].map((k) => rowOfDefi(/** @type {any} */ (k))),
    [1, 2, 3],
    `${tag} : rowOfDefi`,
  );
  checkEqual(
    [1, 2, 3].map((r) => lastNormalOfRow(/** @type {any} */ (r))),
    [5, 10, 15],
    `${tag} : lastNormalOfRow`,
  );

  // Ordre canonique = ordre de jeu, entrelacé par ligne.
  checkEqual(
    sectionLevelIds(1),
    [
      "1-1", "1-2", "1-3", "1-4", "1-5", "1-A",
      "1-6", "1-7", "1-8", "1-9", "1-10", "1-B",
      "1-11", "1-12", "1-13", "1-14", "1-15", "1-C",
    ],
    `${tag} : ordre canonique de la section 1`,
  );
  const all = allLevelIds();
  check(all.length === 72, `${tag} : 72 niveaux par mode (obtenu ${all.length})`);
  check(all.filter(isDefi).length === 12, `${tag} : 12 défis par mode`);
  checkEqual(all.slice(0, 7), sectionLevelIds(1).slice(0, 7), `${tag} : allLevelIds démarre en 1-1`);
  check(all[71] === "4-C", `${tag} : allLevelIds finit en 4-C`);
  // compareLevelIds doit reproduire exactement cet ordre par tri.
  const shuffled = [...all].reverse();
  checkEqual(
    [...shuffled].sort(compareLevelIds),
    all,
    `${tag} : compareLevelIds retrouve l'ordre canonique`,
  );

  // Géométrie et étiquette : le défi joue la grille doublée du mode.
  checkEqual(levelMode("5x5", "1-12"), GAME_MODES["5x5"], `${tag} : levelMode d'un normal`);
  checkEqual(
    levelMode("5x5", "1-A"),
    defiMode(GAME_MODES["5x5"]),
    `${tag} : levelMode d'un défi = defiMode()`,
  );
  check(
    levelLabel("5x5", "1-12") === "5×5 · 1-12",
    `${tag} : levelLabel normal, obtenu « ${levelLabel("5x5", "1-12")} »`,
  );
  check(
    levelLabel("5x5", "1-A") === "5×5 · Défi 1-A",
    `${tag} : levelLabel défi, obtenu « ${levelLabel("5x5", "1-A")} »`,
  );
  console.log("Identifiants et ordre canonique : OK");
}

// --- 1. Premier lancement ----------------------------------------------------
// 1-1 jouable, 1-2 visible désactivée, tout le reste caché ; sections 2..4
// verrouillées faute d'étoile (leurs cases ne sont même pas « disabled »).
{
  const tag = "premier lancement";
  const p = makeProgress([]);
  check(starCount(p) === 0, `${tag} : 0 étoile`);
  checkCell(p, "1-1", "active", tag);
  checkCell(p, "1-2", "disabled", tag);
  checkCells(p, "hidden", ["1-3", "1-5", "1-6", "1-A", "1-B", "1-C"], tag);

  check(sectionUnlocked(p, 1), `${tag} : section 1 toujours ouverte`);
  for (const s of /** @type {const} */ ([2, 3, 4])) {
    check(!sectionUnlocked(p, s), `${tag} : section ${s} verrouillée`);
    // Une section verrouillée ne montre RIEN : son 1er niveau est caché, pas
    // « disabled » — c'est le jalon qui porte le message, pas la case.
    checkCells(p, "hidden", [`${s}-1`, `${s}-2`, `${s}-A`], tag);
    const st = sectionStats(p, s);
    check(!st.anyVisible, `${tag} : section ${s} ne doit pas être visible`);
    check(st.lastVisibleRow === 0, `${tag} : section ${s} lastVisibleRow ≠ 0`);
    check(st.stars === 0, `${tag} : section ${s} sans étoile`);
  }
  const st1 = sectionStats(p, 1);
  check(st1.unlocked && st1.anyVisible, `${tag} : section 1 visible`);
  check(st1.lastVisibleRow === 1, `${tag} : section 1 = 1 ligne rendue`);
  check(st1.validatedCount === 0 && !st1.complete, `${tag} : section 1 vide`);
  console.log("Premier lancement : OK");
}

// --- 2. Après 1-1 ------------------------------------------------------------
{
  const tag = "après 1-1";
  const p = makeProgress(["1-1"]);
  checkCell(p, "1-1", "validated", tag);
  checkCell(p, "1-2", "active", tag);
  checkCell(p, "1-3", "disabled", tag);
  checkCells(p, "hidden", ["1-4", "1-5", "1-A"], tag);
  check(starCount(p) === 0, `${tag} : toujours 0 étoile`);
  console.log("Après 1-1 : OK");
}

// --- 3. Après 1-1…1-4 : première apparition du défi ---------------------------
// 1-5 devient jouable ⇒ ses deux successeurs (1-6 et le défi 1-A) apparaissent
// en visible désactivé. C'est le seul endroit où le défi se dévoile.
{
  const tag = "après 1-1…1-4";
  const p = makeProgress(ids(1, range(1, 4)));
  checkCells(p, "validated", ids(1, range(1, 4)), tag);
  checkCell(p, "1-5", "active", tag);
  checkCell(p, "1-6", "disabled", tag);
  checkCell(p, "1-A", "disabled", tag);
  checkCells(p, "hidden", ["1-7", "1-B"], tag);
  const st = sectionStats(p, 1);
  check(st.lastVisibleRow === 2, `${tag} : 2 lignes rendues`);
  check(st.stars === 0, `${tag} : aucun défi validé`);
  console.log("Après 1-1…1-4 : OK");
}

// --- 4. Après 1-1…1-5 : le joueur choisit (ligne 2 ou défi) -------------------
{
  const tag = "après 1-1…1-5";
  const p = makeProgress(ids(1, range(1, 5)));
  checkCell(p, "1-A", "active", tag);
  checkCell(p, "1-6", "active", tag);
  checkCell(p, "1-7", "disabled", tag);
  checkCells(p, "hidden", ["1-8", "1-B", "1-C"], tag);
  check(starCount(p) === 0, `${tag} : le défi n'est pas encore validé`);
  check(!sectionUnlocked(p, 2), `${tag} : section 2 encore verrouillée`);
  check(
    starsMissingForSection(p, 2) === 1,
    `${tag} : 1 étoile manquante pour la section 2`,
  );
  console.log("Après 1-1…1-5 : OK");
}

// --- 5. Après 1-A : l'étoile ouvre la section 2 -------------------------------
{
  const tag = "après 1-A";
  const p = makeProgress([...ids(1, range(1, 5)), "1-A"]);
  checkCell(p, "1-A", "validated", tag);
  check(starCount(p) === 1, `${tag} : 1 étoile`);
  check(sectionUnlocked(p, 2), `${tag} : section 2 ouverte par l'étoile`);
  check(starsMissingForSection(p, 2) === 0, `${tag} : plus rien à payer pour la section 2`);
  checkCell(p, "2-1", "active", tag);
  checkCell(p, "2-2", "disabled", tag);
  checkCells(p, "hidden", ["2-3", "2-A"], tag);
  // Un défi n'ouvre RIEN dans sa propre section : 1-6 l'était déjà par 1-5,
  // et la ligne 2 ne va pas plus loin.
  checkCell(p, "1-6", "active", tag);
  checkCell(p, "1-7", "disabled", tag);
  checkCell(p, "1-B", "hidden", tag);
  // Section 3 : encore verrouillée (2 étoiles exigées).
  check(!sectionUnlocked(p, 3), `${tag} : section 3 verrouillée`);
  check(starsMissingForSection(p, 3) === 1, `${tag} : encore 1 étoile pour la section 3`);
  const st2 = sectionStats(p, 2);
  check(st2.unlocked && st2.anyVisible && st2.lastVisibleRow === 1, `${tag} : section 2 = 1 ligne`);
  console.log("Après 1-A (étoile ⇒ section 2) : OK");
}

// --- 6. Barème des étoiles ---------------------------------------------------
// Les paliers ne regardent QUE le total d'étoiles du mode, jamais leur origine.
{
  const tag = "étoiles";
  check(MAX_STARS === 12, `${tag} : 12 étoiles au maximum`);
  check(STARS_FOR_NEXT_MODE === 3, `${tag} : 3 étoiles pour le mode suivant`);
  checkEqual(
    [1, 2, 3, 4].map((s) => STARS_FOR_SECTION[s]),
    [0, 1, 2, 4],
    `${tag} : barème des sections`,
  );

  // Progression complète de la section 1 : 3 étoiles d'un coup.
  const full1 = [...ids(1, range(1, 15)), "1-A", "1-B", "1-C"];
  const p3 = makeProgress(full1);
  check(starCount(p3) === 3, `${tag} : section 1 entière = 3 étoiles`);
  check(sectionUnlocked(p3, 3) && !sectionUnlocked(p3, 4), `${tag} : 3★ ⇒ S3 oui, S4 non`);
  check(starsMissingForSection(p3, 4) === 1, `${tag} : 1 étoile manquante pour S4`);

  // 3 étoiles glanées une par section (1-A + 2-A + 3-A) : même valeur.
  const spread = makeProgress([
    ...ids(1, range(1, 5)), "1-A",
    ...ids(2, range(1, 5)), "2-A",
    ...ids(3, range(1, 5)), "3-A",
  ]);
  check(starCount(spread) === 3, `${tag} : un défi par section = 3 étoiles`);
  check(sectionUnlocked(spread, 3), `${tag} : 3★ dispersées ouvrent aussi S3`);
  check(!sectionUnlocked(spread, 4), `${tag} : 3★ n'ouvrent pas S4`);

  // 4e étoile : la section 4 s'ouvre, d'où qu'elle vienne.
  const p4 = makeProgress([...full1, ...ids(2, range(1, 5)), "2-A"]);
  check(starCount(p4) === 4, `${tag} : 4 étoiles`);
  check(sectionUnlocked(p4, 4), `${tag} : 4★ ⇒ section 4 ouverte`);
  check(starsMissingForSection(p4, 4) === 0, `${tag} : plus rien à payer pour S4`);
  checkCell(p4, "4-1", "active", tag);
  checkCell(p4, "4-2", "disabled", tag);

  // Récompense d'une étoile donnée : sert à l'écran de victoire d'un défi.
  check(starRewardAt("5x5", 1) === "Équilibré", `${tag} : 5x5 étoile 1`);
  check(starRewardAt("5x5", 2) === "Relevé", `${tag} : 5x5 étoile 2`);
  check(starRewardAt("5x5", 3) === "Mode 6×6", `${tag} : 5x5 étoile 3`);
  check(starRewardAt("7x7", 3) === "Mode 8×8", `${tag} : 7x7 étoile 3`);
  check(starRewardAt("8x8", 3) === null, `${tag} : 8x8 étoile 3 = rien à débloquer`);
  check(starRewardAt("5x5", 4) === "Corsé", `${tag} : 5x5 étoile 4`);
  check(starRewardAt("5x5", 5) === null, `${tag} : au-delà de la 4e, rien`);
  check(starRewardAt("5x5", 12) === null, `${tag} : la 12e ne débloque rien`);
  console.log("Barème des étoiles : OK");
}

// --- 6bis. Suites proposées à la victoire (écran de victoire) -----------------
// nextChoices se lit sur la progression APRÈS la validation : on lui passe donc
// des états qui CONTIENNENT le niveau gagné. Elle ne rend que ce que cette
// victoire a ouvert — et, à défaut, le premier niveau jouable restant.
{
  const tag = "suites";
  /** @param {string[]} done @param {string} won */
  const after = (done, won) => nextChoices(makeProgress(done), won);

  // Milieu de ligne : une seule suite, le normal suivant.
  checkEqual(
    after(["1-1"], "1-1"),
    [{ id: "1-2", kind: "next" }],
    `${tag} : 1-1 ⇒ 1-2`,
  );

  // Fin de ligne : DEUX suites, le normal puis le défi — dans cet ordre.
  checkEqual(
    after(ids(1, range(1, 5)), "1-5"),
    [
      { id: "1-6", kind: "next" },
      { id: "1-A", kind: "defi" },
    ],
    `${tag} : 1-5 ⇒ 1-6 + défi 1-A`,
  );
  checkEqual(
    after([...ids(1, range(1, 10)), "1-A"], "1-10"),
    [
      { id: "1-11", kind: "next" },
      { id: "1-B", kind: "defi" },
    ],
    `${tag} : 1-10 ⇒ 1-11 + défi 1-B`,
  );

  // Dernier normal de la section : le défi C seul (il n'y a pas de 1-16).
  checkEqual(
    after([...ids(1, range(1, 15)), "1-A", "1-B"], "1-15"),
    [{ id: "1-C", kind: "defi" }],
    `${tag} : 1-15 ⇒ défi 1-C seul`,
  );

  // Un défi n'ouvre aucune case : repli sur le premier jouable restant. Après
  // 1-A, c'est 1-6 — déjà ouvert par 1-5, et toujours pas joué.
  checkEqual(
    after([...ids(1, range(1, 5)), "1-A"], "1-A"),
    [{ id: "1-6", kind: "continue" }],
    `${tag} : défi 1-A ⇒ continuer en 1-6`,
  );

  // Le défi qui ferme une section : le repli traverse les sections (2-1, ouvert
  // par l'étoile) plutôt que de renvoyer à la carte.
  checkEqual(
    after([...ids(1, range(1, 15)), "1-A", "1-B", "1-C"], "1-C"),
    [{ id: "2-1", kind: "continue" }],
    `${tag} : section 1 finie ⇒ continuer en 2-1`,
  );

  // Rejeu d'un niveau déjà validé : rien d'ouvert, on reprend là où ça bloque —
  // ici 1-A, que l'ordre canonique place AVANT 1-6 (le défi ferme sa ligne). Le
  // bouton l'annonce comme un défi (src/render/render.ts), pas comme un
  // « continuer » anodin.
  checkEqual(
    after(ids(1, range(1, 5)), "1-2"),
    [{ id: "1-A", kind: "continue" }],
    `${tag} : rejeu de 1-2 ⇒ reprise au défi 1-A`,
  );

  // Section verrouillée : la case suivante existe mais n'est pas « active ».
  // 1-15 gagné sans étoile ne peut proposer que le défi 1-C — jamais 2-1.
  const noStar = after(ids(1, range(1, 15)), "1-15");
  checkEqual(noStar, [{ id: "1-C", kind: "defi" }], `${tag} : sans étoile, pas de 2-1`);

  // Mode entièrement validé : plus aucune suite, seul le retour carte subsiste.
  checkEqual(after(allLevelIds(), "4-C"), [], `${tag} : mode complet ⇒ aucune suite`);
  console.log("Suites proposées à la victoire : OK");
}

// --- 7. État de référence de la maquette (27 validés, 3 étoiles) --------------
// Section 1 complète (3★), section 2 ligne 1 finie (défi 2-A jouable), section 3
// à peine entamée (défi 3-A entrevu), section 4 verrouillée.
const REFERENCE = [
  ...ids(1, range(1, 15)), "1-A", "1-B", "1-C", // section 1 entière ⇒ 3 étoiles
  ...ids(2, range(1, 5)), // section 2 : ligne 1 terminée, défi non joué
  ...ids(3, range(1, 4)), // section 3 : début de la ligne 1
];
const REFERENCE_COUNT = 27;

{
  const tag = "état de référence";
  const p = makeProgress(REFERENCE);
  check(REFERENCE.length === REFERENCE_COUNT, `${tag} : ${REFERENCE_COUNT} niveaux validés`);
  check(starCount(p) === 3, `${tag} : 3 étoiles`);

  // Les quatre états d'un défi, un par section.
  checkCell(p, "1-A", "validated", tag);
  checkCell(p, "2-A", "active", tag); // ligne 1 finie, défi prêt
  checkCell(p, "3-A", "disabled", tag); // 3-5 jouable ⇒ le défi se dévoile
  checkCell(p, "4-A", "hidden", tag); // section verrouillée

  // Section 1 : tout validé.
  checkCells(p, "validated", [...ids(1, range(1, 15)), "1-A", "1-B", "1-C"], tag);
  const st1 = sectionStats(p, 1);
  check(st1.unlocked, `${tag} : section 1 ouverte`);
  check(st1.validatedCount === 18 && st1.complete, `${tag} : section 1 = 18 ✓, complète`);
  check(st1.stars === 3, `${tag} : section 1 = ★★★`);
  check(st1.lastVisibleRow === 3, `${tag} : section 1 = 3 lignes`);

  // Section 2 : 2-A ET 2-6 jouables, 2-7 entrevu, 2-B encore caché.
  checkCells(p, "validated", ids(2, range(1, 5)), tag);
  checkCell(p, "2-6", "active", tag);
  checkCell(p, "2-7", "disabled", tag);
  checkCells(p, "hidden", ["2-8", "2-9", "2-10", "2-11", "2-B", "2-C"], tag);
  const st2 = sectionStats(p, 2);
  check(st2.unlocked, `${tag} : section 2 ouverte (1★ suffit)`);
  check(st2.validatedCount === 5 && !st2.complete, `${tag} : section 2 = 5 validés`);
  check(st2.stars === 0, `${tag} : section 2 sans étoile`);
  check(st2.lastVisibleRow === 2, `${tag} : section 2 = 2 lignes`);

  // Section 3 : schéma de la spec, recopié tel quel (✔ validé, ● jouable,
  // ○ visible désactivé, · caché) — 5 normaux, puis le défi de la ligne.
  const SECTION_3 = [
    "✔ ✔ ✔ ✔ ● | ○", // ligne 1 : 3-5 jouable ⇒ 3-A entrevu
    "○ · · · · | ·", // ligne 2 : seul 3-6 est entrevu
    "· · · · · | ·", // ligne 3 : rien
  ];
  /** @type {Record<string, import("../src/game/progress.ts").CellState>} */
  const GLYPHS = { "✔": "validated", "●": "active", "○": "disabled", "·": "hidden" };
  SECTION_3.forEach((row, r) => {
    const [cells, defi] = row.split(" | ");
    cells.split(" ").forEach((glyph, c) => {
      const n = r * ROW_LENGTH + c + 1;
      checkCell(p, levelId(3, n), GLYPHS[glyph], `${tag}, section 3`);
    });
    const key = defiOfRow(/** @type {any} */ (r + 1));
    checkCell(p, defiId(3, key), GLYPHS[defi], `${tag}, section 3`);
  });
  const st3 = sectionStats(p, 3);
  check(st3.unlocked, `${tag} : section 3 ouverte (2★ exigées, 3 acquises)`);
  check(st3.validatedCount === 4, `${tag} : section 3 = 4 validés`);
  check(st3.lastVisibleRow === 2, `${tag} : section 3 = 2 lignes`);
  check(st3.anyVisible, `${tag} : section 3 visible`);

  // Section 4 : verrouillée (3★ < 4). Aucune case rendue, jalon verrouillé.
  const st4 = sectionStats(p, 4);
  check(!st4.unlocked, `${tag} : section 4 verrouillée`);
  check(!st4.anyVisible, `${tag} : section 4 sans aucune case`);
  check(st4.lastVisibleRow === 0, `${tag} : section 4 lastVisibleRow ≠ 0`);
  check(st4.validatedCount === 0 && st4.stars === 0, `${tag} : section 4 vierge`);
  check(starsMissingForSection(p, 4) === 1, `${tag} : « ★ Encore 1 étoile »`);
  checkCells(p, "hidden", ["4-1", "4-2", "4-15", "4-C"], tag);

  check(sectionTeased(p, 4), `${tag} : section 4 teasée (2-A jouable donne la 4e ★)`);
  console.log("État de référence (dérivation) : OK");
}

// --- 7 bis. Un verrou ne se montre qu'à UN DÉFI PRÈS -------------------------
// Règle globale à tout ce qui coûte des étoiles (sections ET modes) : le verrou
// n'apparaît que s'il manque exactement une étoile ET qu'un défi est jouable
// tout de suite pour la donner. Le cas qui a motivé la règle : au premier
// lancement, il manque bien 1 étoile pour la section 2 — mais aucun défi n'est
// atteignable, et annoncer le prix à ce moment-là promettait sans donner le
// moyen de tenir la promesse.
{
  const tag = "verrou à un défi près";

  // Progression vide : 1 étoile manque pour la section 2, mais 1-A est HORS
  // d'atteinte (il faut 1-5). Rien ne doit paraître.
  const vide = makeProgress([]);
  check(!hasActiveDefi(vide), `${tag} : aucun défi jouable au premier lancement`);
  check(starsMissingForSection(vide, 2) === 1, `${tag} : il manque pourtant 1 ★ pour S2`);
  check(!sectionTeased(vide, 2), `${tag} : S2 NE DOIT PAS être annoncée au départ`);

  // 1-1…1-4 : le défi 1-A est visible (disabled) mais pas encore JOUABLE.
  // Le verrou reste muet — « visible » ne suffit pas, il faut « jouable ».
  const presque = makeProgress(ids(1, range(1, 4)));
  checkCell(presque, "1-A", "disabled", tag);
  check(!hasActiveDefi(presque), `${tag} : 1-A visible mais pas jouable`);
  check(!sectionTeased(presque, 2), `${tag} : S2 encore muette après 1-1…1-4`);

  // 1-1…1-5 : 1-A devient jouable. Le défi et l'annonce de ce qu'il ouvre
  // apparaissent au MÊME instant.
  const prete = makeProgress(ids(1, range(1, 5)));
  checkCell(prete, "1-A", "active", tag);
  check(hasActiveDefi(prete), `${tag} : 1-A jouable`);
  check(sectionTeased(prete, 2), `${tag} : S2 annoncée en même temps que 1-A`);
  check(!sectionTeased(prete, 3), `${tag} : S3 (2 ★) reste hors de portée d'un défi`);
  check(!sectionTeased(prete, 4), `${tag} : S4 (4 ★) idem`);

  // Section déjà ouverte : jamais teasée (elle n'est plus un verrou).
  check(!sectionTeased(prete, 1), `${tag} : une section ouverte n'est pas un verrou`);

  // 3 étoiles mais AUCUN défi jouable : la section 4 est à une étoile et reste
  // pourtant muette — c'est bien la jouabilité du défi qui commande, pas le
  // seul compte d'étoiles.
  const troisSansDefi = makeProgress([...ids(1, range(1, 15)), "1-A", "1-B", "1-C"]);
  check(starCount(troisSansDefi) === 3, `${tag} : 3 étoiles`);
  check(starsMissingForSection(troisSansDefi, 4) === 1, `${tag} : 1 ★ manque pour S4`);
  check(!hasActiveDefi(troisSansDefi), `${tag} : aucun défi jouable (S2/S3 vierges)`);
  check(!sectionTeased(troisSansDefi, 4), `${tag} : S4 muette sans défi jouable`);

  // Au plus UN verrou teasé à la fois : les seuils (1, 2, 3, 4) sont distincts
  // et un défi vaut une étoile — le teasé est toujours celui à une étoile.
  for (const p of [vide, presque, prete, troisSansDefi]) {
    const teased = /** @type {const} */ ([1, 2, 3, 4]).filter((s) => sectionTeased(p, s));
    check(teased.length <= 1, `${tag} : au plus un verrou de section teasé (${teased})`);
  }
  console.log("Verrou à un défi près (sections) : OK");
}

// --- 8. Persistance et déblocage des modes (via le stub localStorage) ---------
{
  const tag = "persistance";
  storage.clear();

  check(isFirstLaunch(), `${tag} : premier lancement attendu sur stockage vide`);
  check(isModeUnlocked("5x5"), `${tag} : 5x5 toujours débloqué`);
  check(!isModeUnlocked("6x6"), `${tag} : 6x6 verrouillé au départ`);
  check(nextLockedMode() === "6x6", `${tag} : prochain verrouillé = 6x6`);
  // Au premier lancement, l'onglet 6x6 n'est PAS montré : il coûte 3 étoiles et
  // aucun défi n'est jouable. Même règle que pour les sections — un cadenas
  // permanent est du bruit, un cadenas qui apparaît est un événement.
  check(!isModeTeased("6x6"), `${tag} : 6x6 pas teasé au départ (0 ★, aucun défi jouable)`);
  checkEqual(visibleModes(), ["5x5"], `${tag} : seul 5x5 au premier lancement`);
  check(loadLastMode() === "5x5", `${tag} : dernier mode par défaut = 5x5`);
  check(modeStars("5x5") === 0, `${tag} : 0 étoile au départ`);

  // Écriture de l'état de référence, puis relecture.
  for (const id of REFERENCE) saveValidated("5x5", id);
  saveValidated("5x5", "1-1"); // idempotence du rejeu
  saveValidated("5x5", "1-A"); // idempotence sur un défi : pas de 4e étoile
  check(totalValidated("5x5") === REFERENCE_COUNT, `${tag} : ${REFERENCE_COUNT} validés persistés`);
  check(
    loadProgress("5x5").validated.size === REFERENCE_COUNT,
    `${tag} : relecture de ${REFERENCE_COUNT} ids`,
  );
  check(modeStars("5x5") === 3, `${tag} : 3 étoiles persistées`);
  check(!isFirstLaunch(), `${tag} : plus un premier lancement`);

  // 3 étoiles en 5x5 ⇒ 6x6 ouvert ; 7x7 reste verrouillé (0 étoile en 6x6).
  check(isModeUnlocked("6x6"), `${tag} : 6x6 débloqué par la 3e étoile`);
  check(!isModeUnlocked("7x7"), `${tag} : 7x7 verrouillé`);
  check(!isModeUnlocked("8x8"), `${tag} : 8x8 verrouillé`);
  check(nextLockedMode() === "7x7", `${tag} : prochain verrouillé = 7x7`);
  // Le verrou du 7x7 est tenu par le 6x6, encore vierge : rien à annoncer.
  check(!isModeTeased("7x7"), `${tag} : 7x7 pas teasé (6x6 vierge)`);
  checkEqual(visibleModes(), ["5x5", "6x6"], `${tag} : 7x7 encore caché`);

  // 2 étoiles en 6x6 ne suffisent pas : le seuil est bien 3. Et à cet instant
  // AUCUN défi n'y est jouable (1-C exige 1-15) — donc pas de tease non plus.
  for (const id of [...ids(1, range(1, 10)), "1-A", "1-B"]) saveValidated("6x6", id);
  check(modeStars("6x6") === 2, `${tag} : 2 étoiles en 6x6`);
  check(!isModeUnlocked("7x7"), `${tag} : 7x7 verrouillé à 2 étoiles`);
  check(!isModeTeased("7x7"), `${tag} : 7x7 muet — 2 ★ mais aucun défi jouable`);
  checkEqual(visibleModes(), ["5x5", "6x6"], `${tag} : 7x7 toujours caché`);

  // 1-15 validé ⇒ 1-C devient JOUABLE. Le 6x6 est alors à un défi de sa 3e
  // étoile : l'onglet 7x7 apparaît, verrouillé, à cet instant précis.
  for (const n of [11, 12, 13, 14, 15]) saveValidated("6x6", `1-${n}`);
  check(modeStars("6x6") === 2, `${tag} : toujours 2 étoiles`);
  check(hasActiveDefi(loadProgress("6x6")), `${tag} : 1-C jouable en 6x6`);
  check(isModeTeased("7x7"), `${tag} : 7x7 teasé — 1-C ouvrirait le mode`);
  checkEqual(visibleModes(), ["5x5", "6x6", "7x7"], `${tag} : 7x7 paraît (verrouillé)`);

  saveValidated("6x6", "1-C");
  check(modeStars("6x6") === 3, `${tag} : 3 étoiles en 6x6`);
  check(isModeUnlocked("7x7"), `${tag} : 7x7 débloqué`);
  check(!isModeTeased("7x7"), `${tag} : un mode ouvert n'est plus teasé`);
  check(!isModeUnlocked("8x8"), `${tag} : 8x8 toujours verrouillé`);
  // Le 7x7 est vierge : le 8x8 reste caché tant qu'aucun défi 7x7 n'y mène.
  check(!isModeTeased("8x8"), `${tag} : 8x8 pas teasé (7x7 vierge)`);
  checkEqual(visibleModes(), ["5x5", "6x6", "7x7"], `${tag} : 8x8 encore caché`);
  check(nextLockedMode() === "8x8", `${tag} : prochain verrouillé = 8x8`);

  // La chaîne est vérifiée en entier : un maillon vidé referme tout l'aval.
  storage.removeItem("tracemot.progress.5x5");
  check(!isModeUnlocked("6x6"), `${tag} : 5x5 vidé ⇒ 6x6 refermé`);
  check(!isModeUnlocked("7x7"), `${tag} : 5x5 vidé ⇒ 7x7 refermé malgré ses 3★ en 6x6`);
  checkEqual(visibleModes(), ["5x5"], `${tag} : visibleModes reste un préfixe`);
  for (const id of REFERENCE) saveValidated("5x5", id); // on remet l'état

  // Dernier mode consulté et pastille « jamais visité ».
  saveLastMode("6x6");
  check(loadLastMode() === "6x6", `${tag} : dernier mode = 6x6`);
  check(!isModeSeen("6x6"), `${tag} : 6x6 pas encore visité`);
  markModeSeen("6x6");
  markModeSeen("6x6"); // idempotent
  check(isModeSeen("6x6"), `${tag} : 6x6 marqué visité`);
  check(!isModeSeen("7x7"), `${tag} : 7x7 jamais visité`);

  // Un mode mémorisé mais verrouillé (progression effacée) retombe sur 5x5.
  storage.setItem("tracemot.lastMode", "8x8");
  check(loadLastMode() === "5x5", `${tag} : mode verrouillé mémorisé ⇒ 5x5`);
  console.log("Persistance et déblocage des modes : OK");
}

// --- 9. Migration du stockage ------------------------------------------------
// Une progression v1 (ids 1-16…1-25, aucun défi A/B/C) n'a plus de sens : ses
// ids n'existent plus et son compte d'étoiles serait nul. On purge et on
// versionne, plutôt que de traîner une carte incohérente.
{
  const tag = "migration v1";
  storage.clear();
  storage.setItem(
    "tracemot.progress.5x5",
    JSON.stringify([...ids(1, range(1, 25)), ...ids(2, range(1, 6))]),
  );
  storage.setItem("tracemot.progress.6x6", JSON.stringify(["1-1"]));
  storage.setItem("tracemot.seenModes", JSON.stringify(["6x6"]));
  storage.setItem("tracemot.lastMode", "6x6");
  storage.setItem("tracemot.mode", "classique"); // clé du jeu libre disparu
  storage.setItem("tracemot.difficulty", "3");

  migrateStorage();

  checkEqual(storage.keys(), ["tracemot.schema"], `${tag} : tout purgé sauf le schéma`);
  check(storage.getItem("tracemot.schema") === "2", `${tag} : schéma versionné à « 2 »`);
  check(totalValidated("5x5") === 0, `${tag} : progression v1 effacée`);
  check(isFirstLaunch(), `${tag} : on repart d'un premier lancement`);
  console.log("Migration v1 ⇒ v2 : OK");
}

{
  const tag = "migration v2";
  storage.clear();
  storage.setItem("tracemot.schema", "2");
  storage.setItem("tracemot.progress.5x5", JSON.stringify(["1-1", "1-2", "1-3", "1-4", "1-5", "1-A"]));
  storage.setItem("tracemot.seenModes", JSON.stringify(["5x5"]));
  storage.setItem("tracemot.lastMode", "5x5");
  storage.setItem("tracemot.mode", "classique"); // legacy : purgée dans tous les cas

  migrateStorage();

  check(totalValidated("5x5") === 6, `${tag} : progression v2 intacte`);
  check(modeStars("5x5") === 1, `${tag} : l'étoile survit`);
  check(isModeSeen("5x5"), `${tag} : seenModes intact`);
  check(loadLastMode() === "5x5", `${tag} : lastMode intact`);
  check(storage.getItem("tracemot.mode") === null, `${tag} : clé du jeu libre purgée`);
  check(storage.getItem("tracemot.schema") === "2", `${tag} : schéma inchangé`);
  console.log("Migration v2 (idempotence) : OK");
}

// --- 10. Stockage indisponible ------------------------------------------------
// Navigation privée, quota plein : la progression est perdue, mais rien ne jette.
{
  const tag = "stockage indisponible";
  const broken = {
    getItem() {
      throw new Error("stockage refusé");
    },
    setItem() {
      throw new Error("stockage refusé");
    },
    removeItem() {
      throw new Error("stockage refusé");
    },
  };
  /** @type {any} */ (globalThis).localStorage = broken;
  try {
    migrateStorage();
    saveValidated("5x5", "1-1");
    check(totalValidated("5x5") === 0, `${tag} : lecture vide`);
    check(loadProgress("5x5").validated.size === 0, `${tag} : progression vide`);
    check(isModeUnlocked("5x5") && !isModeUnlocked("6x6"), `${tag} : verrous par défaut`);
    check(loadLastMode() === "5x5", `${tag} : mode par défaut`);
    saveLastMode("6x6");
    markModeSeen("6x6");
    check(!isModeSeen("6x6"), `${tag} : rien de mémorisé`);
    check(isFirstLaunch(), `${tag} : premier lancement`);
  } catch (err) {
    check(false, `${tag} : une exception a fui — ${err}`);
  } finally {
    /** @type {any} */ (globalThis).localStorage = storage;
  }
  console.log("Stockage indisponible : OK");
}

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nTous les états de progression sont conformes à la spec.");
