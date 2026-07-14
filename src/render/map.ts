// Carte de progression : l'écran d'accueil, en DOM pur, par-dessus le canvas
// Pixi (qui reste vivant dessous mais n'est plus atteignable : #map couvre tout
// et intercepte les gestes).
//
// Ce module ne fait que PEINDRE ce que progress.ts dérive : il n'a aucun état
// propre hormis l'onglet affiché, et ne persiste rien de lui-même. Il ne
// dépend pas non plus de levels.ts : la carte doit pouvoir s'afficher avant
// (ou sans) le chargement du JSON des niveaux — seule la partie a besoin de la
// donnée d'une grille.
//
// Le rendu est intégralement reconstruit à chaque appel (~150 nœuds) : pas de
// diff, pas de synchronisation à maintenir. La croissance additive (on ne rend
// que les lignes jusqu'à la dernière visible) sort de sectionStats().
//
// Le boss existe en DEUX nœuds — une grande case à droite du bloc (desktop) et
// un bandeau sous la grille (mobile) — dont un seul est affiché, par media
// query. Aucune logique de viewport ici : le CSS tranche.

import {
  DIFFICULTY_LABELS,
  GAME_MODES,
  bossMode,
  type ModeId,
  type Section,
} from "../game/config.ts";
import type { LevelId } from "../game/levels.ts";
import { BOSS_NUMBER, levelId } from "../game/levels.ts";
import {
  bossState,
  cellState,
  isFirstLaunch,
  isModeSeen,
  isModeUnlocked,
  loadLastMode,
  loadProgress,
  markModeSeen,
  saveLastMode,
  sectionStats,
  totalValidated,
  visibleModes,
  type CellState,
  type ModeProgress,
} from "../game/progress.ts";

const SECTIONS: Section[] = [1, 2, 3, 4];
const COLS = 6;

const HINT = "Choisissez un niveau. Chaque grille validée révèle la suite de " +
  "la carte.";
const HINT_FIRST =
  "Tracez tous les mots de la grille pour valider le niveau et révéler la " +
  "suite.";

// Onglet affiché. Initialisé au dernier mode consulté, puis piloté par les
// clics ; c'est le seul état que la carte porte.
let currentMode: ModeId = loadLastMode();

let onSelect: ((modeId: ModeId, id: LevelId) => void) | null = null;

const mapEl = document.getElementById("map") as HTMLElement;

export function currentMapMode(): ModeId {
  return currentMode;
}

// --- Construction du DOM ----------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function modeLabel(modeId: ModeId): string {
  return modeId.replace("x", "×");
}

// Cadenas de l'onglet verrouillé : dessiné en SVG plutôt qu'en glyphe pour
// tenir la même graisse que les filets du reste de la carte.
function lockIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "map-tab-lock");
  svg.setAttribute("viewBox", "0 0 10 12");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(ns, "rect");
  body.setAttribute("x", "0.75");
  body.setAttribute("y", "5.5");
  body.setAttribute("width", "8.5");
  body.setAttribute("height", "6");
  svg.appendChild(body);
  const shackle = document.createElementNS(ns, "path");
  shackle.setAttribute("d", "M2.5 5.5V3.5a2.5 2.5 0 0 1 5 0v2");
  shackle.setAttribute("fill", "none");
  svg.appendChild(shackle);
  return svg;
}

function buildTabs(): HTMLElement {
  const nav = el("nav", "map-tabs");
  nav.setAttribute("aria-label", "Mode de jeu");
  for (const modeId of visibleModes()) {
    const unlocked = isModeUnlocked(modeId);
    const tab = el("button", "map-tab");
    tab.type = "button";
    if (!unlocked) {
      // Onglet verrouillé : montré (on sait ce qui vient), mais inerte.
      tab.classList.add("is-locked");
      tab.disabled = true;
      tab.setAttribute(
        "aria-label",
        `Mode ${modeLabel(modeId)}, verrouillé`,
      );
      tab.appendChild(lockIcon());
    } else {
      tab.dataset.mode = modeId;
      if (modeId === currentMode) {
        tab.classList.add("is-active");
        tab.setAttribute("aria-current", "true");
      }
    }
    tab.appendChild(el("span", "map-tab-label", modeLabel(modeId)));
    // Pastille : mode débloqué mais jamais ouvert — le seul signal « nouveau ».
    if (unlocked && !isModeSeen(modeId)) {
      const dot = el("span", "map-tab-dot");
      dot.setAttribute("aria-hidden", "true");
      tab.appendChild(dot);
    }
    nav.appendChild(tab);
  }
  return nav;
}

function buildHeader(modeId: ModeId): HTMLElement {
  const head = el("header", "map-header");
  head.appendChild(el("div", "map-brand", "Tracemot"));
  head.appendChild(buildTabs());
  head.appendChild(el("div", "map-spring"));
  const total = el("div", "map-total");
  // Compteur du mode AFFICHÉ (et non de la progression globale) : la carte
  // parle du mode qu'on regarde.
  total.appendChild(
    el("span", "map-total-num", String(totalValidated(modeId))),
  );
  total.appendChild(el("span", "map-total-label", "VALIDÉS"));
  head.appendChild(total);
  return head;
}

