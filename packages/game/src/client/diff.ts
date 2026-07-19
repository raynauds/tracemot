// Détection d'événements de présentation par comparaison `game`/`previousGame`
// (doc 02 § Client : onChange). Fonctions PURES, par VALEUR (longueurs,
// booléens, énumérés) — jamais par égalité référentielle d'objets imbriqués :
// `reactive: false` (doc 01 § R3) la retirerait, et rien ici n'en dépend.
//
// Ce que ce module NE couvre PAS (hors périmètre de la parité solo, doc 09
// chantiers 3/4/5) : le lobby de proposition/vote (`proposal`/`lastRefusal`),
// les tracés distants (`traces[p]`), le rollback d'un `submitWord` optimiste
// perdu (`rollbacks`). logic.ts les gère déjà côté état ; leur PRÉSENTATION
// reste à construire aux chantiers dédiés — voir le rapport de mission.

import type { RuneGameState } from "../logic/types.ts";

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
