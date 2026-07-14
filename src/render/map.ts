// Carte de progression : l'écran d'accueil, en DOM pur, par-dessus le canvas
// Pixi (qui reste vivant dessous mais n'est plus atteignable : #map couvre tout
// et intercepte les gestes).
//
// Ce module ne fait que PEINDRE ce que progress.ts dérive : il n'a aucun état
// propre hormis l'onglet affiché, et ne persiste rien de lui-même. Il ne
// dépend pas non plus de levels.ts pour la DONNÉE des grilles : la carte doit
// pouvoir s'afficher avant (ou sans) le chargement du JSON des niveaux — seule
// la partie a besoin d'une grille. Il n'emprunte à levels.ts que
// l'arithmétique des identifiants (lignes, défis).
//
// Le rendu est intégralement reconstruit à chaque appel (~200 nœuds) : pas de
// diff, pas de synchronisation à maintenir. La croissance additive (on ne rend
// que les lignes jusqu'à la dernière visible) sort de sectionStats().
//
// Un défi existe en DEUX nœuds — une carte à droite de sa ligne (desktop) et un
// bandeau sous la ligne (mobile) — dont un seul est affiché, par media query.
// Aucune logique de viewport ici : le CSS tranche.

import {
  DIFFICULTY_LABELS,
  GAME_MODES,
  defiMode,
  type ModeId,
  type Section,
} from "../game/config.ts";
import type { LevelId, Row } from "../game/levels.ts";
import {
  LEVELS_PER_SECTION,
  ROW_LENGTH,
  defiId,
  defiOfRow,
  levelId,
} from "../game/levels.ts";
import {
  MAX_STARS,
  cellState,
  isFirstLaunch,
  isModeSeen,
  isModeUnlocked,
  loadLastMode,
  loadProgress,
  markModeSeen,
  nextStarReward,
  saveLastMode,
  sectionStats,
  starCount,
  sectionTeased,
  visibleModes,
  type CellState,
  type ModeProgress,
} from "../game/progress.ts";

const SECTIONS: Section[] = [1, 2, 3, 4];
// Étoiles d'une section : trois défis, donc trois glyphes, pleins ou creux.
const SECTION_STARS = 3;

const HINT = "Choisissez un niveau. Chaque défi validé rapporte une étoile.";
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

// Compteur d'étoiles du mode AFFICHÉ (et non de la progression globale) : la
// carte parle du mode qu'on regarde. Le rappel du prochain palier donne à la
// monnaie sa raison d'être — sans lui, « 3 / 12 » n'achète rien de visible.
function buildStars(modeId: ModeId, p: ModeProgress): HTMLElement {
  const stars = starCount(p);
  const box = el("div", "map-stars");
  box.setAttribute("aria-label", `${stars} étoiles sur ${MAX_STARS}`);
  box.appendChild(
    el("span", "map-stars-count", `${stars} / ${MAX_STARS}`),
  );
  const icon = el("span", "map-stars-icon", "★");
  icon.setAttribute("aria-hidden", "true");
  box.appendChild(icon);
  // Aucun palier restant (mode terminé, ou 8×8 dont la 3e étoile n'ouvre aucun
  // mode suivant) : on n'affiche pas une promesse vide.
  const next = nextStarReward(modeId, p);
  if (next) {
    box.appendChild(
      el("span", "map-stars-next", `Prochaine étoile : ${next.label}`),
    );
  }
  return box;
}

