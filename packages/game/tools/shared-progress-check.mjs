// @ts-check
// Harnais de vérification de la progression PARTAGÉE (doc 03, chantier 2) :
// rejoue en dehors de Rune (aucun serveur, aucun dev/preview, cf. règles du
// portage) le scénario du critère de sortie (doc 09) — « profil vierge +
// profil avancé → le vierge voit et joue tout ; victoire créditée aux deux
// persisted » — plus le rétrécissement de l'union à un départ (Q6c) et la
// non-créditation d'un joueur parti avant la victoire (Q7).
//
// Complète tools/progress-check.mjs (dérivations pures mono/inter-modes) : ce
// fichier-ci couvre la couche logic/ (union, crédit de victoire, garde de
// jouabilité) qui n'a aucune autre couverture depuis sa création (1d-logic-v1).
//
//   node tools/shared-progress-check.mjs

const { cellState, isModeUnlocked } = await import("../src/game/progress.ts");
const { MODE_ORDER, allLevelIds } = await import("@tracemot/core");
const {
  rebuildSharedProgress,
  ownProgressFromPersisted,
  emptySharedProgress,
  toModeProgress,
  applyVictory,
  isLevelPlayable,
} = await import("../src/logic/progression.ts");

let failures = 0;
/** @param {boolean} ok @param {string} label */
function check(ok, label) {
  if (!ok) {
    failures++;
    console.error(`  ÉCHEC : ${label}`);
  }
}

// Enveloppe l'union entière (tous modes) pour appeler les dérivations
// inter-modes de game/progress.ts (isModeUnlocked…), qui attendent un
// ModeProgress par mode — même adaptateur que client/logic.ts (jamais stocké).
/** @param {Record<string, Record<string, true>>} shared */
function wrapAll(shared) {
  return Object.fromEntries(
    MODE_ORDER.map((m) => [m, toModeProgress(shared[m])]),
  );
}

/** Un state RuneGameState minimal, sans persisted (setup/events). */
function baseGame() {
  return {
    phase: "map",
    playerIds: [],
    colorSlots: {},
    sharedProgress: emptySharedProgress(),
    ownProgress: {},
    proposal: null,
    lastRefusal: null,
    modeId: "5x5",
    levelId: null,
    found: [],
    won: false,
    winSummary: null,
    traces: {},
  };
}

// --- 1. Union : le vierge voit et joue tout (doc 09, exemple doc 03) --------
{
  const tag = "union (vierge + avancé)";
  const blankPersisted = {};
  const advancedPersisted = { progress: { "5x5": allLevelIds() } };

  const game = baseGame();
  game.playerIds = ["blank", "advanced"];
  game.ownProgress = {
    blank: ownProgressFromPersisted(blankPersisted),
    advanced: ownProgressFromPersisted(advancedPersisted),
  };
  rebuildSharedProgress(game);

  const union5x5 = toModeProgress(game.sharedProgress["5x5"]);
  check(
    cellState(union5x5, "4-C") === "validated",
    `${tag} : la dernière case (4-C) du 5x5 est validée dans l'union`,
  );
  check(
    isModeUnlocked(wrapAll(game.sharedProgress), "6x6"),
    `${tag} : le 5x5 entier (union) débloque le 6x6`,
  );
  check(
    isLevelPlayable(game.sharedProgress, "5x5", "4-C"),
    `${tag} : 4-C proposable (rejeu, doc 04 § Q17)`,
  );

  // Ma progression PROPRE (celle du vierge) reste, elle, vierge : le badge
  // « grâce à la room » (map.ts) compare exactement ces deux dérivations.
  const ownBlank5x5 = toModeProgress(game.ownProgress.blank["5x5"]);
  check(
    cellState(ownBlank5x5, "1-1") === "active" && cellState(ownBlank5x5, "1-2") !== "active",
    `${tag} : ma progression propre n'a débloqué QUE 1-1`,
  );
  check(
    cellState(ownBlank5x5, "4-C") !== "validated",
    `${tag} : 4-C n'est pas validé dans ma progression propre (d'où le badge)`,
  );

  // Un niveau d'un mode encore verrouillé (union comprise) reste refusé : la
  // garde ne se limite pas à la case, elle porte aussi sur le mode
  // (isLevelPlayable § fix de ce chantier — sans lui, "8x8"/"1-1" serait
  // acceptée à tort, sa case étant "active" en soi).
  check(
    !isLevelPlayable(game.sharedProgress, "8x8", "1-1"),
    `${tag} : 8x8 reste hors de portée (mode non débloqué par l'union)`,
  );

  console.log("Union : le vierge voit et joue tout : OK");
}

