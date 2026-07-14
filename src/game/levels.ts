// Niveaux prédéfinis : types, chargement et lecture d'un identifiant « s-n ».
//
// Toutes les grilles sont générées hors-ligne (scripts/generate-levels.ts) et
// versionnées dans public/levels/<modeId>.json ; le runtime ne génère plus
// rien et ne charge plus de dictionnaire. Un mode = 4 sections × 25 niveaux ;
// les niveaux 1..24 d'une section sont des grilles normales du mode, le 25 est
// son boss (« Défi »), qui joue sur la géométrie doublée de bossMode().
//
// Ce module ne connaît ni la progression ni le DOM : il ne fait que fournir la
// donnée d'un niveau et l'arithmétique de son identifiant.

import {
  GAME_MODES,
  bossMode,
  type GameMode,
  type ModeId,
  type Section,
} from "./config.ts";

// Identifiant « section-numéro » : "1-1" … "4-25". Volontairement une simple
// chaîne : elle transite par le JSON, le localStorage et le DOM (data-id).
export type LevelId = string;

export interface LevelData {
  id: LevelId;
  letters: string; // rows×cols caractères, ligne par ligne
  words: string[]; // solution
  paths: number[][]; // tracé de chaque mot (indices de cases), aligné sur words
}

export interface ModeLevels {
  modeId: ModeId;
  levels: Record<LevelId, LevelData>;
}

export const LEVELS_PER_SECTION = 25;
export const BOSS_NUMBER = 25;

// Un fichier par mode, chargé à l'ouverture de son onglet. Le cache évite de
// le relire à chaque aller-retour carte ↔ partie ; les promesses sont mises en
// cache (et non les résultats) pour dédupliquer deux ouvertures simultanées.
const cache = new Map<ModeId, Promise<ModeLevels>>();

export async function loadModeLevels(modeId: ModeId): Promise<ModeLevels> {
  let pending = cache.get(modeId);
  if (!pending) {
    pending = fetchModeLevels(modeId);
    // Un échec ne doit pas empoisonner le cache : on retente au prochain appel.
    pending.catch(() => cache.delete(modeId));
    cache.set(modeId, pending);
  }
  return pending;
}

async function fetchModeLevels(modeId: ModeId): Promise<ModeLevels> {
  const url = `levels/${modeId}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Tracemot : niveaux du mode « ${modeId} » introuvables (${url} : ` +
        `${res.status})`,
    );
  }
  const data = (await res.json()) as ModeLevels;
  if (!data || data.modeId !== modeId || !data.levels) {
    throw new Error(`Tracemot : ${url} invalide (modeId ou levels manquant)`);
  }
  return data;
}

export function isBoss(id: LevelId): boolean {
  return id.endsWith(`-${BOSS_NUMBER}`);
}

export function sectionOf(id: LevelId): Section {
  return Number(id.split("-")[0]) as Section;
}

export function levelNumber(id: LevelId): number {
  return Number(id.split("-")[1]);
}

export function levelId(section: Section, n: number): LevelId {
  return `${section}-${n}`;
}

// Géométrie effective d'un niveau : celle du mode, sauf pour un boss qui joue
// sur la grille doublée.
export function levelMode(modeId: ModeId, id: LevelId): GameMode {
  const mode = GAME_MODES[modeId];
  return isBoss(id) ? bossMode(mode) : mode;
}

// Étiquette affichée dans le header en partie : « 5×5 · 1-12 ».
export function levelLabel(modeId: ModeId, id: LevelId): string {
  return `${modeId.replace("x", "×")} · ${id}`;
}
