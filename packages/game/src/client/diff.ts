// Détection d'événements de présentation par comparaison `game`/`previousGame`
// (doc 02 § Client : onChange). Fonctions PURES, par VALEUR (longueurs,
// booléens, énumérés) — jamais par égalité référentielle d'objets imbriqués :
// `reactive: false` (doc 01 § R3) la retirerait, et rien ici n'en dépend.
//
// Lobby de proposition/vote (doc 04 § chantier 3) : l'overlay/prompt lui-même
// se peint à CHAQUE onChange depuis `game.proposal` seul (render/lobby.ts,
// idempotent — pas besoin de diff pour ça, y compris à la reconstruction). Ce
// qui EST un diff, ci-dessous : les notifications transitoires (snackbar),
// qui elles ne doivent jamais rejouer sur un stateSync (doc 02 § onChange).
//
// Chantier 4 (doc 05 § Conflits) : `wordRaceLost` détecte une course perdue
// sur le même mot via `rollbacks` d'onChange (mon `submitWord` invalidé) —
// même principe « par valeur », mais sur un tableau fourni par Rune plutôt
// que sur `game`/`previousGame`.

import type { PlayerId, RuneGameState } from "../logic/types.ts";

// Une manche démarre : soit la room bascule de la carte à la partie (premier
// lancement ou après un abandon), soit elle enchaîne depuis l'écran de
// victoire (SUIVANT/DÉFI, ou rejeu) — `phase` reste "playing" dans ce second
// cas, seul `won` retombe à faux (lobby.ts § applyProposal).
export function isRoundStart(
  game: RuneGameState,
  previousGame: RuneGameState,
): boolean {
  if (game.phase !== "playing") return false;
  return previousGame.phase !== "playing" || (previousGame.won && !game.won);
}

// La room revient à la carte : un abandon (proposeAbandon) vient d'être
// accepté. Le retour LOCAL depuis l'écran de victoire (doc 02 § Machine de
// phase) n'est PAS de ce ressort — `phase` n'y change pas.
export function isRoundEnd(
  game: RuneGameState,
  previousGame: RuneGameState,
): boolean {
  return game.phase === "map" && previousGame.phase === "playing";
}

// La grille vient tout juste d'être complétée par ce tick (par n'importe quel
// joueur) : déclenche la séquence de victoire différée (WIN_DELAY_MS).
export function justWon(
  game: RuneGameState,
  previousGame: RuneGameState,
): boolean {
  return !previousGame.won && game.won;
}

// Un tick d'`update()` (timeout de proposition, 1/s, doc 02) ou de `timeSync`
// ne change jamais rien qui nous intéresse ici (aucune UI de vote construite,
// cf. l'en-tête du fichier) : sans ce filtre, la carte se re-rendrait chaque
// seconde pour rien tant qu'elle reste affichée.
export function isBackgroundTick(eventName: string | undefined): boolean {
  return eventName === "update" || eventName === "timeSync";
}

// Une NOUVELLE proposition vient de fermer sans unanimité (doc 04 § Refus /
// Timeout) : `lastRefusal` change de valeur, qu'il vienne de `null` (aucun
// refus depuis le début de la manche) ou d'un refus antérieur (seq bornant
// les deux). Ne se déclenche jamais sur un stateSync : l'appelant (client.ts)
// n'invoque cette fonction que dans la branche normale de onChange, jamais
// dans celle de la reconstruction (doc 02 § « jamais sur stateSync ») — et à
// l'appel suivant, `previousGame` reflète déjà l'état reconstruit, donc un
// refus déjà connu au moment du stateSync ne peut plus ressortir ici.
export function refusalJustHappened(
  game: RuneGameState,
  previousGame: RuneGameState,
): boolean {
  if (!game.lastRefusal) return false;
  return (
    !previousGame.lastRefusal ||
    previousGame.lastRefusal.seq !== game.lastRefusal.seq
  );
}

// Course de deux `proposeLevel` quasi simultanés (doc 04 § Qui propose) : MA
// proposition optimiste (previousGame me montrait comme proposedBy) est
// remplacée par celle d'un autre joueur SANS jamais passer par `null` entre
// les deux — signature d'un rollback predict-rollback (mon action a échoué,
// invalidAction, cf. logic/logic.ts § proposeLevel), pas d'un refus/
// annulation normaux (qui, eux, ramènent `proposal` à `null` avant qu'une
// nouvelle proposition ne puisse s'ouvrir).
export function proposalRaceLost(
  game: RuneGameState,
  previousGame: RuneGameState,
  yourPlayerId: PlayerId | undefined,
): boolean {
  if (!yourPlayerId) return false;
  if (previousGame.proposal?.proposedBy !== yourPlayerId) return false;
  if (!game.proposal) return false;
  return game.proposal.proposedBy !== yourPlayerId;
}

export interface WordRace {
  winner: PlayerId;
  word: string;
}

// Course sur le MÊME mot (doc 05 § Conflits point 1) : les deux clients
// valident localement et soumettent, seul l'ordre serveur tranche. Signal
// PRINCIPAL : `rollbacks` (doc api rune-sdk — les actions optimistes de CE
// client invalidées à ce tick) porte un `submitWord` de ma part, donc ma
// soumission a perdu la course. Diff de `found` en FILET pour retrouver
// l'identité du gagnant : la première entrée fraîchement confirmée qui n'est
// pas de moi, parmi celles apparues entre `previousGame` et `game` — une
// hypothèse raisonnable tant qu'une seule course a lieu par tick, ce qui est
// le cas courant (deux mots distincts validés au même tick ne se
// « percutent » pas, ils s'ajoutent simplement tous les deux à `found`).
export function wordRaceLost(
  game: RuneGameState,
  previousGame: RuneGameState,
  yourPlayerId: PlayerId | undefined,
  rollbacks: { name: string; playerId: PlayerId }[],
): WordRace | null {
  if (!yourPlayerId) return null;
  const lostSubmit = rollbacks.some(
    (r) => r.name === "submitWord" && r.playerId === yourPlayerId,
  );
  if (!lostSubmit) return null;
  for (let i = previousGame.found.length; i < game.found.length; i++) {
    const entry = game.found[i];
    if (entry.by !== yourPlayerId) return { winner: entry.by, word: entry.word };
  }
  return null;
}
