// Progression : DÉRIVATION des états de la carte à partir des niveaux
// validés. Aucun DOM ici — la carte (src/render/map.ts) ne fait que peindre ce
// que ce module calcule.
//
// Le module est scindé en trois groupes (doc 01, mise en conformité #4-6) :
//   (a) dérivation pure MONO-mode — `ModeProgress` en argument, rien d'autre ;
//   (b) dérivation INTER-modes — un `Record<ModeId, ModeProgress>` en
//       argument (+ `lastMode` pour resumePoint) ; elles lisaient hier le
//       localStorage, elles ne lisent plus rien qu'on ne leur passe ;
//   (c) — n'existe plus ici : la persistance (localStorage) est supprimée,
//       remplacée par `game.persisted` (doc 03). Un état persisté (tableau
//       d'ids validés, JSON pur) se convertit en `ModeProgress` par le seul
//       point de conversion `makeProgress` — jamais de reconstruction de Set
//       à la lecture.
//
// Seule la liste des identifiants validés compte : tout le reste (case
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

import { MODE_ORDER, type ModeId, type Section } from "@traceword/core";
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
} from "@traceword/core";

export type CellState = "hidden" | "disabled" | "active" | "validated";

// JSON pur (doc 01 § mise en conformité #3) : un Record en guise d'ensemble,
// lookup direct (`id in p.validated`), pas de Set — sérialisable tel quel dans
// le state Rune et le persisted.
export interface ModeProgress {
  validated: Record<LevelId, true>;
}

// Progression de tous les modes : la forme que prennent les dérivations
// inter-modes (groupe b) et le `persisted` (doc 03).
export type ProgressByMode = Record<ModeId, ModeProgress>;

const SECTIONS: Section[] = [1, 2, 3, 4];

// 4 sections × 3 défis : le plafond d'étoiles d'un mode, donc son score de
// complétion (« 7 / 12 ★ »).
export const MAX_STARS = 12;

// Coût d'entrée de chaque section, en étoiles. La section 1 est offerte ; la 4
// coûte 4 étoiles — soit une de plus que le mode suivant (3), qui s'intercale
// donc volontairement AVANT elle : on préfère offrir une grille plus grande
// qu'une difficulté plus rude.
export const STARS_FOR_SECTION: Record<Section, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 4,
};
export const STARS_FOR_NEXT_MODE = 3;

// Construit une progression hors stockage (harnais, tests, injection d'état) —
// l'UNIQUE point de conversion entre une liste d'ids validés (persisted,
// JSON pur) et le Record que consomment les dérivations.
export function makeProgress(ids: LevelId[]): ModeProgress {
  const validated: Record<LevelId, true> = {};
  for (const id of ids) validated[id] = true;
  return { validated };
}

// Progression vide pour tous les modes : le repli avant que le persisted
// (doc 03) ne soit câblé.
export function emptyProgressByMode(): ProgressByMode {
  return Object.fromEntries(
    MODE_ORDER.map((m) => [m, makeProgress([])]),
  ) as ProgressByMode;
}

// --- (a) Dérivation pure MONO-mode (rien d'autre qu'un ModeProgress) --------