// --- 2. Départ : l'union RÉTRÉCIT (Q6c) --------------------------------------
{
  const tag = "départ (Q6c)";
  const blankPersisted = {};
  const advancedPersisted = { progress: { "5x5": allLevelIds() } };

  const game = baseGame();
  game.playerIds = ["blank", "advanced"];
  game.ownProgress = {
    blank: ownProgressFromPersisted(blankPersisted),
    advanced: ownProgressFromPersisted(advancedPersisted),
  };
  rebuildSharedProgress(game);
  check(
    isModeUnlocked(wrapAll(game.sharedProgress), "6x6"),
    `${tag} : 6x6 débloqué tant que l'avancé est là`,
  );

  // playerLeft (logic.ts) : retrait du roster ET de ownProgress, PUIS
  // rebuildSharedProgress — reproduit ici à l'identique.
  game.playerIds = game.playerIds.filter((id) => id !== "advanced");
  delete game.ownProgress.advanced;
  rebuildSharedProgress(game);

  check(
    !isModeUnlocked(wrapAll(game.sharedProgress), "6x6"),
    `${tag} : le départ de l'avancé referme le 6x6`,
  );
  check(
    cellState(toModeProgress(game.sharedProgress["5x5"]), "4-C") !== "validated",
    `${tag} : 4-C redevient non-validé dans l'union une fois seul`,
  );
  console.log("Départ : l'union rétrécit (Q6c) : OK");
}

// --- 3. Victoire : crédit immédiat à tous les joueurs actifs (doc 03/09) ----
{
  const tag = "crédit de victoire";
  const persisted = { blank: {}, advanced: {} };

  const game = baseGame();
  game.phase = "playing";
  game.playerIds = ["blank", "advanced"];
  game.ownProgress = {
    blank: ownProgressFromPersisted(persisted.blank),
    advanced: ownProgressFromPersisted(persisted.advanced),
  };
  game.modeId = "5x5";
  game.levelId = "1-1";
  game.found = [{ word: "AAAA", path: [0, 1, 2, 3], by: "advanced" }];
  game.persisted = persisted;

  applyVictory(game, "5x5", "1-1");

  check(game.won === true, `${tag} : game.won posé`);
  check(
    (persisted.blank.progress?.["5x5"] ?? []).includes("1-1"),
    `${tag} : le persisted du vierge est crédité`,
  );
  check(
    (persisted.advanced.progress?.["5x5"] ?? []).includes("1-1"),
    `${tag} : le persisted de l'avancé (déjà validé) reste crédité`,
  );
  check(
    game.ownProgress.blank["5x5"]["1-1"] === true,
    `${tag} : ownProgress du vierge mis à jour EN MIROIR`,
  );
  check(
    game.sharedProgress["5x5"]["1-1"] === true,
    `${tag} : sharedProgress recalculé après le crédit`,
  );
  check(
    game.winSummary?.counts.advanced === 1 && game.winSummary?.counts.blank === 0,
    `${tag} : décompte de mots par joueur actif (classement, doc 07)`,
  );
  check(game.winSummary?.firstValidation === true, `${tag} : première validation détectée`);

  // Idempotence : rejouer/re-créditer le même niveau ne duplique rien.
  applyVictory(game, "5x5", "1-1");
  check(
    persisted.blank.progress["5x5"].filter((id) => id === "1-1").length === 1,
    `${tag} : crédit idempotent (pas de doublon au persisted)`,
  );
  console.log("Crédit de victoire immédiat, tous les joueurs actifs : OK");
}

// --- 4. Un joueur parti avant la victoire n'est PAS crédité (Q7) ------------
{
  const tag = "parti avant la fin (Q7)";
  const persisted = { blank: {}, late: {} };

  const game = baseGame();
  game.phase = "playing";
  game.playerIds = ["blank", "late"];
  game.ownProgress = {
    blank: ownProgressFromPersisted(persisted.blank),
    late: ownProgressFromPersisted(persisted.late),
  };
  game.modeId = "5x5";
  game.levelId = "1-1";
  // "late" a posé un mot puis quitté AVANT la victoire (playerLeft, doc 02) :
  // roster et ownProgress privés de lui, mais son mot reste au tableau.
  game.found = [{ word: "AAAA", path: [0, 1, 2, 3], by: "late" }];
  game.playerIds = game.playerIds.filter((id) => id !== "late");
  delete game.ownProgress.late;
  game.persisted = persisted;

  applyVictory(game, "5x5", "1-1");

  check(
    !("1-1" in Object.fromEntries((persisted.late.progress?.["5x5"] ?? []).map((id) => [id, true]))),
    `${tag} : le persisted du parti n'est PAS crédité`,
  );
  check(
    persisted.blank.progress["5x5"].includes("1-1"),
    `${tag} : le présent, lui, est crédité`,
  );
  check(
    !("late" in game.winSummary.counts),
    `${tag} : le parti n'apparaît pas au classement (Q7b), son mot reste anonyme`,
  );
  console.log("Un joueur parti avant la victoire n'est pas crédité (Q7) : OK");
}

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nProgression partagée conforme à la spec (doc 03/09).");
