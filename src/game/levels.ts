// Niveaux prédéfinis : types, chargement et arithmétique des identifiants.
//
// Toutes les grilles sont générées hors-ligne (scripts/generate-levels.ts) et
// versionnées dans public/levels/<modeId>.json ; le runtime ne génère plus
// rien et ne charge plus de dictionnaire.
//
// Un mode = 4 sections × 18 niveaux. Une section = 3 LIGNES de 5 niveaux
// normaux, chaque ligne étant close par un DÉFI (grille doublée, cf.
// defiMode()) : la ligne 1 porte les normaux 1..5 puis le défi A, la ligne 2
// les 6..10 puis B, la ligne 3 les 11..15 puis C. La numérotation des normaux
// est continue sur la section (1..15) — la ligne est une lecture, pas une
// coordonnée : d'où rowOf(), qui la redonne à partir du seul numéro.
//
// Ce module ne connaît ni la progression ni le DOM : il ne fait que fournir la
// donnée d'un niveau et l'arithmétique de son identifiant.

import {
  GAME_MODES,
  defiMode,
  type GameMode,
  type ModeId,
  type Section,
} from "./config.ts";

// Identifiant de niveau : « s-n » pour un normal ("1-12"), « s-A/B/C » pour un
// défi ("1-A"). Volontairement une simple chaîne : elle transite par le JSON,
// le localStorage et le DOM (data-level).
export type LevelId = string;
export type DefiKey = "A" | "B" | "C";
export type Row = 1 | 2 | 3;

export const ROW_LENGTH = 5; // niveaux normaux par ligne
export const ROWS_PER_SECTION = 3;
export const NORMALS_PER_SECTION = ROW_LENGTH * ROWS_PER_SECTION; // 15
export const DEFI_KEYS: DefiKey[] = ["A", "B", "C"];
export const LEVELS_PER_SECTION = NORMALS_PER_SECTION + DEFI_KEYS.length; // 18

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

// --- Construction et lecture d'un identifiant --------------------------------

export function levelId(section: Section, n: number): LevelId {
  return `${section}-${n}`;
}

export function defiId(section: Section, key: DefiKey): LevelId {
  return `${section}-${key}`;
}

// Le suffixe suffit à trancher : un normal finit toujours par un chiffre.
const DEFI_SUFFIX = /-([ABC])$/;

export function isDefi(id: LevelId): boolean {
  return DEFI_SUFFIX.test(id);
}

export function defiKeyOf(id: LevelId): DefiKey | null {
  const m = DEFI_SUFFIX.exec(id);
  return m ? (m[1] as DefiKey) : null;
}

export function sectionOf(id: LevelId): Section {
  return Number(id.split("-")[0]) as Section;
}

// Numéro 1..15 d'un niveau NORMAL. Appelée sur un défi, elle renverrait NaN :
// les appelants trient d'abord avec isDefi().
export function levelNumber(id: LevelId): number {
  return Number(id.split("-")[1]);
}

// --- Lignes ------------------------------------------------------------------

export function rowOf(n: number): Row {
  return Math.ceil(n / ROW_LENGTH) as Row;
}

export function defiOfRow(row: Row): DefiKey {
  return DEFI_KEYS[row - 1];
}

export function rowOfDefi(key: DefiKey): Row {
  return (DEFI_KEYS.indexOf(key) + 1) as Row;
}

// Dernier normal d'une ligne (5, 10, 15) : c'est LUI qui ouvre le défi de la
// ligne et le premier normal de la suivante (cf. progress.ts).
export function lastNormalOfRow(row: Row): number {
  return row * ROW_LENGTH;
}

// --- Ordre canonique ---------------------------------------------------------
//
// L'ordre de JEU, entrelacé : 1-1…1-5, 1-A, 1-6…1-10, 1-B, 1-11…1-15, 1-C,
// 2-1, … Il sert à la fois de rang de tri (JSON des niveaux : diff stable) et
// d'ordre de lecture humain. Chaque ligne occupe 6 rangs — ses 5 normaux puis
// son défi — d'où l'index ci-dessous, qui numérote les 72 niveaux d'un mode.
const RANKS_PER_ROW = ROW_LENGTH + 1;

function canonicalIndex(id: LevelId): number {
  const s = sectionOf(id);
  const key = defiKeyOf(id);
  const row = key ? rowOfDefi(key) : rowOf(levelNumber(id));
  const base = (s - 1) * LEVELS_PER_SECTION + (row - 1) * RANKS_PER_ROW;
  // Le défi ferme sa ligne : il vient après ses 5 normaux.
  return key ? base + ROW_LENGTH : base + ((levelNumber(id) - 1) % ROW_LENGTH);
}

export function compareLevelIds(a: LevelId, b: LevelId): number {
  return canonicalIndex(a) - canonicalIndex(b);
}

export function sectionLevelIds(section: Section): LevelId[] {
  const ids: LevelId[] = [];
  for (let row = 1; row <= ROWS_PER_SECTION; row++) {
    const r = row as Row;
    for (let n = (row - 1) * ROW_LENGTH + 1; n <= lastNormalOfRow(r); n++) {
      ids.push(levelId(section, n));
    }
    ids.push(defiId(section, defiOfRow(r)));
  }
  return ids;
}

const SECTIONS: Section[] = [1, 2, 3, 4];

export function allLevelIds(): LevelId[] {
  return SECTIONS.flatMap(sectionLevelIds);
}

// --- Géométrie et étiquette --------------------------------------------------

// Géométrie effective d'un niveau : celle du mode, sauf pour un défi qui joue
// sur la grille doublée.
export function levelMode(modeId: ModeId, id: LevelId): GameMode {
  const mode = GAME_MODES[modeId];
  return isDefi(id) ? defiMode(mode) : mode;
}

// Étiquette affichée dans le header en partie : « 5×5 · 1-12 », « 5×5 · Défi
// 1-A ».
export function levelLabel(modeId: ModeId, id: LevelId): string {
  const shape = modeId.replace("x", "×");
  return isDefi(id) ? `${shape} · Défi ${id}` : `${shape} · ${id}`;
}