function stateClass(s: CellState): string {
  return `is-${s}`;
}

function buildCell(id: LevelId, n: number, state: CellState): HTMLElement {
  if (state === "hidden") {
    // Rendue vide : elle ne réserve sa place que parce que sa ligne, elle,
    // est visible (une ligne entièrement cachée n'est pas rendue du tout).
    const ghost = el("div", "map-cell is-hidden");
    ghost.setAttribute("aria-hidden", "true");
    return ghost;
  }
  const playable = state === "active" || state === "validated";
  const cell = playable
    ? el("button", `map-cell ${stateClass(state)}`)
    : el("div", `map-cell ${stateClass(state)}`);
  cell.appendChild(el("span", "map-cell-num", String(n)));
  if (state === "validated") {
    cell.appendChild(el("span", "map-cell-mark", "✓"));
  }
  if (playable) {
    const button = cell as HTMLButtonElement;
    button.type = "button";
    button.dataset.level = id;
    button.setAttribute(
      "aria-label",
      state === "validated"
        ? `Niveau ${id}, validé, rejouable`
        : `Niveau ${id}, jouable`,
    );
  } else {
    cell.setAttribute("aria-label", `Niveau ${id}, à débloquer`);
  }
  return cell;
}

// Sous-titre du boss : dérivé de bossMode (« 10×10 · 20 MOTS DE 5 LETTRES »),
// jamais écrit en dur — la série N×N doit rester paramétrable par config.ts.
function bossSub(modeId: ModeId, short: boolean): string {
  const m = bossMode(GAME_MODES[modeId]);
  const shape = `${m.rows}×${m.cols}`;
  return short
    ? `${shape} · ${m.wordCount} MOTS`
    : `${shape} · ${m.wordCount} MOTS DE ${m.wordLength} LETTRES`;
}

const BOSS_CAPTION: Record<Exclude<CellState, "hidden">, string> = {
  validated: "VALIDÉ",
  active: "PRÊT À JOUER",
  disabled: `TERMINEZ LES ${BOSS_NUMBER - 1} NIVEAUX`,
};

const BOSS_MARK: Record<Exclude<CellState, "hidden">, string> = {
  validated: "✓",
  active: "★",
  disabled: "",
};

// Un seul contenu, deux enveloppes (`variant`) : la case desktop et le bandeau
// mobile ne diffèrent que par leur mise en page, tranchée en CSS.
function buildBoss(
  modeId: ModeId,
  s: Section,
  state: CellState,
  variant: "card" | "band",
): HTMLElement {
  const id = levelId(s, BOSS_NUMBER);
  const cls = `map-boss map-boss--${variant} ${stateClass(state)}`;
  const playable = state === "active" || state === "validated";
  const boss = playable ? el("button", cls) : el("div", cls);
  const kind = state === "hidden" ? "disabled" : state;

  const mark = el("span", "map-boss-mark", BOSS_MARK[kind]);
  mark.setAttribute("aria-hidden", "true");
  boss.appendChild(mark);
  boss.appendChild(el("span", "map-boss-title", "DÉFI"));
  const texts = el("span", "map-boss-texts");
  texts.appendChild(
    el("span", "map-boss-sub", bossSub(modeId, state === "validated")),
  );
  texts.appendChild(el("span", "map-boss-caption", BOSS_CAPTION[kind]));
  boss.appendChild(texts);

  if (playable) {
    const button = boss as HTMLButtonElement;
    button.type = "button";
    button.dataset.level = id;
    button.setAttribute(
      "aria-label",
      state === "validated"
        ? `Défi ${DIFFICULTY_LABELS[s].name}, validé, rejouable`
        : `Défi ${DIFFICULTY_LABELS[s].name}, prêt à jouer`,
    );
  } else {
    boss.setAttribute(
      "aria-label",
      `Défi ${DIFFICULTY_LABELS[s].name}, à débloquer`,
    );
  }
  return boss;
}

function buildMilestone(
  s: Section,
  validatedCount: number,
  complete: boolean,
): HTMLElement {
  const milestone = el("div", "map-milestone");
  milestone.appendChild(el("span", "map-milestone-rule"));
  const label = el("span", "map-milestone-label");
  label.appendChild(el("span", "map-milestone-name", DIFFICULTY_LABELS[s].name));
  const count = el(
    "span",
    `map-milestone-count${complete ? " is-complete" : ""}`,
    complete ? `${BOSS_NUMBER} ✓` : `${validatedCount} validés`,
  );
  label.appendChild(count);
  milestone.appendChild(label);
  milestone.appendChild(el("span", "map-milestone-rule"));
  return milestone;
}

