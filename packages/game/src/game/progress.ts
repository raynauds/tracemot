// Progression : persistance des niveaux validés et DÉRIVATION des états de la
// carte. Aucun DOM ici — la carte (src/render/map.ts) ne fait que peindre ce
// que ce module calcule.
//
// Seule la liste des identifiants validés est stockée. Tout le reste (case
// cachée / visible / jouable / validée, étoiles, sections et modes débloqués)
// s'en déduit à la lecture : impossible de désynchroniser un état persisté d'un
// état dérivé, et une progression injectée à la main donne un écran exact.
//
// Deux mécanismes, et deux seulement :
//   1. une CHAÎNE linéaire de prédécesseurs à l'intérieur d'une section
//      (1-1 → 1-2 → … → 1-5, et 1-5 ouvre aussi le défi de sa ligne, 1-A) ;
//   2. une monnaie, l'ÉTOILE (1 défi validé = 1 étoile), qui ouvre les sections
//      suivantes et le mode suivant.
// Les étoiles sont fongibles : peu importe de quelle section elles viennent.
// C'est ce qui laisse le joueur plonger en difficulté sans être taxé.

import {
  DIFFICULTY_LABELS,
  MODE_ORDER,
  type ModeId,
  type Section,
} from "@tracemot/core";
import {
  DEFI_KEYS,
  LEVELS_PER_SECTION,
  NORMALS_PER_SECTION,
  ROWS_PER_SECTION,
  ROW_LENGTH,
  allLevelIds,
  defiId,
  defiKeyOf,
  defiOfRow,
  isDefi,
  lastNormalOfRow,
  levelId,
  levelNumber,
  rowOf,
  rowOfDefi,
  sectionOf,
  type LevelId,
} from "@tracemot/core";

export type CellState = "hidden" | "disabled" | "active" | "validated";

export interface ModeProgress {
  validated: Set<LevelId>;
}

const SECTIONS: Section[] = [1, 2, 3, 4];

// 4 sections × 3 défis : le plafond d'étoiles d'un mode, donc son score de
// complétion (« 7 / 12 ★ »).
export const MAX_STARS = 12;

// Coût d'entrée de chaque section, en étoiles. La section 1 est offerte ; la 4
// coûte 4 étoiles — soit une de plus que le mode suivant (3), qui s'intercale
// donc volontairement AVANT elle : on préfère offrir une grille plus grande
// qu'une difficulté plus rude.
export const STARS_FOR_SECTION: Record<Section, number> = { 1: 0, 2: 1, 3: 2, 4: 4 };
export const STARS_FOR_NEXT_MODE = 3;

const PROGRESS_KEY = (modeId: ModeId) => `tracemot.progress.${modeId}`;
const LAST_MODE_KEY = "tracemot.lastMode";
const SEEN_MODES_KEY = "tracemot.seenModes";
const SCHEMA_KEY = "tracemot.schema";
const SCHEMA_VERSION = "2";
// Clés du jeu libre disparu (sélecteurs de mode et de difficulté).
const LEGACY_KEYS = ["tracemot.mode", "tracemot.difficulty"];

// Construit une progression hors stockage (harnais, tests, injection d'état).
export function makeProgress(ids: LevelId[]): ModeProgress {
  return { validated: new Set(ids) };
}

// --- Dérivation des états (pure : rien n'est lu ni écrit en stockage) -------

// Une étoile par défi validé, toutes sections confondues.
export function starCount(p: ModeProgress): number {
  let n = 0;
  for (const s of SECTIONS) {
    for (const key of DEFI_KEYS) {
      if (p.validated.has(defiId(s, key))) n++;
    }
  }
  return n;
}

export function sectionUnlocked(p: ModeProgress, s: Section): boolean {
  return starCount(p) >= STARS_FOR_SECTION[s];
}

export function starsMissingForSection(p: ModeProgress, s: Section): number {
  return Math.max(0, STARS_FOR_SECTION[s] - starCount(p));
}

