// Machine proposal/vote (doc 02 § Actions, doc 04 § Machine à états du
// vote) : n'importe qui propose (une proposition à la fois), unanimité des
// joueurs actifs, refus ferme la proposition pour tout le monde, annulation
// par le proposeur sans snackbar, expiration après 30 s sans unanimité (via
// update(), Rune.gameTime() — une action ne peut jamais s'auto-expirer).

import type { LevelId, ModeId } from "@traceword/core";
import type { PlayerId, ProposalKind, RuneGameState } from "./types.ts";

export const PROPOSAL_TIMEOUT_MS = 30_000;

export function canProposeLevel(game: RuneGameState): boolean {
  return (game.phase === "map" || game.won) && game.proposal === null;
}

export function canProposeAbandon(game: RuneGameState): boolean {
  return game.phase === "playing" && !game.won && game.proposal === null;
}

function isUnanimous(game: RuneGameState): boolean {
  const proposal = game.proposal;
  if (!proposal) return false;
  return game.playerIds.every((id) => proposal.accepted.includes(id));
}

// Applique la proposition en cours (unanimité atteinte) : lance le niveau ou
// revient à la carte selon `kind`, remet proposal/lastRefusal à zéro (doc 04).
function applyProposal(game: RuneGameState): void {
  const proposal = game.proposal;
  if (!proposal) return;
  if (proposal.kind === "level" && proposal.modeId && proposal.levelId) {
    game.phase = "playing";
    game.modeId = proposal.modeId;
    game.levelId = proposal.levelId;
  } else {
    game.phase = "map";
  }
  game.found = [];
  game.won = false;
  game.winSummary = null;
  game.traces = {};
  game.proposal = null;
  game.lastRefusal = null;
}

// Ouvre une proposition, auto-acceptée par son auteur (proposedBy y figure
// d'office) ; seul en room, elle s'applique tout de suite (doc 04 § Solo en
// room — pas d'étape de vote).
export function openProposal(
  game: RuneGameState,
  playerId: PlayerId,
  kind: ProposalKind,
  modeId: ModeId | null,
  levelId: LevelId | null,
): void {
  game.proposal = {
    kind,
    modeId,
    levelId,
    proposedBy: playerId,
    accepted: [playerId],
    openedAt: Rune.gameTime(),
  };
  if (game.playerIds.length === 1) applyProposal(game);
}

function nextRefusalSeq(game: RuneGameState): number {
  return (game.lastRefusal?.seq ?? 0) + 1;
}

// Un joueur accepte : ajoute son id, applique la proposition si l'unanimité
// est désormais atteinte.
export function acceptProposal(game: RuneGameState, playerId: PlayerId): void {
  const proposal = game.proposal;
  if (!proposal) return;
  if (!proposal.accepted.includes(playerId)) proposal.accepted.push(playerId);
  if (isUnanimous(game)) applyProposal(game);
}

// Un refus ferme la proposition pour tout le monde et pose lastRefusal (doc
// 04 § Refus) — la snackbar elle-même (« X a refusé », sauf chez X) est un
// geste client, doc 02 § onChange.
export function refuseProposal(game: RuneGameState, playerId: PlayerId): void {
  const proposal = game.proposal;
  if (!proposal) return;
  game.lastRefusal = {
    by: playerId,
    kind: proposal.kind,
    seq: nextRefusalSeq(game),
    reason: "refused",
  };
  game.proposal = null;
}

// Annulation par le proposeur : ferme la proposition SANS lastRefusal (pas de
// snackbar « a refusé », doc 04 § Annulation).
export function cancelProposal(game: RuneGameState): void {
  game.proposal = null;
}

// update() : fait expirer une proposition sans unanimité après 30 s — seul
// mécanisme capable de le faire (doc 02 § update()). `by` : un joueur qui n'a
// pas encore répondu (premier du roster dans son ordre) ; à défaut (cas
// dégénéré) le proposeur. `reason: "timeout"` distingue l'affichage (« sans
// réponse de X ») du refus explicite (« X a refusé »), doc 04 § chantier 3.
export function expireProposalIfTimedOut(game: RuneGameState): void {
  const proposal = game.proposal;
  if (!proposal) return;
  if (Rune.gameTime() - proposal.openedAt <= PROPOSAL_TIMEOUT_MS) return;
  const nonRespondent =
    game.playerIds.find((id) => !proposal.accepted.includes(id)) ?? proposal.proposedBy;
  game.lastRefusal = {
    by: nonRespondent,
    kind: proposal.kind,
    seq: nextRefusalSeq(game),
    reason: "timeout",
  };
  game.proposal = null;
}

// Effet d'un départ sur une proposition en cours (doc 04 § Arrivées et
// départs) : le proposeur qui part annule SANS snackbar (même sémantique
// qu'une annulation) ; un votant qui part est simplement retiré des
// accepted, ce qui peut suffire à atteindre l'unanimité. À appeler APRÈS le
// retrait du roster (game.playerIds déjà privé de playerId).
export function handleProposalOnPlayerLeft(game: RuneGameState, playerId: PlayerId): void {
  const proposal = game.proposal;
  if (!proposal) return;
  if (proposal.proposedBy === playerId) {
    game.proposal = null;
    return;
  }
  proposal.accepted = proposal.accepted.filter((id) => id !== playerId);
  if (isUnanimous(game)) applyProposal(game);
}