function buildSection(
  modeId: ModeId,
  p: ModeProgress,
  s: Section,
): HTMLElement | null {
  const stats = sectionStats(p, s);
  if (!stats.anyVisible) return null;

  const boss = bossState(p, s);
  const bossVisible = boss !== "hidden";
  // Croissance additive : aucune ligne au-delà de la dernière visible — la
  // carte grandit vers le bas, elle ne réserve pas de vide. Le boss, lui,
  // aligne sa case sur les quatre lignes de la section.
  const rows = Math.max(stats.lastVisibleRow, bossVisible ? 4 : 0);

  const section = el("section", "map-section");
  section.appendChild(
    buildMilestone(s, stats.validatedCount, stats.complete),
  );

  const body = el("div", "map-section-body");
  const grid = el("div", "map-grid");
  for (let n = 1; n <= rows * COLS; n++) {
    const id = levelId(s, n);
    grid.appendChild(buildCell(id, n, cellState(p, id)));
  }
  body.appendChild(grid);
  // Case desktop toujours présente (sinon les grilles des sections ne seraient
  // pas alignées entre elles) : vide et invisible tant que le boss est caché.
  body.appendChild(
    bossVisible
      ? buildBoss(modeId, s, boss, "card")
      : el("div", "map-boss map-boss--card is-hidden"),
  );
  section.appendChild(body);
  if (bossVisible) {
    section.appendChild(buildBoss(modeId, s, boss, "band"));
  }
  return section;
}

// --- Rendu ------------------------------------------------------------------

export function renderMap(modeId: ModeId): void {
  currentMode = modeId;
  const p = loadProgress(modeId);

  mapEl.textContent = "";
  mapEl.appendChild(buildHeader(modeId));

  const body = el("div", "map-body");
  body.appendChild(
    el("p", "map-hint", isFirstLaunch() ? HINT_FIRST : HINT),
  );
  const sections = el("div", "map-sections");
  for (const s of SECTIONS) {
    const node = buildSection(modeId, p, s);
    if (node) sections.appendChild(node);
  }
  body.appendChild(sections);
  // Le brouillard n'est pas décoratif : c'est lui qui dit « il y a une suite ».
  // Le spacer garantit qu'il ne recouvre jamais la dernière ligne rendue.
  body.appendChild(el("div", "map-spacer"));
  const fog = el("div", "map-fog");
  fog.setAttribute("aria-hidden", "true");
  fog.appendChild(el("span", "map-fog-text", "· · · LA CARTE CONTINUE · · ·"));
  body.appendChild(fog);
  mapEl.appendChild(body);

  mapEl.appendChild(buildLegend());
}

function legendItem(className: string, label: string): HTMLElement {
  const item = el("div", "map-legend-item");
  const swatch = el("span", `map-legend-swatch ${className}`);
  swatch.setAttribute("aria-hidden", "true");
  item.appendChild(swatch);
  item.appendChild(el("span", "map-legend-text", label));
  return item;
}

function buildLegend(): HTMLElement {
  const legend = el("div", "map-legend");
  legend.appendChild(legendItem("is-validated", "VALIDÉ"));
  legend.appendChild(legendItem("is-active", "JOUABLE"));
  legend.appendChild(legendItem("is-disabled", "À DÉBLOQUER"));
  return legend;
}

// --- Affichage et événements ------------------------------------------------

// Toujours re-rendre : au retour de partie, les cases débloquées par la
// validation doivent apparaître sans que l'appelant ait à y penser.
export function showMap(): void {
  renderMap(currentMode);
  mapEl.hidden = false;
  mapEl.scrollTop = 0;
  // Le chrome de partie (header, registre, zoom) est masqué par le CSS via
  // cette classe : la carte n'a pas à connaître ses éléments un par un.
  document.body.classList.add("map-open");
}

export function hideMap(): void {
  mapEl.hidden = true;
  document.body.classList.remove("map-open");
}

// Délégation unique sur #map : le contenu étant reconstruit à chaque rendu,
// attacher les écouteurs aux cases signifierait les réattacher sans cesse.
export function bindMap(
  onSelectLevel: (modeId: ModeId, id: LevelId) => void,
): void {
  onSelect = onSelectLevel;
  mapEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const tab = target.closest<HTMLElement>("[data-mode]");
    if (tab) {
      const modeId = tab.dataset.mode as ModeId;
      if (modeId === currentMode) return;
      saveLastMode(modeId);
      markModeSeen(modeId); // éteint la pastille « nouveau »
      renderMap(modeId);
      mapEl.scrollTop = 0;
      return;
    }

    const cell = target.closest<HTMLElement>("[data-level]");
    if (cell && onSelect) onSelect(currentMode, cell.dataset.level as LevelId);
  });
  // Le mode ouvert d'emblée compte comme vu (sinon sa pastille survivrait à sa
  // première visite).
  markModeSeen(currentMode);
}
