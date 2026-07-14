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
import { checkIcon, starIcon } from "./icons.ts";
import {
  cellState,
  isModeSeen,
  isModeUnlocked,
  loadLastMode,
  loadProgress,
  markModeSeen,
  saveLastMode,
  sectionStats,
  sectionTeased,
  starCount,
  visibleModes,
  type CellState,
  type ModeProgress,
} from "../game/progress.ts";

const SECTIONS: Section[] = [1, 2, 3, 4];
// Étoiles d'une section : trois défis, donc trois icônes, pleines ou creuses.
const SECTION_STARS = 3;


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
      tab.setAttribute("aria-label", `Mode ${modeLabel(modeId)}, verrouillé`);
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

// Ce que le panneau des étoiles explique : comment on les gagne, et ce qu'elles
// ouvrent. Ni seuil ni nom de difficulté : la mécanique, pas le barème — la
// carte, elle, annonce le prochain palier au moment où il est à portée
// (« ★ Encore 1 étoile »).
const STARS_LINES = [
  "Chaque défi validé rapporte une étoile.",
  "Elles ouvrent les difficultés suivantes, et le mode au-dessus - des " +
    "grilles plus grandes, des mots plus longs.",
];

// Voile + panneau du compteur : le composant partagé du header de partie
// (src/render/panel.css), réemployé tel quel. Il naît DANS la chip pour que le
// popover s'ancre dessus, et repart caché à chaque rendu (cf. bindMap).
function buildStarsPanel(): DocumentFragment {
  const frag = document.createDocumentFragment();

  const overlay = el("div", "diff-overlay");
  overlay.id = "map-stars-overlay";
  overlay.hidden = true;
  frag.appendChild(overlay);

  const panel = el("div", "diff-panel map-stars-panel");
  panel.id = "map-stars-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Étoiles");
  panel.hidden = true;

  const head = el("div", "diff-panel-head");
  head.appendChild(el("span", "diff-panel-title", "ÉTOILES"));
  const close = el("button", "diff-close", "✕");
  close.type = "button";
  close.id = "map-stars-close";
  close.setAttribute("aria-label", "Fermer");
  head.appendChild(close);
  panel.appendChild(head);

  for (const line of STARS_LINES)
    panel.appendChild(el("p", "panel-line", line));
  frag.appendChild(panel);
  return frag;
}

// Compteur d'étoiles du mode AFFICHÉ (et non de la progression globale) : la
// carte parle du mode qu'on regarde. À zéro étoile, le compteur ne dit rien
// qu'on ne sache déjà : on le tait — et avec lui l'explication, qui n'aurait
// que des verrous à montrer (l'accroche de la carte dit déjà le principe).
function buildStars(p: ModeProgress): HTMLElement | null {
  const stars = starCount(p);
  if (stars === 0) return null;
  const box = el("div", "map-stars");

  const chip = el("button", "map-stars-chip");
  chip.type = "button";
  chip.id = "map-stars-chip";
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", "false");
  chip.setAttribute(
    "aria-label",
    `${stars} ${stars > 1 ? "étoiles" : "étoile"} — ce qu'elles ouvrent`,
  );
  chip.appendChild(el("span", "map-stars-count", String(stars)));
  const icon = starIcon();
  icon.classList.add("map-stars-icon");
  chip.appendChild(icon);
  box.appendChild(chip);

  box.appendChild(buildStarsPanel());
  return box;
}