// Une étoile par défi validé, toutes sections confondues.
export function starCount(p: ModeProgress): number {
  let n = 0;
  for (const s of SECTIONS) {
    for (const key of DEFI_KEYS) {
      if (defiId(s, key) in p.validated) n++;
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
  return pred === null || pred in p.validated;
}

export function cellState(p: ModeProgress, id: LevelId): CellState {
  if (id in p.validated) return "validated";
  if (isUnlocked(p, id)) return "active";
  // « Visible désactivée » = un pas d'avance, et pas davantage : la case dont
  // le prédécesseur est justement JOUABLE (débloqué et pas encore validé).
  // Un 1-1 (pas de prédécesseur) n'est donc jamais « disabled » : si sa section
  // est verrouillée il reste caché, et c'est le jalon verrouillé de la section
  // qui porte le message « ★ Encore N étoiles », pas la case.
  const pred = predecessorOf(id);
  if (pred !== null && isUnlocked(p, pred) && !(pred in p.validated)) {
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

// Le point de reprise d'un mode : la première case jouable dans l'ordre
// canonique. C'est ce que l'accueil propose de « reprendre », et le repli de
// l'écran de victoire quand une victoire n'ouvre rien. null = mode complété.
export function firstPlayableLevel(p: ModeProgress): LevelId | null {
  return allLevelIds().find((x) => cellState(p, x) === "active") ?? null;
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
  const resume = firstPlayableLevel(p);
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
    if (id in p.validated) validatedCount++;
    if (cellState(p, id) !== "hidden") {
      lastVisibleRow = Math.max(lastVisibleRow, Math.ceil(n / ROW_LENGTH));
    }
  }
  // Le défi compte dans la visibilité de SA ligne au même titre qu'une case
  // normale : la règle est « une ligne est visible si au moins une de ses cinq
  // cases ou son défi ne sont pas cachés », sans exception à retenir.
  for (let r = 1; r <= ROWS_PER_SECTION; r++) {
    const id = defiId(s, DEFI_KEYS[r - 1]);
    if (id in p.validated) {
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
// débloque rien (au-delà de la 4e, l'étoile n'est plus qu'un score). CODE et
// non libellé : stocké dans le winSummary du state Rune, il doit rester
// traduisible côté client (render/i18n.ts, rangs Bronze→Platine) — une chaîne
// d'affichage figée dans le state ne le serait pas.
export type StarReward =
  | { kind: "section"; section: Section }
  | { kind: "mode"; mode: ModeId };

export function starRewardAt(modeId: ModeId, star: number): StarReward | null {
  if (star === STARS_FOR_NEXT_MODE) {
    const next = MODE_ORDER[MODE_ORDER.indexOf(modeId) + 1];
    // Dernier mode de la série : ce palier ne débloque rien, il est SAUTÉ.
    return next ? { kind: "mode", mode: next } : null;
  }
  // Section s ⇒ difficulté s : le palier débloque la section de ce rang.
  // La section 1 (coût 0) n'est jamais trouvée ici, star valant au moins 1.
  const section = SECTIONS.find((s) => STARS_FOR_SECTION[s] === star);
  return section ? { kind: "section", section } : null;
}

// --- (b) Dérivation INTER-modes (Record<ModeId, ModeProgress> en argument) --
//
// Persistance (localStorage) supprimée : ce groupe lisait hier le stockage à
// travers loadProgress/loadLastMode, il ne lit plus que ce qu'on lui passe.
// Le remplacement (game.persisted → ProgressByMode) est le chantier Rune
// suivant (doc 03) ; d'ici là, les appelants construisent une progression
// locale (cf. emptyProgressByMode) et la font transiter en argument.

export function totalValidated(progress: ProgressByMode, modeId: ModeId): number {
  return Object.keys(progress[modeId].validated).length;
}

export function modeStars(progress: ProgressByMode, modeId: ModeId): number {
  return starCount(progress[modeId]);
}

// Un mode est débloqué si TOUS ceux qui le précèdent valent au moins 3 étoiles.
// La chaîne est vérifiée en entier, et non seulement le maillon précédent : sans
// cela, une progression incohérente (celle d'un mode effacée, mise à jour
// partielle) rendrait un mode lointain jouable par-dessus son verrou — et
// visibleModes(), qui suppose que les débloqués forment un PRÉFIXE de
// MODE_ORDER, les listerait dans le désordre. L'invariant est ici, structurel.
export function isModeUnlocked(progress: ProgressByMode, modeId: ModeId): boolean {
  const index = MODE_ORDER.indexOf(modeId);
  if (index < 0) return false; // mode inconnu
  for (let i = 0; i < index; i++) {
    if (modeStars(progress, MODE_ORDER[i]) < STARS_FOR_NEXT_MODE) return false;
  }
  return true; // 5x5 (index 0) : toujours ouvert
}

// Le premier mode verrouillé — le seul qui puisse être montré (grisé, cadenas).
// Les suivants restent cachés : on ne dévoile pas le catalogue.
export function nextLockedMode(progress: ProgressByMode): ModeId | null {
  return MODE_ORDER.find((m) => !isModeUnlocked(progress, m)) ?? null;
}

// Le verrou d'un mode est tenu par le mode PRÉCÉDENT : c'est sa progression à
// lui qu'on interroge, jamais celle du mode qu'on regarde. Le premier mode n'a
// pas de gardien — il est ouvert d'emblée. Pure : ne prend pas `progress`, la
// relation d'ordre ne dépend d'aucune progression.
export function gateModeOf(modeId: ModeId): ModeId | null {
  const index = MODE_ORDER.indexOf(modeId);
  return index > 0 ? MODE_ORDER[index - 1] : null;
}

// Étoiles qui manquent AU GARDIEN pour ouvrir `modeId`. Pendant de
// starsMissingForSection : ce que l'interface annonce, et la condition
// d'affichage du verrou (isModeTeased), sortent du même calcul.
export function starsMissingForMode(
  progress: ProgressByMode,
  modeId: ModeId,
): number {
  const gate = gateModeOf(modeId);
  if (!gate || isModeUnlocked(progress, modeId)) return 0;
  return Math.max(0, STARS_FOR_NEXT_MODE - modeStars(progress, gate));
}

// Même règle que pour une section verrouillée (cf. sectionTeased) : l'onglet du
// mode suivant n'apparaît que lorsqu'il est À UN DÉFI PRÈS.
export function isModeTeased(progress: ProgressByMode, modeId: ModeId): boolean {
  const gate = gateModeOf(modeId);
  if (!gate || isModeUnlocked(progress, modeId)) return false;
  // Le gardien doit lui-même être ouvert : sinon le verrou n'est pas le prochain
  // de la chaîne, et rien ne doit paraître.
  if (!isModeUnlocked(progress, gate)) return false;
  return (
    starsMissingForMode(progress, modeId) === 1 &&
    hasActiveDefi(progress[gate])
  );
}

export function visibleModes(progress: ProgressByMode): ModeId[] {
  const unlocked = MODE_ORDER.filter((m) => isModeUnlocked(progress, m));
  const next = nextLockedMode(progress);
  return next && isModeTeased(progress, next) ? [...unlocked, next] : unlocked;
}

// Aucune progression nulle part : l'accroche de la carte est alors la version
// « explication de la mécanique ».
export function isFirstLaunch(progress: ProgressByMode): boolean {
  return MODE_ORDER.every((m) => totalValidated(progress, m) === 0);
}

// Où reprendre, tous modes confondus : le premier niveau jouable du dernier mode
// consulté (`lastMode`), et à défaut celui du premier mode débloqué qui en a
// un. On commence par le dernier mode consulté parce que c'est là que le
// joueur s'est arrêté — un mode complété ne doit pas pour autant renvoyer à la
// carte. Un `lastMode` verrouillé (progression effacée entre-temps) retombe
// sur le premier mode de la série, toujours ouvert.
//
// null : plus rien à jouer nulle part (tout est validé). L'accueil retombe alors
// sur le choix du niveau, seul geste qui ait encore un sens.
export interface ResumePoint {
  modeId: ModeId;
  id: LevelId;
}

export function resumePoint(
  progress: ProgressByMode,
  lastMode: ModeId,
): ResumePoint | null {
  const first = isModeUnlocked(progress, lastMode) ? lastMode : MODE_ORDER[0];
  const order = [
    first,
    ...MODE_ORDER.filter((m) => m !== first && isModeUnlocked(progress, m)),
  ];
  for (const modeId of order) {
    const id = firstPlayableLevel(progress[modeId]);
    if (id) return { modeId, id };
  }
  return null;
}
