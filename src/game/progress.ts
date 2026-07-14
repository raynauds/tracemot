// Progression : persistance des niveaux validés et DÉRIVATION des états de la
// carte. Aucun DOM ici — la carte (src/render/map.ts) ne fait que peindre ce
// que ce module calcule.
//
// Seule la liste des identifiants validés est stockée. Tout le reste (case
// visible / active / validée, boss, sections rendues, modes débloqués) s'en
// déduit à la lecture : impossible de désynchroniser un état persisté d'un
// état dérivé, et une progression injectée à la main donne un écran exact.
//
// Géométrie de la carte — une grille virtuelle unique de 16 lignes × 6
// colonnes (4 sections × 4 lignes), où l'adjacence est purement géométrique
// (haut/bas/gauche/droite). Le raccord entre sections (1-19↔2-1 … 1-24↔2-6)
// n'est donc pas un cas particulier : il tombe de la continuité des lignes.
// Le boss (n = 25) est HORS de cette grille : il est traité à part, adjacent
// aux quatre cases de la colonne 6 de sa section (n = 6, 12, 18, 24).

import { MODE_ORDER, type ModeId, type Section } from "./config.ts";
import { BOSS_NUMBER, isBoss, levelId, sectionOf } from "./levels.ts";
import type { LevelId } from "./levels.ts";

export type CellState = "hidden" | "disabled" | "active" | "validated";

export interface ModeProgress {
  validated: Set<LevelId>;
}

const ROWS = 16; // 4 sections × 4 lignes
const COLS = 6;
const NORMAL_PER_SECTION = 24; // les 24 cases de la grille virtuelle
// Cases de la colonne 6 d'une section : les seules adjacentes au boss.
const BOSS_NEIGHBOR_NUMBERS = [6, 12, 18, 24];

const PROGRESS_KEY = (modeId: ModeId) => `tracemot.progress.${modeId}`;
const LAST_MODE_KEY = "tracemot.lastMode";
const SEEN_MODES_KEY = "tracemot.seenModes";
// Clés du jeu libre disparu (sélecteurs de mode et de difficulté).
const LEGACY_KEYS = ["tracemot.mode", "tracemot.difficulty"];

// --- Grille virtuelle -------------------------------------------------------

// Identifiant de la case (r, c), ou null hors grille — le null porte les bords
// et évite d'avoir à traiter les extrémités dans les appelants.
function idAt(r: number, c: number): LevelId | null {
  if (c < 1 || c > COLS || r < 1 || r > ROWS) return null;
  const section = Math.ceil(r / 4) as Section;
  return levelId(section, ((r - 1) % 4) * COLS + c);
}

// Coordonnées (ligne, colonne) d'un id normal (1..24). Non défini pour un boss.
function rcOf(id: LevelId): [number, number] {
  const s = sectionOf(id);
  const n = Number(id.split("-")[1]);
  return [(s - 1) * 4 + Math.ceil(n / COLS), ((n - 1) % COLS) + 1];
}

function neighbors(id: LevelId): LevelId[] {
  const [r, c] = rcOf(id);
  return [idAt(r - 1, c), idAt(r + 1, c), idAt(r, c - 1), idAt(r, c + 1)].filter(
    (x): x is LevelId => x !== null,
  );
}

// --- Dérivation des états ---------------------------------------------------

// Racine de la carte : la seule case active sans aucun voisin validé.
const ROOT: LevelId = "1-1";

function isActive(p: ModeProgress, id: LevelId): boolean {
  if (p.validated.has(id)) return false;
  return id === ROOT || neighbors(id).some((n) => p.validated.has(n));
}

// « Allumée » = validée ou active. C'est ce qui rend ses voisines visibles.
function isOn(p: ModeProgress, id: LevelId): boolean {
  return p.validated.has(id) || isActive(p, id);
}

export function cellState(p: ModeProgress, id: LevelId): CellState {
  if (isBoss(id)) return bossState(p, sectionOf(id));
  if (p.validated.has(id)) return "validated";
  if (isActive(p, id)) return "active";
  return neighbors(id).some((n) => isOn(p, n)) ? "disabled" : "hidden";
}

// Le boss n'est actif que lorsque les 24 niveaux normaux de sa section sont
// validés — l'adjacence ne suffit pas, elle ne le rend que visible.
export function bossState(p: ModeProgress, s: Section): CellState {
  const bossId = levelId(s, BOSS_NUMBER);
  if (p.validated.has(bossId)) return "validated";
  let allNormals = true;
  for (let n = 1; n <= NORMAL_PER_SECTION; n++) {
    if (!p.validated.has(levelId(s, n))) {
      allNormals = false;
      break;
    }
  }
  if (allNormals) return "active";
  const adjacentOn = BOSS_NEIGHBOR_NUMBERS.some((n) => isOn(p, levelId(s, n)));
  return adjacentOn ? "disabled" : "hidden";
}

export interface SectionStats {
  validatedCount: number; // boss inclus (0..25)
  complete: boolean; // === 25
  lastVisibleRow: number; // 0..4 — croissance additive : on ne rend pas au-delà
  anyVisible: boolean; // le jalon de section n'apparaît qu'à partir de là
}