function buildHeader(modeId: ModeId, p: ModeProgress): HTMLElement {
  const head = el("header", "map-header");
  head.appendChild(el("div", "map-brand", "Tracemot"));
  head.appendChild(buildTabs());
  head.appendChild(el("div", "map-spring"));
  head.appendChild(buildStars(modeId, p));
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

// Sous-titre du défi : dérivé de defiMode (« 10×10 · 20 MOTS DE 5 LETTRES »),
// jamais écrit en dur — la série N×N doit rester paramétrable par config.ts.
function defiSub(modeId: ModeId, short: boolean): string {
  const m = defiMode(GAME_MODES[modeId]);
  const shape = `${m.rows}×${m.cols}`;
  return short
    ? `${shape} · ${m.wordCount} MOTS`
    : `${shape} · ${m.wordCount} MOTS DE ${m.wordLength} LETTRES`;
}

const DEFI_CAPTION: Record<Exclude<CellState, "hidden">, string> = {
  validated: "✓ VALIDÉ",
  active: "PRÊT À JOUER",
  disabled: "TERMINEZ LA LIGNE",
};

const DEFI_MARK: Record<Exclude<CellState, "hidden">, string> = {
  validated: "✓",
  active: "★",
  disabled: "★",
};

// Un seul contenu, deux enveloppes (`variant`) : la carte desktop et le bandeau
// mobile ne diffèrent que par leur mise en page, tranchée en CSS.
function buildDefi(
  modeId: ModeId,
  s: Section,
  row: Row,
  state: Exclude<CellState, "hidden">,
  variant: "card" | "band",
): HTMLElement {
  const key = defiOfRow(row);
  const id = defiId(s, key);
  const cls = `map-defi map-defi--${variant} ${stateClass(state)}`;
  const playable = state === "active" || state === "validated";
  const defi = playable ? el("button", cls) : el("div", cls);

  const mark = el("span", "map-defi-mark", DEFI_MARK[state]);
  mark.setAttribute("aria-hidden", "true");
  defi.appendChild(mark);
  defi.appendChild(el("span", "map-defi-title", "DÉFI"));
  const texts = el("span", "map-defi-texts");
  // Validé, le sous-titre passe en version courte : la case a déjà dit ce
  // qu'elle valait, elle n'a plus à se vendre.
  texts.appendChild(
    el("span", "map-defi-sub", defiSub(modeId, state === "validated")),
  );
  texts.appendChild(el("span", "map-defi-caption", DEFI_CAPTION[state]));
  defi.appendChild(texts);

  // Trois défis par section, tous de la même difficulté : la clé A/B/C est ce
  // qui les distingue à l'oreille d'un lecteur d'écran.
  const name = `Défi ${DIFFICULTY_LABELS[s].name} ${key}`;
  if (playable) {
    const button = defi as HTMLButtonElement;
    button.type = "button";
    button.dataset.level = id;
    button.setAttribute(
      "aria-label",
      state === "validated"
        ? `${name}, validé, rejouable`
        : `${name}, prêt à jouer`,
    );
  } else {
    defi.setAttribute("aria-label", `${name}, à débloquer`);
  }
  return defi;
}

// Placeholder desktop : garde la colonne du défi occupée quand celui-ci est
// encore caché, sinon les grilles des lignes ne seraient pas alignées entre
// elles (une ligne sans défi serait centrée sur toute la largeur).
function defiPlaceholder(): HTMLElement {
  const ghost = el("div", "map-defi map-defi--card is-hidden");
  ghost.setAttribute("aria-hidden", "true");
  return ghost;
}

// Une ligne = ses 5 normaux PUIS son défi (carte desktop + bandeau mobile).
// Le bandeau n'est rendu que si le défi est visible : sur mobile, un
// placeholder pleine largeur creuserait un trou dans la carte.
function buildRow(
  modeId: ModeId,
  p: ModeProgress,
  s: Section,
  row: Row,
): HTMLElement {
  const node = el("div", "map-row");
  const grid = el("div", "map-grid");
  for (let i = 1; i <= ROW_LENGTH; i++) {
    const n = (row - 1) * ROW_LENGTH + i;
    const id = levelId(s, n);
    grid.appendChild(buildCell(id, n, cellState(p, id)));
  }
  node.appendChild(grid);

  const state = cellState(p, defiId(s, defiOfRow(row)));
  if (state === "hidden") {
    node.appendChild(defiPlaceholder());
  } else {
    node.appendChild(buildDefi(modeId, s, row, state, "card"));
    node.appendChild(buildDefi(modeId, s, row, state, "band"));
  }
  return node;
}

// Étoiles gagnées dans la section : « ★★☆ » — pleines à gauche, creuses à
// droite, toujours trois glyphes pour que la ligne ne danse pas.
function starGlyphs(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(SECTION_STARS - stars);
}

function buildMilestone(
  s: Section,
  count: string,
  complete: boolean,
  stars: number | null,
): HTMLElement {
  const milestone = el(
    "div",
    `map-milestone${stars === null ? " is-locked" : ""}`,
  );
  milestone.appendChild(el("span", "map-milestone-rule"));
  const label = el("span", "map-milestone-label");
  label.appendChild(el("span", "map-milestone-name", DIFFICULTY_LABELS[s].name));
  label.appendChild(
    el(
      "span",
      `map-milestone-count${complete ? " is-complete" : ""}`,
      count,
    ),
  );
  // Section verrouillée : pas d'étoiles à montrer (aucune n'y a été gagnée) —
  // le compteur porte déjà le prix à payer.
  if (stars !== null) {
    label.appendChild(el("span", "map-milestone-stars", starGlyphs(stars)));
  }
  milestone.appendChild(label);
  milestone.appendChild(el("span", "map-milestone-rule"));
  return milestone;
}

// Jalon d'une section verrouillée : le prix affiché, sans aucune case. Il ne
// paraît QUE si la section est teasée (cf. sectionTeased) — donc uniquement
// quand un défi jouable peut, à lui seul, la déverrouiller. Le prix est donc
// toujours d'une étoile : le libellé n'a pas de pluriel à porter.
function buildLockedSection(s: Section): HTMLElement {
  const section = el("section", "map-section");
  section.appendChild(buildMilestone(s, "★ Encore 1 étoile", false, null));
  return section;
}

function buildSection(
  modeId: ModeId,
  p: ModeProgress,
  s: Section,
): HTMLElement | null {
  const stats = sectionStats(p, s);
  if (!stats.anyVisible) return null;

  const section = el("section", "map-section");
  section.appendChild(
    buildMilestone(
      s,
      stats.complete
        ? `${LEVELS_PER_SECTION} ✓`
        : `${stats.validatedCount} validé${stats.validatedCount > 1 ? "s" : ""}`,
      stats.complete,
      stats.stars,
    ),
  );

  // Croissance additive : aucune ligne au-delà de la dernière visible — la
  // carte grandit vers le bas, elle ne réserve pas de vide.
  const rows = el("div", "map-rows");
  for (let row = 1; row <= stats.lastVisibleRow; row++) {
    rows.appendChild(buildRow(modeId, p, s, row as Row));
  }
  section.appendChild(rows);
  return section;
}

// --- Rendu ------------------------------------------------------------------

export function renderMap(modeId: ModeId): void {
  currentMode = modeId;
  const p = loadProgress(modeId);

  mapEl.textContent = "";
  mapEl.appendChild(buildHeader(modeId, p));

  const body = el("div", "map-body");
  body.appendChild(
    el("p", "map-hint", isFirstLaunch() ? HINT_FIRST : HINT),
  );
  const sections = el("div", "map-sections");
  // Les seuils d'étoiles étant croissants, les sections débloquées forment un
  // préfixe : la première verrouillée rencontrée clôt la carte. On ne l'annonce
  // que si elle est à un défi près ; sinon la carte s'arrête sur le brouillard,
  // qui suffit à dire « il y a une suite » sans en promettre le prix.
  for (const s of SECTIONS) {
    if (!sectionStats(p, s).unlocked) {
      if (sectionTeased(p, s)) sections.appendChild(buildLockedSection(s));
      break;
    }
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
