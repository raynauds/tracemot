// Données de niveaux : import STATIQUE des 4 JSON prégénérés (doc 01 §
// « Données de niveaux »). Plus de fetch runtime ni de cache de promesses
// (l'ancien game/level-loader.ts a disparu) : les 288 niveaux sont inline
// dans le bundle, aussi bien logic.js (153 Ko, ~15 % de la limite de 1 Mo)
// que client.js — les deux sont générés du même source au même build, donc
// aucun risque de dérive entre ce que la logic valide et ce que le client
// affiche.
//
// Les fichiers vivent dans ./json/ et sont écrits hors-ligne par
// packages/studio/scripts/generate-levels.ts — ce module ne fait que les
// importer et exposer une résolution synchrone (modeId, levelId) → niveau.

import type { LevelData, LevelId, ModeId, ModeLevels } from "@traceword/core";
import mode5x5 from "./json/5x5.json";
import mode6x6 from "./json/6x6.json";
import mode7x7 from "./json/7x7.json";
import mode8x8 from "./json/8x8.json";

// Les imports JSON sont typés en large par TS (littéraux non contraints à
// ModeId/LevelId) ; le contenu est produit par generate-levels.ts qui, lui,
// respecte ModeLevels — la seule assertion vit ici, au point d'entrée.
const MODE_LEVELS: Record<ModeId, ModeLevels> = {
  "5x5": mode5x5 as ModeLevels,
  "6x6": mode6x6 as ModeLevels,
  "7x7": mode7x7 as ModeLevels,
  "8x8": mode8x8 as ModeLevels,
};

/** Toutes les grilles d'un mode. */
export function modeLevels(modeId: ModeId): ModeLevels {
  return MODE_LEVELS[modeId];
}

/** Résout un niveau précis ; `undefined` si l'identifiant n'existe pas dans
 *  ce mode (identifiant corrompu ou obsolète — n'arrive pas en usage normal,
 *  la carte ne propose que des identifiants qu'elle a elle-même générés). */
export function resolveLevel(modeId: ModeId, id: LevelId): LevelData | undefined {
  return MODE_LEVELS[modeId].levels[id];
}