export function sectionStats(p: ModeProgress, s: Section): SectionStats {
  let validatedCount = 0;
  let lastVisibleRow = 0;
  for (let n = 1; n <= NORMAL_PER_SECTION; n++) {
    const id = levelId(s, n);
    if (p.validated.has(id)) validatedCount++;
    if (cellState(p, id) !== "hidden") {
      lastVisibleRow = Math.max(lastVisibleRow, Math.ceil(n / COLS));
    }
  }
  const boss = bossState(p, s);
  if (boss === "validated") validatedCount++;
  return {
    validatedCount,
    complete: validatedCount === NORMAL_PER_SECTION + 1,
    lastVisibleRow,
    anyVisible: lastVisibleRow > 0 || boss !== "hidden",
  };
}

// Construit une progression hors stockage (harnais, tests, injection d'état).
export function makeProgress(ids: LevelId[]): ModeProgress {
  return { validated: new Set(ids) };
}

// --- Persistance (localStorage, tolérante aux échecs) -----------------------

function readList(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch (_) {
    /* stockage indisponible */
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string");
  } catch (_) {
    /* valeur corrompue : on repart d'une liste vide */
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (_) {
    /* stockage indisponible : la progression ne survivra pas au rechargement */
  }
}

export function loadProgress(modeId: ModeId): ModeProgress {
  return makeProgress(readList(PROGRESS_KEY(modeId)));
}

// Idempotent : rejouer un niveau déjà validé ne change rien.
export function saveValidated(modeId: ModeId, id: LevelId): void {
  const key = PROGRESS_KEY(modeId);
  const list = readList(key);
  if (list.includes(id)) return;
  list.push(id);
  writeList(key, list);
}

export function totalValidated(modeId: ModeId): number {
  return readList(PROGRESS_KEY(modeId)).length;
}

const SECTIONS: Section[] = [1, 2, 3, 4];

// Un boss QUELCONQUE de ce mode est-il validé ? C'est la clé du mode suivant :
// pas besoin de finir les quatre sections pour voir la grille grandir.
function hasBossValidated(modeId: ModeId): boolean {
  const p = loadProgress(modeId);
  return SECTIONS.some((s) => p.validated.has(levelId(s, BOSS_NUMBER)));
}

// Un mode est débloqué si TOUS ceux qui le précèdent ont livré un boss. La
// chaîne est vérifiée en entier, et non seulement le maillon précédent : sans
// cela, un stockage incohérent (progression d'un mode effacée à la main, mise
// à jour partielle) rendrait un mode lointain jouable par-dessus son verrou —
// et visibleModes(), qui suppose que les débloqués forment un PRÉFIXE de
// MODE_ORDER, les listerait dans le désordre. L'invariant est ici, structurel.
export function isModeUnlocked(modeId: ModeId): boolean {
  const index = MODE_ORDER.indexOf(modeId);
  if (index < 0) return false; // mode inconnu
  for (let i = 0; i < index; i++) {
    if (!hasBossValidated(MODE_ORDER[i])) return false;
  }
  return true; // 5x5 (index 0) : toujours ouvert
}

// Le premier mode verrouillé : le seul montré (grisé, cadenas) ; les suivants
// restent cachés pour ne pas dévoiler toute la série d'emblée.
export function nextLockedMode(): ModeId | null {
  return MODE_ORDER.find((m) => !isModeUnlocked(m)) ?? null;
}

export function visibleModes(): ModeId[] {
  const unlocked = MODE_ORDER.filter(isModeUnlocked);
  const next = nextLockedMode();
  return next ? [...unlocked, next] : unlocked;
}

// Aucune progression nulle part : l'accroche de la carte est alors la version
// « explication de la mécanique ».
export function isFirstLaunch(): boolean {
  return MODE_ORDER.every((m) => totalValidated(m) === 0);
}

// --- Dernier mode consulté et modes déjà visités ----------------------------

export function loadLastMode(): ModeId {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LAST_MODE_KEY);
  } catch (_) {
    /* stockage indisponible */
  }
  const valid = MODE_ORDER.find((m) => m === stored);
  // Un mode mémorisé mais verrouillé (progression effacée) retombe sur 5x5.
  return valid && isModeUnlocked(valid) ? valid : MODE_ORDER[0];
}

export function saveLastMode(modeId: ModeId): void {
  try {
    localStorage.setItem(LAST_MODE_KEY, modeId);
  } catch (_) {
    /* stockage indisponible : l'onglet rouvert sera celui par défaut */
  }
}

// « Vu » n'est pas dérivable de la progression : un mode peut être débloqué et
// jamais ouvert. D'où cette clé dédiée, qui pilote la pastille vermillon.
export function isModeSeen(modeId: ModeId): boolean {
  return readList(SEEN_MODES_KEY).includes(modeId);
}

export function markModeSeen(modeId: ModeId): void {
  const list = readList(SEEN_MODES_KEY);
  if (list.includes(modeId)) return;
  list.push(modeId);
  writeList(SEEN_MODES_KEY, list);
}

// Migration : le jeu libre (mode + difficulté au choix) n'existe plus.
export function purgeLegacyKeys(): void {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      /* stockage indisponible : rien à purger */
    }
  }
}