// --- Ce qu'on donne à VOIR d'un verrou ---------------------------------------
//
// Un verrou (section, mode) n'est montré au joueur que lorsqu'il est À UN DÉFI
// PRÈS : il lui manque exactement une étoile, ET un défi est jouable tout de
// suite pour la lui donner. Sinon le verrou est absent — pas de jalon, pas
// d'onglet.
//
// POURQUOI : au premier lancement, il manque une étoile pour la section 2, mais
// aucun défi n'est encore atteignable (1-A demande 1-5). Annoncer « Encore 1
// étoile » à ce moment-là, c'est promettre avant de donner le moyen de tenir la
// promesse. Avec cette règle, le premier défi et l'annonce de ce qu'il ouvre
// apparaissent ENSEMBLE, au même instant : la carotte et le bâton d'un bloc.
//
// Conséquence utile : les seuils (1, 2, 3, 4) étant distincts et une étoile
// valant un défi, il y a toujours AU PLUS UN verrou teasé à la fois, et il est
// toujours à une étoile — d'où le libellé fixe « ★ Encore 1 étoile ».

export function hasActiveDefi(p: ModeProgress): boolean {
  for (const s of SECTIONS) {
    for (const key of DEFI_KEYS) {
      if (cellState(p, defiId(s, key)) === "active") return true;
    }
  }
  return false;
}

export function sectionTeased(p: ModeProgress, s: Section): boolean {
  return starsMissingForSection(p, s) === 1 && hasActiveDefi(p);
}

// Prédécesseur d'un niveau dans la chaîne : la seule case dont la validation
// l'ouvre. null pour le 1-1 d'une section, dont la porte est l'étoile (donc la
// section elle-même) et non une case.
//
// Le « 1-5 ouvre DEUX cases » de la spec n'a pas besoin d'être encodé : 1-6 a
// pour prédécesseur 1-5 (c'est n−1), et le défi de la ligne 1 a lui aussi 1-5.
// La règle « n−1 » suffit donc à tout, sans cas particulier de fin de ligne.
function predecessorOf(id: LevelId): LevelId | null {
  const s = sectionOf(id);
  const key = defiKeyOf(id);
  if (key) return levelId(s, lastNormalOfRow(rowOfDefi(key)));
  const n = levelNumber(id);
  return n <= 1 ? null : levelId(s, n - 1);
}

// Débloquée = sa section est ouverte ET son prédécesseur est validé (ou elle
// n'en a pas). Non récursive : on ne remonte JAMAIS la chaîne, un seul maillon
// suffit — c'est aussi ce qui garantit qu'un état « disabled » se calcule sans
// risque de récursion mutuelle avec cellState().
function isUnlocked(p: ModeProgress, id: LevelId): boolean {
  if (!sectionUnlocked(p, sectionOf(id))) return false;
  const pred = predecessorOf(id);
  return pred === null || p.validated.has(pred);
}

export function cellState(p: ModeProgress, id: LevelId): CellState {
  if (p.validated.has(id)) return "validated";
  if (isUnlocked(p, id)) return "active";
  // « Visible désactivée » = un pas d'avance, et pas davantage : la case dont
  // le prédécesseur est justement JOUABLE (débloqué et pas encore validé).
  // Un 1-1 (pas de prédécesseur) n'est donc jamais « disabled » : si sa section
  // est verrouillée il reste caché, et c'est le jalon verrouillé de la section
  // qui porte le message « ★ Encore N étoiles », pas la case.
  const pred = predecessorOf(id);
  if (pred !== null && isUnlocked(p, pred) && !p.validated.has(pred)) {
    return "disabled";
  }
  return "hidden";
}

// --- Suites d'un niveau (écran de victoire) ---------------------------------

// « next » : le normal qui suit dans la chaîne. « defi » : le défi que la fin
// d'une ligne vient d'ouvrir. « continue » : repli quand la victoire n'ouvre
// aucune case (défi gagné, ou niveau rejoué).
export type NextKind = "next" | "defi" | "continue";

export interface NextChoice {
  id: LevelId;
  kind: NextKind;
}

