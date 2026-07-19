// Progression partagée Rune (doc 03) : union des ownProgress de tous les
// joueurs actifs, crédit d'une victoire, calcul du winSummary figé (doc 07).
// Réutilise les dérivations pures de ../game/progress.ts (destinées à logic
// ET client, doc 01 § stratification) — sharedProgress/ownProgress stockent
// un Record<LevelId, true> NU par mode (doc 02) ; `toModeProgress` l'enveloppe
// dans le `ModeProgress` ({ validated }) que ces dérivations attendent, sans
// jamais stocker le wrapper.

import { MODE_ORDER, isDefi, type LevelId, type ModeId } from "@tracemot/core";
import {
  cellState,
  isModeUnlocked,
  starCount,
  starRewardAt,
  type ModeProgress,
} from "../game/progress.ts";
import type {
  GameStateWithPersisted,
  ModeProgressRecord,
  Persisted,
  PlayerId,
  ProgressByMode,
  RuneGameState,
  WinSummary,
} from "./types.ts";

// Enveloppe un Record nu (forme stockée) dans le ModeProgress attendu par les
// dérivations pures de game/progress.ts. Jamais stocké : un simple adaptateur
// d'appel.
export function toModeProgress(rec: ModeProgressRecord): ModeProgress {
  return { validated: rec };
}

// Progression vide pour tous les modes (setup, repli).
export function emptySharedProgress(): ProgressByMode {
  const out = {} as ProgressByMode;
  for (const modeId of MODE_ORDER) out[modeId] = {};
  return out;
}

// Conversion UNIQUE persisted (LevelId[] par mode, JSON pur) → Record<LevelId,
// true> — doc 01 § conformité #6. Lecture tolérante : mode ou clé absente →
// liste vide, sans try/catch (de simples tests d'existence suffisent).
function toRecord(ids: LevelId[]): ModeProgressRecord {
  const rec: ModeProgressRecord = {};
  for (const id of ids) rec[id] = true;
  return rec;
}

// Progression PROPRE d'un joueur, dérivée de son persisted (miroir en state,
// doc 02/03) : un Record par mode, jamais de Set.
export function ownProgressFromPersisted(persisted: Persisted): ProgressByMode {
  const out = {} as ProgressByMode;
  for (const modeId of MODE_ORDER) {
    out[modeId] = toRecord(persisted.progress?.[modeId] ?? []);
  }
  return out;
}

// Union des ownProgress de tous les joueurs actifs, par mode : la progression
// « de la room » (doc 03). Fonction UNIQUE, appelée à setup/playerJoined/
// playerLeft/victoire — pour qu'aucun appelant ne puisse la désynchroniser.
export function rebuildSharedProgress(game: RuneGameState): void {
  const union = emptySharedProgress();
  for (const playerId of game.playerIds) {
    const own = game.ownProgress[playerId];
    if (!own) continue;
    for (const modeId of MODE_ORDER) {
      for (const id in own[modeId]) union[modeId][id] = true;
    }
  }
  game.sharedProgress = union;
}

// Crédite le niveau à CHAQUE joueur actif (doc 03 § Validation pour tout le
// monde) : idempotent (un niveau déjà validé ne change rien), persisted +
// ownProgress miroir, union recalculée en une seule fois à la fin.
function creditWin(
  game: GameStateWithPersisted,
  modeId: ModeId,
  levelId: LevelId,
): void {
  for (const playerId of game.playerIds) {
    const persisted = game.persisted[playerId];
    if (!persisted) continue;
    const progress = persisted.progress ?? {};
    const ids = progress[modeId] ?? [];
    if (!ids.includes(levelId)) progress[modeId] = [...ids, levelId];
    persisted.progress = progress;

    const own = game.ownProgress[playerId] ?? ownProgressFromPersisted(persisted);
    own[modeId] = { ...own[modeId], [levelId]: true };
    game.ownProgress[playerId] = own;
  }
  rebuildSharedProgress(game);
}

// Comptes de mots par joueur actif à l'instant de la victoire (classement,
// doc 07) : un joueur parti avant la fin n'apparaît pas (Q7b) — ses mots
// restent dans `found` mais ne sont attribués à personne au classement.
function wordCountsByPlayer(game: RuneGameState): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {};
  for (const playerId of game.playerIds) counts[playerId] = 0;
  for (const entry of game.found) {
    if (entry.by in counts) counts[entry.by]++;
  }
  return counts;
}

// Effet complet d'une victoire (doc 02/03/07) : crédite tous les joueurs
// actifs, fige le winSummary (comptes, première validation AU SENS DE
// L'UNION — avant crédit —, étoile après crédit, palier débloqué), vide les
// tracés. Seul appelant : submitWord, quand la grille vient de se compléter.
export function applyVictory(
  game: GameStateWithPersisted,
  modeId: ModeId,
  levelId: LevelId,
): void {
  const wasAlreadyShared = levelId in game.sharedProgress[modeId];
  creditWin(game, modeId, levelId);

  const starCountAfter = starCount(toModeProgress(game.sharedProgress[modeId]));
  const firstValidation = !wasAlreadyShared;
  // Seuls les défis rapportent une étoile : un normal ne débloque jamais de
  // palier, même en première validation.
  const rewardCode =
    firstValidation && isDefi(levelId) ? starRewardAt(modeId, starCountAfter) : null;

  const summary: WinSummary = {
    counts: wordCountsByPlayer(game),
    firstValidation,
    starCount: starCountAfter,
    rewardCode,
  };

  game.won = true;
  game.winSummary = summary;
  game.traces = {};
}

// Enveloppe l'union ENTIÈRE (tous modes, pas seulement `modeId`) : c'est ce
// qu'attend isModeUnlocked, qui vérifie toute la chaîne des modes précédents
// (doc 01 § conformité #6) — jamais stocké, un adaptateur d'appel de plus.
function wrapAllModes(shared: ProgressByMode): Record<ModeId, ModeProgress> {
  const out = {} as Record<ModeId, ModeProgress>;
  for (const modeId of MODE_ORDER) out[modeId] = toModeProgress(shared[modeId]);
  return out;
}

// Un niveau est « jouable » (proposable) si son MODE est débloqué (union,
// étoiles des modes précédents) ET que la case elle-même est active ou déjà
// validée dans l'union — même double condition que la carte (un onglet
// verrouillé n'est pas cliquable, cf. map.ts § buildTabs), le rejeu reste
// permis (doc 04 § Q17). Sans le premier terme, un client pourrait proposer
// n'importe quel niveau d'un mode encore fermé : la case "1-1" d'un mode est
// toujours "active" en soi (elle ne coûte aucune étoile), seul le mode l'est.
export function isLevelPlayable(
  shared: ProgressByMode,
  modeId: ModeId,
  levelId: LevelId,
): boolean {
  if (!isModeUnlocked(wrapAllModes(shared), modeId)) return false;
  const state = cellState(toModeProgress(shared[modeId]), levelId);
  return state === "active" || state === "validated";
}