// Sans marque : le jeu n'a pas à se nommer sur son propre écran. Les onglets
// ouvrent donc le header, le compteur d'étoiles le ferme.
function buildHeader(p: ModeProgress): HTMLElement {
  const head = el("header", "map-header");
  head.appendChild(buildTabs());
  head.appendChild(el("div", "map-spring"));
  const stars = buildStars(p);
  if (stars) head.appendChild(stars);
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
    const mark = checkIcon();
    mark.classList.add("map-cell-mark");
    cell.appendChild(mark);
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

// Sous-titre du défi : dérivé de defiMode (« 10×10 · 20 MOTS »), jamais écrit en
// dur — la série N×N doit rester paramétrable par config.ts.
//
// Verrouillé, le format s'annonce en entier (« … DE 5 LETTRES ») : c'est une
// promesse, elle a le droit de se vendre. Une fois le défi à portée, la longueur
// des mots ne décide plus rien — la grille, elle, le dira.
function defiSub(modeId: ModeId, locked: boolean): string {
  const m = defiMode(GAME_MODES[modeId]);
  const sub = `${m.rows}×${m.cols} · ${m.wordCount} MOTS`;
  return locked ? `${sub} DE ${m.wordLength} LETTRES` : sub;
}

// Seul le défi verrouillé a une légende — elle dit ce qui lui manque. Ouvert ou
// gagné, il n'en a pas : le relief du bouton dit déjà qu'on peut le lancer, et
// l'étoile pleine qu'il est gagné. Le répéter en toutes lettres n'ajoute rien.
const DEFI_CAPTION: Record<Exclude<CellState, "hidden">, string | null> = {
  validated: null,
  active: null,
  disabled: "TERMINEZ LA LIGNE",
};

// Le défi porte l'étoile qu'il met en jeu, et son remplissage EST le score :
// creuse tant qu'elle reste à prendre, pleine une fois gagnée. Même signe que
// dans les jalons de section — un joueur n'a qu'une lecture à apprendre.
function defiMark(state: Exclude<CellState, "hidden">): SVGSVGElement {
  return starIcon(state === "validated");
}

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

  const mark = defiMark(state);
  mark.classList.add("map-defi-mark");
  defi.appendChild(mark);
  defi.appendChild(el("span", "map-defi-title", "DÉFI"));
  const texts = el("span", "map-defi-texts");
  texts.appendChild(
    el("span", "map-defi-sub", defiSub(modeId, state === "disabled")),
  );
  const caption = DEFI_CAPTION[state];
  if (caption) texts.appendChild(el("span", "map-defi-caption", caption));
  defi.appendChild(texts);

  // Validé, le défi prend la coche des cases, au même coin : deux niveaux gagnés
  // se reconnaissent au même signe, où que la carte les pose.
  if (state === "validated") {
    const check = checkIcon();
    check.classList.add("map-defi-check");
    defi.appendChild(check);
  }

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

// Étoiles gagnées dans la section : pleines à gauche, creuses à droite,
// toujours trois pour que la ligne ne danse pas d'une section à l'autre.
function buildStarRow(stars: number): HTMLElement {
  const row = el("span", "map-milestone-stars");
  for (let i = 0; i < SECTION_STARS; i++) row.appendChild(starIcon(i < stars));
  return row;
}

function buildMilestone(
  s: Section,
  count: HTMLElement | null,
  stars: number | null,
): HTMLElement {
  const milestone = el(
    "div",
    `map-milestone${stars === null ? " is-locked" : ""}`,
  );
  milestone.appendChild(el("span", "map-milestone-rule"));
  const label = el("span", "map-milestone-label");
  label.appendChild(
    el("span", "map-milestone-name", DIFFICULTY_LABELS[s].name),
  );
  // Le décompte des niveaux validés se lit sur la carte elle-même : le jalon ne
  // le répète pas. Il ne reste que la section complète (« 18 ✓ ») et la section
  // verrouillée (son prix).
  if (count) label.appendChild(count);
  // Section verrouillée : pas d'étoiles à montrer (aucune n'y a été gagnée) —
  // le compteur porte déjà le prix à payer.
  if (stars !== null) label.appendChild(buildStarRow(stars));
  milestone.appendChild(label);
  milestone.appendChild(el("span", "map-milestone-rule"));
  return milestone;
}

// Jalon d'une section verrouillée : le prix affiché, sans aucune case. Il ne
// paraît QUE si la section est teasée (cf. sectionTeased) — donc uniquement
// quand un défi jouable peut, à lui seul, la déverrouiller. Le prix est donc
// toujours d'une étoile : le libellé n'a pas de pluriel à porter.
function buildLockedSection(s: Section): HTMLElement {
  const price = el("span", "map-milestone-count");
  price.appendChild(starIcon());
  price.appendChild(el("span", undefined, "Encore 1 étoile"));

  const section = el("section", "map-section");
  section.appendChild(buildMilestone(s, price, null));
  return section;
}

function buildSection(
  modeId: ModeId,
  p: ModeProgress,
  s: Section,
): HTMLElement | null {
  const stats = sectionStats(p, s);
  if (!stats.anyVisible) return null;

  // Complète, la section porte son total coché ; sinon aucun compteur.
  let count: HTMLElement | null = null;
  if (stats.complete) {
    count = el("span", "map-milestone-count is-complete");
    count.appendChild(el("span", undefined, String(LEVELS_PER_SECTION)));
    count.appendChild(checkIcon());
  }

  const section = el("section", "map-section");
  section.appendChild(buildMilestone(s, count, stats.stars));

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
  mapEl.appendChild(buildHeader(p));

  // Aucune accroche, pas même au premier lancement : la carte se lit d'elle-même
  // (une case, un numéro, une étoile), et ce que l'étoile vaut est dit par le
  // panneau du compteur. Elle ne s'explique pas, elle se montre.
  const body = el("div", "map-body");
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
  body.appendChild(fog);
  mapEl.appendChild(body);

  mapEl.appendChild(buildLegend());
}

function legendItem(className: string, label: string): HTMLElement {
  const item = el("div", "map-legend-item");
  const swatch = el("span", `map-legend-swatch ${className}`);
  swatch.setAttribute("aria-hidden", "true");
  // La pastille « validé » porte la même coche que les cases qu'elle décrit.
  if (className === "is-validated") swatch.appendChild(checkIcon());
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

// Panneau des étoiles : ouvert/fermé sans état persistant — un rendu le
// reconstruit fermé, et c'est sans conséquence puisque le voile couvre onglets
// et cases (aucun rendu ne peut donc survenir panneau ouvert). Les nœuds sont
// relus à chaque appel : ceux du rendu précédent n'existent plus.
function setStarsPanelOpen(open: boolean): void {
  const chip = document.getElementById("map-stars-chip");
  const panel = document.getElementById(
    "map-stars-panel",
  ) as HTMLElement | null;
  const overlay = document.getElementById(
    "map-stars-overlay",
  ) as HTMLElement | null;
  if (!chip || !panel || !overlay) return;
  panel.hidden = !open;
  overlay.hidden = !open;
  chip.setAttribute("aria-expanded", String(open));
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

    // Le panneau des étoiles passe avant le reste : sa chip vit dans le header,
    // et son voile intercepte de toute façon tout clic ailleurs.
    if (target.closest("#map-stars-chip")) {
      const panel = document.getElementById("map-stars-panel") as HTMLElement;
      setStarsPanelOpen(panel.hidden as boolean);
      return;
    }
    if (
      target.closest("#map-stars-close") ||
      target.closest("#map-stars-overlay")
    ) {
      setStarsPanelOpen(false);
      return;
    }

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
  // Échap ferme le panneau des étoiles, comme celui de la règle du jeu.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const panel = document.getElementById(
      "map-stars-panel",
    ) as HTMLElement | null;
    if (panel && !panel.hidden) setStarsPanelOpen(false);
  });
  // Le mode ouvert d'emblée compte comme vu (sinon sa pastille survivrait à sa
  // première visite).
  markModeSeen(currentMode);
}
