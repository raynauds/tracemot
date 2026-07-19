// Rune.initLogic v1 (doc 02-etat-et-actions.md) : phase globale (map/
// playing), progression partagée (union, doc 03), lobby de proposition/vote
// (doc 04), tracé validé de façon autoritaire (doc 01 § Données de niveaux).
// Le client n'est pas encore branché (chantier suivant, doc 09) : ce fichier
// n'est lu que par la VM logic (predict-rollback).

import { DEFAULT_MODE, createGeometry, levelMode } from "@tracemot/core";
import { resolveLevel } from "../levels/data.ts";
import { wordRejectReason } from "../game/rules.ts";
import { isTraceWithinGrid, isValidTrace, wordFromPath } from "./board.ts";
import {
  acceptProposal,
  cancelProposal as closeProposal,
  canProposeAbandon,
  canProposeLevel,
  expireProposalIfTimedOut,
  handleProposalOnPlayerLeft,
  openProposal,
  refuseProposal,
} from "./lobby.ts";
import {
  applyVictory,
  emptySharedProgress,
  isLevelPlayable,
  ownProgressFromPersisted,
  rebuildSharedProgress,
} from "./progression.ts";
import type { ColorSlot, PlayerId, RuneGameState } from "./types.ts";

// Premier slot de couleur libre parmi 0..3 (doc 02/06) : maxPlayers vaut 4,
// il y en a donc toujours un.
function nextFreeColorSlot(colorSlots: Record<PlayerId, ColorSlot>): ColorSlot {
  const used = new Set(Object.values(colorSlots));
  for (const slot of [0, 1, 2, 3] as const) {
    if (!used.has(slot)) return slot;
  }
  return 0; // inatteignable (room ≤ maxPlayers === 4 joueurs).
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  persistPlayerData: true,

  setup: (allPlayerIds, { game: { persisted } }) => {
    const colorSlots: Record<PlayerId, ColorSlot> = {};
    const ownProgress: RuneGameState["ownProgress"] = {};
    for (const playerId of allPlayerIds) {
      colorSlots[playerId] = nextFreeColorSlot(colorSlots);
      ownProgress[playerId] = ownProgressFromPersisted(persisted[playerId] ?? {});
    }

    const game: RuneGameState = {
      phase: "map",
      playerIds: [...allPlayerIds],
      colorSlots,
      sharedProgress: emptySharedProgress(),
      ownProgress,
      proposal: null,
      lastRefusal: null,
      modeId: DEFAULT_MODE,
      levelId: null,
      found: [],
      won: false,
      winSummary: null,
      traces: {},
    };
    rebuildSharedProgress(game);
    return game;
  },

  actions: {
    proposeLevel({ modeId, levelId }, { game, playerId }) {
      if (!canProposeLevel(game)) throw Rune.invalidAction();
      if (!isLevelPlayable(game.sharedProgress, modeId, levelId)) {
        throw Rune.invalidAction();
      }
      openProposal(game, playerId, "level", modeId, levelId);
    },

    proposeAbandon(_payload, { game, playerId }) {
      if (!canProposeAbandon(game)) throw Rune.invalidAction();
      openProposal(game, playerId, "abandon", null, null);
    },

    answerProposal({ accept }, { game, playerId }) {
      const proposal = game.proposal;
      if (!proposal) throw Rune.invalidAction();
      if (proposal.proposedBy === playerId) throw Rune.invalidAction();
      if (proposal.accepted.includes(playerId)) throw Rune.invalidAction();
      if (accept) acceptProposal(game, playerId);
      else refuseProposal(game, playerId);
    },

    cancelProposal(_payload, { game, playerId }) {
      const proposal = game.proposal;
      if (!proposal) throw Rune.invalidAction();
      if (proposal.proposedBy !== playerId) throw Rune.invalidAction();
      closeProposal(game);
    },

    updateTrace({ path }, { game, playerId }) {
      if (game.phase !== "playing" || game.won) throw Rune.invalidAction();
      if (!game.levelId) throw Rune.invalidAction();
      const level = resolveLevel(game.modeId, game.levelId);
      if (!level) throw Rune.invalidAction();
      const mode = levelMode(game.modeId, level.id);
      const geometry = createGeometry(mode.rows, mode.cols);
      if (!isTraceWithinGrid(path, geometry)) throw Rune.invalidAction();
      game.traces[playerId] = path;
    },

    submitWord({ path }, { game, playerId }) {
      if (game.phase !== "playing" || game.won) throw Rune.invalidAction();
      if (!game.levelId) throw Rune.invalidAction();
      const level = resolveLevel(game.modeId, game.levelId);
      if (!level) throw Rune.invalidAction();
      const mode = levelMode(game.modeId, level.id);
      const geometry = createGeometry(mode.rows, mode.cols);
      if (!isValidTrace(path, geometry, game.found)) throw Rune.invalidAction();

      const word = wordFromPath(level.letters.split(""), path);
      const reject = wordRejectReason(word, {
        wordLength: mode.wordLength,
        solution: level.words,
        found: game.found.map((entry) => entry.word),
      });
      if (reject) throw Rune.invalidAction();

      game.found.push({ word, path, by: playerId });
      game.traces[playerId] = [];

      if (game.found.length >= level.words.length) {
        applyVictory(game, game.modeId, level.id);
      }
    },

    // --- Préférences (ex-localStorage, doc 02/08) --------------------------
    // Écrivent uniquement `persisted[playerId]` : aucun effet sur `game`, donc
    // aucune garde de phase — une préférence peut se poser à tout moment,
    // carte ou partie.
    setLastMode({ modeId }, { game, playerId }) {
      game.persisted[playerId].lastMode = modeId;
    },

    markModeSeen({ modeId }, { game, playerId }) {
      const persisted = game.persisted[playerId];
      const seen = new Set(persisted.seenModes ?? []);
      seen.add(modeId);
      persisted.seenModes = [...seen];
    },

    setHelpSeen(_payload, { game, playerId }) {
      game.persisted[playerId].helpSeen = true;
    },
  },

  update: ({ game }) => {
    expireProposalIfTimedOut(game);
  },

  events: {
    playerJoined: (playerId, { game }) => {
      if (!game.playerIds.includes(playerId)) game.playerIds.push(playerId);
      if (!(playerId in game.colorSlots)) {
        game.colorSlots[playerId] = nextFreeColorSlot(game.colorSlots);
      }
      game.ownProgress[playerId] = ownProgressFromPersisted(
        game.persisted[playerId] ?? {},
      );
      rebuildSharedProgress(game);
      // Pendant un vote, il n'a rien de plus à faire ici : isUnanimous()
      // (lobby.ts) compare `accepted` à `game.playerIds`, qui le compte déjà
      // — il rejoint donc mécaniquement le décompte requis (doc 04 § Q12b).
      // En phase playing, il reçoit tout par stateSync et joue directement
      // (doc 04 § Arrivées et départs, → Q12) : rien à écrire de plus.
    },

    playerLeft: (playerId, { game }) => {
      game.playerIds = game.playerIds.filter((id) => id !== playerId);
      delete game.colorSlots[playerId];
      delete game.traces[playerId];
      delete game.ownProgress[playerId];
      rebuildSharedProgress(game);
      handleProposalOnPlayerLeft(game, playerId);
      // Ses FoundWord restent (mots validés pour la grille, doc 02/04).
    },
  },
});