// Cases dont `id` est le prédécesseur — l'exact miroir de predecessorOf(). Un
// dernier de ligne (5, 10, 15) en a DEUX : le normal suivant et le défi de sa
// ligne. Le 15 n'a que le défi (la section s'arrête là). Un défi n'ouvre aucune
// case : il paie en étoiles.
function successorsOf(id: LevelId): LevelId[] {
  if (isDefi(id)) return [];
  const s = sectionOf(id);
  const n = levelNumber(id);
  const out: LevelId[] = [];
  if (n < NORMALS_PER_SECTION) out.push(levelId(s, n + 1));
  if (n % ROW_LENGTH === 0) out.push(defiId(s, defiOfRow(rowOf(n))));
  return out;
}

// Ce que l'écran de victoire propose de jouer : exactement ce que CETTE victoire
// vient d'ouvrir (au plus deux cases, normal puis défi). Quand elle n'ouvre rien
// — un défi ne débloque que des étoiles, un rejeu ne débloque rien —, on retombe
// sur le premier niveau jouable non validé dans l'ordre canonique : le joueur a
// toujours un pas suivant sans passer par la carte.
//
// `p` est la progression APRÈS la validation : les cases ouvertes par la victoire
// y sont donc « active », et le niveau qu'on vient de gagner « validated ».
export function nextChoices(p: ModeProgress, id: LevelId): NextChoice[] {
  const opened = successorsOf(id).filter((x) => cellState(p, x) === "active");
  if (opened.length > 0) {
    return opened.map((x) => ({ id: x, kind: isDefi(x) ? "defi" : "next" }));
  }
  const resume = allLevelIds().find((x) => cellState(p, x) === "active");
  // Aucun niveau jouable nulle part (mode complété) : seul le retour carte reste.
  return resume ? [{ id: resume, kind: "continue" }] : [];
}

export interface SectionStats {
  unlocked: boolean;
  validatedCount: number; // 0..18, défis compris
  complete: boolean; // === LEVELS_PER_SECTION
  stars: number; // 0..3 — défis validés de CETTE section
  lastVisibleRow: number; // 0..3 — croissance additive : on ne rend pas au-delà
  anyVisible: boolean; // le jalon de section n'apparaît qu'à partir de là
}

export function sectionStats(p: ModeProgress, s: Section): SectionStats {
  let validatedCount = 0;
  let stars = 0;
  let lastVisibleRow = 0;

  for (let n = 1; n <= NORMALS_PER_SECTION; n++) {
    const id = levelId(s, n);
    if (p.validated.has(id)) validatedCount++;
    if (cellState(p, id) !== "hidden") {
      lastVisibleRow = Math.max(lastVisibleRow, Math.ceil(n / ROW_LENGTH));
    }
  }
  // Le défi compte dans la visibilité de SA ligne au même titre qu'une case
  // normale : la règle est « une ligne est visible si au moins une de ses cinq
  // cases ou son défi ne sont pas cachés », sans exception à retenir.
  for (let r = 1; r <= ROWS_PER_SECTION; r++) {
    const id = defiId(s, DEFI_KEYS[r - 1]);
    if (p.validated.has(id)) {
      validatedCount++;
      stars++;
    }
    if (cellState(p, id) !== "hidden") {
      lastVisibleRow = Math.max(lastVisibleRow, r);
    }
  }

  return {
    unlocked: sectionUnlocked(p, s),
    validatedCount,
    complete: validatedCount === LEVELS_PER_SECTION,
    stars,
    lastVisibleRow,
    anyVisible: lastVisibleRow > 0,
  };
}

// --- Paliers d'étoiles ------------------------------------------------------

