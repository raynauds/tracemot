// État Rune complet (doc 02-etat-et-actions.md) : la seule source de vérité
// pendant la partie, synchronisée par predict-rollback. JSON pur (aucune
// classe, aucun Set/Map — cf. doc 01 § conformité #3/#6).
//
// `phase` est globale (la room), les écrans sont locaux (chaque client) : les
// deux ne se confondent jamais (doc 02 § Machine de phase).

import type { LevelId, ModeId } from "@tracemot/core";
import type { RuneClient } from "rune-sdk";

export type PlayerId = string;

// Slot de couleur GLOBAL (0..3) : la teinte de X est la même sur tous les
// écrans (doc 06). maxPlayers vaut 4, donc 4 slots suffisent toujours.
export type ColorSlot = 0 | 1 | 2 | 3;

// Progression d'un mode : Record<LevelId, true> nu (pas de wrapper) — c'est
// la forme exacte stockée dans sharedProgress/ownProgress ET dans
// persisted.progress une fois converti (doc 01 § conformité #3/#6). Les
// dérivations pures de ../game/progress.ts attendent un `ModeProgress`
// ({ validated }) : logic/progression.ts fait l'aller-retour au moment de
// l'appel, sans jamais stocker le wrapper.
export type ModeProgressRecord = Record<LevelId, true>;
export type ProgressByMode = Record<ModeId, ModeProgressRecord>;

export interface FoundWord {
  word: string;
  path: number[];
  by: PlayerId;
}

export type ProposalKind = "level" | "abandon";

export interface Proposal {
  kind: ProposalKind;
  modeId: ModeId | null; // null pour un abandon
  levelId: LevelId | null; // idem
  proposedBy: PlayerId;
  accepted: PlayerId[]; // proposedBy y figure d'office
  openedAt: number; // Rune.gameTime() — timeout via update()
}

export interface LastRefusal {
  by: PlayerId;
  kind: ProposalKind;
  seq: number;
  // Distingue l'affichage (doc 04 § chantier 3) : un refus explicite
  // (snackbar « X a refusé ») d'une proposition qui s'éteint faute de
  // réponse (« sans réponse de X », timeout 30 s posé par update()) — même
  // forme de state, deux présentations différentes côté client.
  reason: "refused" | "timeout";
}

export interface WinSummary {
  counts: Record<PlayerId, number>; // joueurs actifs à la victoire (classement)
  firstValidation: boolean; // au sens de l'union (bloc étoile)
  starCount: number; // après crédit
  rewardCode: string | null; // palier débloqué (code, libellé côté client)
}

export type GamePhase = "map" | "playing";

export interface RuneGameState {
  // --- Room -----------------------------------------------------------------
  phase: GamePhase;
  playerIds: PlayerId[]; // joueurs actifs, ordre d'arrivée
  colorSlots: Record<PlayerId, ColorSlot>;

  // --- Progression partagée (doc 03) -----------------------------------------
  sharedProgress: ProgressByMode; // union
  ownProgress: Record<PlayerId, ProgressByMode>;

  // --- Lobby (doc 04) ---------------------------------------------------------
  proposal: Proposal | null;
  lastRefusal: LastRefusal | null;

  // --- Partie en cours (phase === "playing") ----------------------------------
  modeId: ModeId;
  levelId: LevelId | null; // lettres/solution résolues depuis le bundle (levels/data.ts)
  found: FoundWord[]; // ordre de validation conservé (registre, stateSync)
  won: boolean;
  winSummary: WinSummary | null;

  // --- Présence temps réel (doc 05) --------------------------------------------
  traces: Record<PlayerId, number[]>; // vidé à la victoire et au lancement
}

// game.persisted (par joueur, doc 02/03) : toute clé peut être absente
// (première partie, ancien schéma) — lecture tolérante, sans try/catch (de
// simples tests d'existence suffisent en JSON, doc 03 § Persisted).
export interface Persisted {
  schema?: number;
  // Partial : une ancienne version peut n'avoir validé aucun niveau d'un
  // mode donné — chaque clé est absente plutôt que vide (doc 03 § Persisted).
  progress?: Partial<Record<ModeId, LevelId[]>>;
  lastMode?: ModeId; // préférences (ex-localStorage)
  seenModes?: ModeId[];
  helpSeen?: boolean;
}

// game tel que le voient les actions/events (avec persisted, PersistedData
// n'étant pas `false` — cf. rune-sdk/multiplayer.d.ts GameStateWithPersisted).
export type GameStateWithPersisted = RuneGameState & {
  persisted: Record<PlayerId, Persisted>;
};

// --- Payloads d'actions (doc 02 § Actions) -----------------------------------

export interface ProposeLevelPayload {
  modeId: ModeId;
  levelId: LevelId;
}

export type ProposeAbandonPayload = Record<string, never>;

export interface AnswerProposalPayload {
  accept: boolean;
}

export type CancelProposalPayload = Record<string, never>;

export interface UpdateTracePayload {
  path: number[];
}

export interface SubmitWordPayload {
  path: number[];
}

// --- Préférences (persisted, doc 02 § Persisted / doc 08) -------------------
// Ex-localStorage : dernier onglet de carte consulté, modes déjà ouverts,
// écran d'aide déjà vu. Écrites par des actions dédiées — le client ne mute
// jamais `persisted` lui-même, il ne fait que le lire (game.persisted[playerId]).

export interface SetLastModePayload {
  modeId: ModeId;
}

export interface MarkModeSeenPayload {
  modeId: ModeId;
}

export type SetHelpSeenPayload = Record<string, never>;

export interface GameActions {
  proposeLevel: (payload: ProposeLevelPayload) => void;
  proposeAbandon: (payload: ProposeAbandonPayload) => void;
  answerProposal: (payload: AnswerProposalPayload) => void;
  cancelProposal: (payload: CancelProposalPayload) => void;
  updateTrace: (payload: UpdateTracePayload) => void;
  submitWord: (payload: SubmitWordPayload) => void;
  setLastMode: (payload: SetLastModePayload) => void;
  markModeSeen: (payload: MarkModeSeenPayload) => void;
  setHelpSeen: (payload: SetHelpSeenPayload) => void;
  // Signature d'index requise par UntypedInitLogicActions (rune-sdk) : une
  // interface à membres fixes ne satisfait pas `extends Record<string, ...>`
  // sans elle. Les six actions ci-dessus restent seules typées précisément ;
  // aucune autre clé n'est appelée.
  [action: string]: (payload: any) => void;
}

// Déclaration globale unique du SDK (doc 01 : Rune est un global, jamais
// importé à l'exécution) — les autres fichiers de src/logic/ la trouvent
// sans rien importer, comme le veut la convention Rune (cf. rune-sdk/eslint.js,
// qui déclare `Rune` en global ESLint pour tout fichier logic).
declare global {
  const Rune: RuneClient<RuneGameState, GameActions, Persisted>;
}