// Ce que débloque la n-ième étoile d'un mode (1-indexé), ou null si elle ne
// débloque rien (au-delà de la 4e, l'étoile n'est plus qu'un score). Les libellés
// sont DÉRIVÉS (nom de la difficulté de la section, forme du mode suivant) : les
// écrire en dur ici les ferait diverger de config.ts au premier réglage.
export function starRewardAt(modeId: ModeId, star: number): string | null {
  if (star === STARS_FOR_NEXT_MODE) {
    const next = MODE_ORDER[MODE_ORDER.indexOf(modeId) + 1];
    // Dernier mode de la série : ce palier ne débloque rien, il est SAUTÉ.
    return next ? `Mode ${next.replace("x", "×")}` : null;
  }
  // Section s ⇒ difficulté s : le nom du palier est celui de la difficulté.
  // La section 1 (coût 0) n'est jamais trouvée ici, star valant au moins 1.
  const section = SECTIONS.find((s) => STARS_FOR_SECTION[s] === star);
  return section ? DIFFICULTY_LABELS[section].name : null;
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

export function modeStars(modeId: ModeId): number {
  return starCount(loadProgress(modeId));
}

// Un mode est débloqué si TOUS ceux qui le précèdent valent au moins 3 étoiles.
// La chaîne est vérifiée en entier, et non seulement le maillon précédent : sans
// cela, un stockage incohérent (progression d'un mode effacée à la main, mise
// à jour partielle) rendrait un mode lointain jouable par-dessus son verrou —
// et visibleModes(), qui suppose que les débloqués forment un PRÉFIXE de
// MODE_ORDER, les listerait dans le désordre. L'invariant est ici, structurel.
export function isModeUnlocked(modeId: ModeId): boolean {
  const index = MODE_ORDER.indexOf(modeId);
  if (index < 0) return false; // mode inconnu
  for (let i = 0; i < index; i++) {
    if (modeStars(MODE_ORDER[i]) < STARS_FOR_NEXT_MODE) return false;
  }
  return true; // 5x5 (index 0) : toujours ouvert
}

// Le premier mode verrouillé — le seul qui puisse être montré (grisé, cadenas).
// Les suivants restent cachés : on ne dévoile pas le catalogue.
export function nextLockedMode(): ModeId | null {
  return MODE_ORDER.find((m) => !isModeUnlocked(m)) ?? null;
}

// Même règle que pour une section verrouillée (cf. sectionTeased) : l'onglet du
// mode suivant n'apparaît que lorsqu'il est À UN DÉFI PRÈS. Le verrou d'un mode
// est tenu par le mode PRÉCÉDENT — c'est donc sa progression à lui qu'on
// interroge, pas celle du mode qu'on regarde.
export function isModeTeased(modeId: ModeId): boolean {
  const index = MODE_ORDER.indexOf(modeId);
  if (index <= 0 || isModeUnlocked(modeId)) return false;
  const gate = MODE_ORDER[index - 1];
  // Le gardien doit lui-même être ouvert : sinon le verrou n'est pas le prochain
  // de la chaîne, et rien ne doit paraître.
  if (!isModeUnlocked(gate)) return false;
  const p = loadProgress(gate);
  const missing = STARS_FOR_NEXT_MODE - starCount(p);
  return missing === 1 && hasActiveDefi(p);
}

export function visibleModes(): ModeId[] {
  const unlocked = MODE_ORDER.filter(isModeUnlocked);
  const next = nextLockedMode();
  return next && isModeTeased(next) ? [...unlocked, next] : unlocked;
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

// --- Migration --------------------------------------------------------------

function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (_) {
    /* stockage indisponible : rien à purger */
  }
}

// Deux nettoyages, à appeler une fois au démarrage :
//
//  - les clés du jeu libre disparu (mode et difficulté au choix) ;
//  - toute progression écrite AVANT le modèle « défis + étoiles ». Une
//    progression v1 contient des identifiants qui n'existent plus (1-16…1-25)
//    et aucun défi A/B/C : le compte d'étoiles serait faux et la carte
//    incohérente. Le jeu n'étant pas publié, repartir propre vaut mieux qu'une
//    progression fantôme — d'où la purge franche plutôt qu'une conversion.
//
// Le numéro de schéma est écrit APRÈS la purge : une interruption au milieu
// (onglet fermé, quota) laisse simplement la migration à refaire.
export function migrateStorage(): void {
  for (const key of LEGACY_KEYS) removeKey(key);

  let schema: string | null = null;
  try {
    schema = localStorage.getItem(SCHEMA_KEY);
  } catch (_) {
    /* stockage indisponible : rien à migrer, rien à écrire */
    return;
  }
  if (schema === SCHEMA_VERSION) return;

  for (const modeId of MODE_ORDER) removeKey(PROGRESS_KEY(modeId));
  removeKey(SEEN_MODES_KEY);
  removeKey(LAST_MODE_KEY);
  try {
    localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
  } catch (_) {
    /* stockage indisponible : la migration se rejouera au prochain lancement */
  }
}
