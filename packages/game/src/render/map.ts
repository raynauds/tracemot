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
  DEFAULT_MODE,
  DIFFICULTY_LABELS,
  GAME_MODES,
  defiMode,
  type ModeId,
  type Section,
} from "@tracemot/core";
import type { LevelId, Row } from "@tracemot/core";
import {
  LEVELS_PER_SECTION,
  ROW_LENGTH,
  defiId,
  defiOfRow,
  levelId,
} from "@tracemot/core";
import { playSound } from "../audio/audio.ts";
import { checkIcon, closeIcon, starIcon } from "./icons.ts";
import {
  cellState,
  emptyProgressByMode,
  gateModeOf,
  isModeUnlocked,
  resumePoint,
  sectionStats,
  sectionTeased,
  sectionUnlocked,
  starCount,
  starsMissingForMode,
  starsMissingForSection,
  visibleModes,
  type CellState,
  type ModeProgress,
  type ProgressByMode,
} from "../game/progress.ts";

const SECTIONS: Section[] = [1, 2, 3, 4];
// Étoiles d'une section : trois défis, donc trois icônes, pleines ou creuses.
const SECTION_STARS = 3;

// Onglet affiché, piloté par les clics. Initialisé (une seule fois, cf.
// showMap) au dernier mode consulté — persisted.lastMode, doc 02/08,
// ex-localStorage — puis laissé sticky : un clic d'onglet ne se fait plus
// jamais écraser par un rendu qui suit (sharedProgress change à chaque mot
// trouvé, la carte se rafraîchit donc souvent pendant qu'elle est affichée).
let currentMode: ModeId = DEFAULT_MODE;
let modeInitialized = false;

// Progression reçue au dernier rendu (showMap/renderMap) : la carte ne
// possède aucune progression elle-même, elle ne fait que peindre celle qu'on
// lui donne — mais un clic d'onglet doit pouvoir re-rendre sans qu'on la lui
// repasse, d'où ce cache.
let currentProgress: ProgressByMode = emptyProgressByMode();

// Progression PROPRE du joueur local (doc 03 § « débloqué grâce à quelqu'un
// d'autre ») : sert de seule et unique comparaison au badge « grâce à la
// room » (currentProgress ∈ {active, validated} et celle-ci non) — jamais
// utilisée pour peindre l'accès lui-même, seulement pour ce badge.
let currentOwnProgress: ProgressByMode = emptyProgressByMode();

// Un badge « grâce à la room » est-il apparu QUELQUE PART sur ce rendu ? Sert
// à n'ajouter l'entrée de légende que si elle sert à quelque chose sur cet
// écran (remis à false en tête de renderMap).
let anySharedBadge = false;

// Case/défi débloqué par l'union mais pas par ma progression propre (doc 03/
// 06 § Q9) : même case, deux dérivations pures, comparées. Positif seulement
// pour un état jouable ou validé — un « disabled »/« hidden » identique des
// deux côtés n'a rien à annoncer.
function viaRoom(shared: ModeProgress, own: ModeProgress, id: LevelId): boolean {
  const sharedState = cellState(shared, id);
  if (sharedState !== "active" && sharedState !== "validated") return false;
  const ownState = cellState(own, id);
  return ownState !== "active" && ownState !== "validated";
}

// « Vu » n'est pas dérivable de la progression : un mode peut être débloqué et
// jamais ouvert. Le Set est un cache de session (mise à jour immédiate de la
// pastille) SEEDÉ depuis persisted.seenModes (doc 02/08) au premier showMap ;
// toute nouvelle entrée est aussi répercutée au persisted via onModeSeen
// (bindMap), pour survivre à la session suivante.
const seenModes = new Set<ModeId>();
function isModeSeen(modeId: ModeId): boolean {
  return seenModes.has(modeId);
}
function markModeSeen(modeId: ModeId): void {
  if (seenModes.has(modeId)) return; // déjà vu : pas d'action réseau à répéter
  seenModes.add(modeId);
  onModeSeen?.(modeId);
}

let onSelect: ((modeId: ModeId, id: LevelId) => void) | null = null;
let onModeSeen: ((modeId: ModeId) => void) | null = null;
let onModeChange: ((modeId: ModeId) => void) | null = null;

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

// Badge « grâce à la room » (doc 03/06 § Q9) : un coin de page repliée, en
// miniature, posé à côté d'un libellé (onglet de mode, jalon de section). Pur
// décor — muet pour le lecteur d'écran, qui a déjà la mention dans
// l'aria-label ; le sens complet est dans la légende (buildLegend).
function foldMark(): HTMLElement {
  const mark = el("span", "map-fold");
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

function buildTabs(): HTMLElement {
  const nav = el("nav", "map-tabs");
  nav.setAttribute("aria-label", "Mode de jeu");
  // Il y a au plus un onglet verrouillé (cf. visibleModes) : son panneau se pose
  // en fin de barre, qui l'ancre. Le mettre dans l'onglet est impossible — un
  // panneau ne peut pas vivre dans un <button>.
  let lockedTab: ModeId | null = null;
  for (const modeId of visibleModes(currentProgress)) {
    const unlocked = isModeUnlocked(currentProgress, modeId);
    // Débloqué par l'union mais pas par ma progression propre (doc 03/06 §
    // Q9) : même badge neutre que les cases, sans attribution nominative.
    const modeViaRoom = unlocked && !isModeUnlocked(currentOwnProgress, modeId);
    if (modeViaRoom) anySharedBadge = true;
    const tab = el("button", "map-tab");
    tab.type = "button";
    if (!unlocked) {
      // Onglet verrouillé : montré (on sait ce qui vient) et interrogeable — il
      // n'emmène nulle part, il dit ce qu'il faut pour l'ouvrir. Pas de
      // `disabled` donc : un bouton désactivé n'émet aucun clic. Le verrou reste
      // dit par le dessin (pointillé, gris, cadenas) et par l'aria-label.
      tab.classList.add("is-locked");
      asPanelTrigger(tab, `mode-${modeId}`);
      tab.setAttribute(
        "aria-label",
        `Mode ${modeLabel(modeId)}, verrouillé — ce qu'il faut pour l'ouvrir`,
      );
      tab.appendChild(lockIcon());
      lockedTab = modeId;
    } else {
      tab.dataset.mode = modeId;
      if (modeId === currentMode) {
        tab.classList.add("is-active");
        tab.setAttribute("aria-current", "true");
      }
      if (modeViaRoom) {
        tab.classList.add("is-shared");
        tab.setAttribute(
          "aria-label",
          `Mode ${modeLabel(modeId)}, débloqué grâce à la room`,
        );
      }
    }
    tab.appendChild(el("span", "map-tab-label", modeLabel(modeId)));
    if (modeViaRoom) tab.appendChild(foldMark());
    // Pastille : mode débloqué mais jamais ouvert — le seul signal « nouveau ».
    if (unlocked && !isModeSeen(modeId)) {
      const dot = el("span", "map-tab-dot");
      dot.setAttribute("aria-hidden", "true");
      tab.appendChild(dot);
    }
    nav.appendChild(tab);
  }
  if (lockedTab) nav.appendChild(buildLockedModePanel(lockedTab));
  return nav;
}

// Ce que dit un mode verrouillé : d'abord ce qu'il faut pour l'ouvrir, ensuite
// ce qu'on y trouvera. Le mode qui tient le verrou est NOMMÉ — c'est le
// précédent, pas forcément celui qu'on regarde (cf. gateModeOf).
function buildLockedModePanel(modeId: ModeId): DocumentFragment {
  const gate = gateModeOf(modeId);
  const missing = starsMissingForMode(currentProgress, modeId);
  const lines: (string | HTMLElement)[] = [];
  // Même phrase que pour une difficulté verrouillée — un seul verrou, une seule
  // formulation —, au mode gardien près : c'est le PRÉCÉDENT qui tient la porte,
  // pas forcément celui qu'on regarde, il faut donc le nommer.
  if (gate) {
    lines.push(missingStarsLine(missing, `ce mode (en ${modeLabel(gate)})`));
  }
  const m = GAME_MODES[modeId];
  lines.push(
    el(
      "p",
      "panel-spec",
      `${m.wordCount} mots de ${m.wordLength} lettres · ${m.rows}×${m.cols}`,
    ),
  );
  return buildInfoPanel(`mode-${modeId}`, `MODE ${modeLabel(modeId)}`, lines);
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

// Voile + panneau : le composant partagé du header de partie
// (src/render/panel.css), réemployé tel quel. La carte en pose trois — le
// compteur d'étoiles, chaque jalon de difficulté, le mode verrouillé —, d'où
// une fabrique : un élément qui nomme un palier s'explique quand on le touche,
// et toujours de la même façon.
//
// Le fragment est ajouté À CÔTÉ du déclencheur, dans un parent `position:
// relative` : c'est lui qui ancre le popover desktop (sous 860px, le composant
// bascule en feuille du bas et l'ancrage ne joue plus).
//
// `key` relie le déclencheur (`data-panel`) à ses trois nœuds ; `body` accepte
// des chaînes (autant de .panel-line) et des nœuds déjà formés (un .panel-spec,
// par exemple). Tout repart caché à chaque rendu — cf. setPanelOpen.
function buildInfoPanel(
  key: string,
  title: string,
  body: (string | HTMLElement)[],
): DocumentFragment {
  const frag = document.createDocumentFragment();

  const overlay = el("div", "diff-overlay");
  overlay.id = `map-overlay-${key}`;
  overlay.hidden = true;
  frag.appendChild(overlay);

  const panel = el("div", `diff-panel map-panel-${key}`);
  panel.id = `map-panel-${key}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.hidden = true;

  const head = el("div", "diff-panel-head");
  head.appendChild(el("span", "diff-panel-title", title));
  const close = el("button", "diff-close");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer");
  close.appendChild(closeIcon());
  head.appendChild(close);
  panel.appendChild(head);

  for (const entry of body) {
    panel.appendChild(
      typeof entry === "string" ? el("p", "panel-line", entry) : entry,
    );
  }
  frag.appendChild(panel);
  return frag;
}

// Marque un élément comme déclencheur du panneau `key`. Le clic est capté par la
// délégation de bindMap : aucun écouteur propre, le DOM est reconstruit à chaque
// rendu.
function asPanelTrigger(node: HTMLElement, key: string): void {
  node.dataset.panel = key;
  node.setAttribute("aria-haspopup", "dialog");
  node.setAttribute("aria-expanded", "false");
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
  asPanelTrigger(chip, "stars");
  chip.setAttribute(
    "aria-label",
    `${stars} ${stars > 1 ? "étoiles" : "étoile"} — ce qu'elles ouvrent`,
  );
  chip.appendChild(el("span", "map-stars-count", String(stars)));
  const icon = starIcon();
  icon.classList.add("map-stars-icon");
  chip.appendChild(icon);
  box.appendChild(chip);

  box.appendChild(buildInfoPanel("stars", "ÉTOILES", STARS_LINES));
  return box;
}

// La carte est désormais le PREMIER écran (doc 08 § Q21a : l'accueil disparaît,
// « pas de menu ») : son bouton REPRENDRE migre ici, en tête de carte — le
// raccourci le plus court vers le jeu, sans passer par les onglets ni les
// cases. Absent quand il n'y a plus rien à reprendre nulle part (tout validé).
//
// Le point de reprise est calculé sur l'onglet AFFICHÉ (currentMode) : c'est le
// même rôle que jouait `lastMode` pour l'ancien accueil (« le dernier mode
// consulté »), currentMode EST ce mode ici — pas un second concept à tenir
// d'accord avec lui.
function buildResumeButton(): HTMLElement | null {
  const resume = resumePoint(currentProgress, currentMode);
  if (!resume) return null;
  const button = el("button", "map-resume", "REPRENDRE");
  button.type = "button";
  button.dataset.resumeMode = resume.modeId;
  button.dataset.resumeLevel = resume.id;
  return button;
}

// Sans marque : le jeu ne se nomme nulle part sur la carte (src/theme/
// DESIGN.md — un logo n'a rien à faire dans le premier écran d'un jeu Rune).
// Reprendre et les onglets ouvrent donc le header — d'où l'on reprend, ce
// qu'on regarde —, le compteur d'étoiles le ferme.
function buildHeader(p: ModeProgress): HTMLElement {
  const head = el("header", "map-header");
  const left = el("div", "map-header-left");
  const resume = buildResumeButton();
  if (resume) left.appendChild(resume);
  left.appendChild(buildTabs());
  head.appendChild(left);
  head.appendChild(el("div", "map-spring"));
  const stars = buildStars(p);
  if (stars) head.appendChild(stars);
  return head;
}

function stateClass(s: CellState): string {
  return `is-${s}`;
}

function buildCell(
  id: LevelId,
  n: number,
  state: CellState,
  viaRoom = false,
): HTMLElement {
  if (state === "hidden") {
    // Rendue vide : elle ne réserve sa place que parce que sa ligne, elle,
    // est visible (une ligne entièrement cachée n'est pas rendue du tout).
    const ghost = el("div", "map-cell is-hidden");
    ghost.setAttribute("aria-hidden", "true");
    return ghost;
  }
  const playable = state === "active" || state === "validated";
  const cls = `map-cell ${stateClass(state)}${viaRoom ? " is-shared" : ""}`;
  const cell = playable ? el("button", cls) : el("div", cls);
  cell.appendChild(el("span", "map-cell-num", String(n)));
  if (state === "validated") {
    const mark = checkIcon();
    mark.classList.add("map-cell-mark");
    cell.appendChild(mark);
  }
  // Badge neutre « grâce à la room » (doc 03/06 § Q9) : le coin replié suffit
  // visuellement, l'aria-label porte l'équivalent textuel.
  const suffix = viaRoom ? ", débloqué grâce à la room" : "";
  if (playable) {
    const button = cell as HTMLButtonElement;
    button.type = "button";
    button.dataset.level = id;
    button.setAttribute(
      "aria-label",
      state === "validated"
        ? `Niveau ${id}, validé, rejouable${suffix}`
        : `Niveau ${id}, jouable${suffix}`,
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

// Seul le défi verrouillé (« disabled », donc à 4/5) a une légende. Ouvert ou
// gagné, il n'en a pas : le relief du bouton dit déjà qu'on peut le lancer, et
// l'étoile pleine qu'il est gagné. Le répéter en toutes lettres n'ajoute rien.
//
// Verrouillé, elle ne dit plus une injonction générique (« terminez la
// ligne ») mais la progression déjà faite dans la ligne. Elle n'en porte que la
// DERNIÈRE marche (4/5) : la case défi n'ayant l'état « disabled » qu'au moment
// où le dernier normal devient jouable, ses quatre prédécesseurs sont déjà
// validés ici. Les marches précédentes (0→3/5) reviennent au teaser
// (buildDefiProgress), tant que le défi n'existe pas encore comme case.
function defiCaption(
  state: Exclude<CellState, "hidden">,
  doneInRow: number,
): string | null {
  if (state !== "disabled") return null;
  return `${doneInRow}/${ROW_LENGTH} avant le défi`;
}

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
  doneInRow: number,
  viaRoom = false,
): HTMLElement {
  const key = defiOfRow(row);
  const id = defiId(s, key);
  const cls = `map-defi map-defi--${variant} ${stateClass(state)}${viaRoom ? " is-shared" : ""}`;
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
  const caption = defiCaption(state, doneInRow);
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
  // Badge neutre « grâce à la room » (doc 03/06 § Q9), même règle que les
  // cases : le coin replié (CSS, cf. .map-defi.is-shared) porte le visuel,
  // l'aria-label son équivalent textuel.
  const suffix = viaRoom ? ", débloqué grâce à la room" : "";
  if (playable) {
    const button = defi as HTMLButtonElement;
    button.type = "button";
    button.dataset.level = id;
    button.setAttribute(
      "aria-label",
      state === "validated"
        ? `${name}, validé, rejouable${suffix}`
        : `${name}, prêt à jouer${suffix}`,
    );
  } else {
    defi.setAttribute("aria-label", `${name}, à débloquer`);
  }
  return defi;
}

// Peint À LA PLACE du défi tant qu'il reste caché (doneInRow 0→3) : la case défi
// n'a d'état « disabled » — le seul qui porte une légende (cf. defiCaption) —
// qu'à 4/5, quand le dernier normal de la ligne devient jouable. Sans ce teaser,
// aucune des quatre premières victoires de la ligne ne se lirait sur la carte.
//
// Il garde aussi la colonne du défi occupée (même empreinte que .map-defi--card)
// pour que les lignes restent alignées, et se décline en carte (desktop) et
// bandeau (mobile) comme le défi. Muet pour le lecteur d'écran : les cases
// disent déjà leur état une à une, ceci n'est qu'un rappel visuel.
function buildDefiProgress(
  doneInRow: number,
  variant: "card" | "band",
): HTMLElement {
  const node = el("div", `map-defi map-defi--${variant} is-teaser`);
  node.setAttribute("aria-hidden", "true");
  node.appendChild(
    el("span", "map-defi-caption", `${doneInRow}/${ROW_LENGTH} avant le défi`),
  );
  return node;
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
  // Ma progression propre pour CE mode : seule comparaison du badge « grâce à
  // la room » (doc 03/06 § Q9), jamais utilisée pour l'accès lui-même.
  const own = currentOwnProgress[modeId];
  const node = el("div", "map-row");
  const grid = el("div", "map-grid");
  let doneInRow = 0;
  for (let i = 1; i <= ROW_LENGTH; i++) {
    const n = (row - 1) * ROW_LENGTH + i;
    const id = levelId(s, n);
    if (id in p.validated) doneInRow++;
    const shared = viaRoom(p, own, id);
    if (shared) anySharedBadge = true;
    grid.appendChild(buildCell(id, n, cellState(p, id), shared));
  }
  node.appendChild(grid);

  const defiLevelId = defiId(s, defiOfRow(row));
  const state = cellState(p, defiLevelId);
  if (state === "hidden") {
    // Défi encore caché : la colonne porte le compte des victoires de la ligne,
    // dans les deux enveloppes comme le défi lui-même (cf. buildDefiProgress).
    node.appendChild(buildDefiProgress(doneInRow, "card"));
    node.appendChild(buildDefiProgress(doneInRow, "band"));
  } else {
    const shared = viaRoom(p, own, defiLevelId);
    if (shared) anySharedBadge = true;
    node.appendChild(buildDefi(modeId, s, row, state, "card", doneInRow, shared));
    node.appendChild(buildDefi(modeId, s, row, state, "band", doneInRow, shared));
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

// Ce qu'il reste à payer, l'étoile écrite avec son dessin plutôt qu'avec le mot :
// c'est la monnaie du jeu, elle se reconnaît partout au même tracé (compteur du
// header, jalons, cases). L'icône parle ici — ailleurs elle est aria-hidden,
// mais au milieu d'une phrase son retrait laisserait un trou (« Il vous manque
// encore 1 pour… »).
function missingStarsLine(missing: number, what: string): HTMLElement {
  const line = el("p", "panel-line");
  line.appendChild(
    document.createTextNode(`Il vous manque encore ${missing} `),
  );
  const icon = starIcon();
  icon.removeAttribute("aria-hidden");
  icon.setAttribute("role", "img");
  icon.setAttribute("aria-label", missing > 1 ? "étoiles" : "étoile");
  line.appendChild(icon);
  line.appendChild(document.createTextNode(` pour débloquer ${what}.`));
  return line;
}

function buildMilestone(
  s: Section,
  count: HTMLElement | null,
  stars: number | null,
  missing: number,
  viaRoom = false,
): HTMLElement {
  const locked = stars === null;
  const milestone = el("div", `map-milestone${locked ? " is-locked" : ""}`);
  milestone.appendChild(el("span", "map-milestone-rule"));

  // Le nom d'une difficulté ne dit pas ce qu'elle change : le jalon s'interroge.
  // Seul le libellé est cliquable, pas toute la largeur de la ligne — les filets
  // restent du décor. L'ancre porte le popover (position: relative).
  const label = el("button", "map-milestone-label");
  label.type = "button";
  asPanelTrigger(label, `section-${s}`);
  const viaRoomSuffix = viaRoom ? ", débloqué grâce à la room" : "";
  label.setAttribute(
    "aria-label",
    `${DIFFICULTY_LABELS[s].name}${locked ? ", verrouillé" : viaRoomSuffix} — ce que c'est`,
  );
  label.appendChild(
    el("span", "map-milestone-name", DIFFICULTY_LABELS[s].name),
  );
  // Section débloquée par l'union mais pas par ma progression propre (doc 03/
  // 06 § Q9) : même badge neutre que les cases.
  if (viaRoom) label.appendChild(foldMark());
  // Le décompte des niveaux validés se lit sur la carte elle-même : le jalon ne
  // le répète pas. Il ne reste que la section complète (« 18 ✓ ») et la section
  // verrouillée (son prix).
  if (count) label.appendChild(count);
  // Section verrouillée : pas d'étoiles à montrer (aucune n'y a été gagnée) —
  // le compteur porte déjà le prix à payer.
  if (!locked) label.appendChild(buildStarRow(stars));

  const anchor = el("div", "map-milestone-anchor");
  anchor.appendChild(label);
  // Verrouillée, la section dit ce qu'elle coûte encore. Le jalon porte déjà le
  // prix, mais en raccourci (« ★ Encore 1 étoile ») : le panneau est l'endroit
  // où la phrase est entière.
  anchor.appendChild(
    buildInfoPanel(
      `section-${s}`,
      DIFFICULTY_LABELS[s].name.toUpperCase(),
      locked
        ? [
            DIFFICULTY_LABELS[s].desc,
            missingStarsLine(missing, "cette difficulté"),
          ]
        : [DIFFICULTY_LABELS[s].desc],
    ),
  );
  milestone.appendChild(anchor);

  milestone.appendChild(el("span", "map-milestone-rule"));
  return milestone;
}

// Jalon d'une section verrouillée : le prix affiché, sans aucune case. Il ne
// paraît QUE si la section est teasée (cf. sectionTeased) — donc uniquement
// quand un défi jouable peut, à lui seul, la déverrouiller. Le prix est donc
// toujours d'une étoile : le libellé n'a pas de pluriel à porter.
function buildLockedSection(p: ModeProgress, s: Section): HTMLElement {
  const price = el("span", "map-milestone-count");
  price.appendChild(starIcon());
  price.appendChild(el("span", undefined, "Encore 1 étoile"));

  const section = el("section", "map-section");
  section.appendChild(
    buildMilestone(s, price, null, starsMissingForSection(p, s)),
  );
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

  // Section débloquée par l'union mais pas encore par ma progression propre
  // (doc 03/06 § Q9) : `stats.unlocked` est garanti vrai ici (renderMap
  // n'appelle buildSection que pour une section déjà ouverte côté union).
  const sectionShared = !sectionUnlocked(currentOwnProgress[modeId], s);
  if (sectionShared) anySharedBadge = true;

  const section = el("section", "map-section");
  section.appendChild(buildMilestone(s, count, stats.stars, 0, sectionShared));

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
  markModeSeen(modeId); // idempotent : couvre l'onglet initial ET les clics
  const p = currentProgress[modeId];

  // Remis à false à chaque rendu : la légende (buildLegend) n'annonce le
  // badge « grâce à la room » que s'il apparaît vraiment sur CET écran (doc
  // 03/06 § Q9) — buildTabs (tous les modes) et buildSection/buildRow (le
  // mode affiché) le font passer à true en le rencontrant.
  anySharedBadge = false;

  // Le DOM part avec ses panneaux : plus rien n'est ouvert.
  openPanel = null;
  mapEl.textContent = "";
  mapEl.appendChild(buildHeader(p));

  // Aucune accroche, pas même au premier lancement : la carte se lit d'elle-même
  // (une case, un numéro, une étoile), et ce que l'étoile vaut est dit par le
  // panneau du compteur. Elle ne s'explique pas, elle se montre.
  const body = el("div", "map-body");
  const sections = el("div", "map-sections");
  // Les seuils d'étoiles étant croissants, les sections débloquées forment un
  // préfixe : la première verrouillée rencontrée clôt la carte. On ne l'annonce
  // que si elle est à un défi près ; sinon la carte s'arrête net, sans rien
  // promettre de ce qui vient.
  for (const s of SECTIONS) {
    if (!sectionStats(p, s).unlocked) {
      if (sectionTeased(p, s)) sections.appendChild(buildLockedSection(p, s));
      break;
    }
    const node = buildSection(modeId, p, s);
    if (node) sections.appendChild(node);
  }
  body.appendChild(sections);
  mapEl.appendChild(body);

  mapEl.appendChild(buildLegend(anySharedBadge));
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

// `withShared` : n'ajoute l'entrée « grâce à la room » que si le badge est
// vraiment apparu sur cet écran (doc 03/06 § Q9) — sinon la légende d'une
// partie solo (ou d'une room dont l'union égale ma progression) resterait
// silencieuse sur un signe qu'elle ne montre jamais.
function buildLegend(withShared: boolean): HTMLElement {
  const legend = el("div", "map-legend");
  legend.appendChild(legendItem("is-validated", "VALIDÉ"));
  legend.appendChild(legendItem("is-active", "JOUABLE"));
  legend.appendChild(legendItem("is-disabled", "À DÉBLOQUER"));
  if (withShared) legend.appendChild(legendItem("is-shared", "GRÂCE À LA ROOM"));
  return legend;
}

// --- Affichage et événements ------------------------------------------------

// Toujours re-rendre : au retour de partie, les cases débloquées par la
// validation doivent apparaître sans que l'appelant ait à y penser (et,
// désormais, à chaque mot trouvé par n'importe qui — sharedProgress est
// l'union de la room, doc 03). La carte ne possède aucune progression
// elle-même (doc 01) : l'appelant la fournit à chaque affichage ; elle reste
// en cache (currentProgress) pour les rendus internes déclenchés par un clic
// d'onglet.
//
// `lastMode`/`seenModes` : lus depuis `game.persisted` (doc 02/08) — ne
// SEEDENT `currentMode`/seenModes qu'une fois (modeInitialized) : les rendus
// suivants ne doivent pas écraser un onglet choisi par le joueur en session.
//
// `ownProgress` : ma progression propre (doc 03) — jamais peinte pour
// l'accès, seulement comparée à `progress` (l'union) pour le badge « grâce à
// la room » (doc 03/06 § Q9).
export function showMap(
  progress: ProgressByMode,
  ownProgress: ProgressByMode,
  lastMode: ModeId,
  seenModesList: ModeId[],
): void {
  if (!modeInitialized) {
    currentMode = lastMode;
    for (const m of seenModesList) seenModes.add(m);
    modeInitialized = true;
  }
  currentProgress = progress;
  currentOwnProgress = ownProgress;
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

// Panneau ouvert, ou null. Un rendu reconstruit tout fermé et remet cette clé à
// null (cf. renderMap) : c'est sans conséquence puisque le voile couvre onglets
// et cases, donc aucun rendu ne peut survenir panneau ouvert.
let openPanel: string | null = null;

// Un seul panneau à la fois : ouvrir ferme le précédent. Les nœuds sont relus à
// chaque appel — ceux du rendu précédent n'existent plus — et une clé sans nœuds
// est ignorée en silence (le compteur d'étoiles disparaît à zéro étoile).
function setPanelOpen(key: string | null): void {
  for (const k of [openPanel, key]) {
    if (!k) continue;
    const open = k === key;
    const panel = document.getElementById(`map-panel-${k}`);
    const overlay = document.getElementById(`map-overlay-${k}`);
    if (!panel || !overlay) continue;
    panel.hidden = !open;
    overlay.hidden = !open;
    mapEl
      .querySelector(`[data-panel="${k}"]`)
      ?.setAttribute("aria-expanded", String(open));
  }
  openPanel = key;
}

// Délégation unique sur #map : le contenu étant reconstruit à chaque rendu,
// attacher les écouteurs aux cases signifierait les réattacher sans cesse.
//
// `onSelectLevel` sert À LA FOIS aux cases/défis et au bouton REPRENDRE :
// proposer un niveau est le même geste, quelle que soit la case d'où il part.
// `handlers.onModeSeen` (dispatché vers `Rune.actions.markModeSeen`) ne
// tourne qu'à la PREMIÈRE ouverture d'un mode (gated par le Set local, cf.
// markModeSeen) ; `handlers.onModeChange` (→ `Rune.actions.setLastMode`)
// tourne à CHAQUE clic d'onglet, vu ou non — ce sont deux préférences
// distinctes (doc 02/08).
export function bindMap(
  onSelectLevel: (modeId: ModeId, id: LevelId) => void,
  handlers: {
    onModeSeen: (modeId: ModeId) => void;
    onModeChange: (modeId: ModeId) => void;
  },
): void {
  onSelect = onSelectLevel;
  onModeSeen = handlers.onModeSeen;
  onModeChange = handlers.onModeChange;
  mapEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Les panneaux passent avant le reste : leurs déclencheurs vivent dans le
    // header et dans les jalons, et leur voile intercepte de toute façon tout
    // clic ailleurs.
    //
    // Tout ce qui consulte ou navigue sonne en secondaire ; ce qui ferme ou
    // sort de l'écran sonne en fermeture ; seul le choix d'un niveau — le
    // geste qui engage une partie — sonne en principal. Les éléments inertes
    // (cases verrouillées, défis grisés) ne passent par aucune branche : ils
    // restent muets, comme ils sont muets à l'écran.
    const trigger = target.closest<HTMLElement>("[data-panel]");
    if (trigger) {
      const key = trigger.dataset.panel as string;
      playSound(openPanel === key ? "ui-close" : "ui-secondary");
      setPanelOpen(openPanel === key ? null : key);
      return;
    }
    if (target.closest(".diff-close") || target.closest(".diff-overlay")) {
      playSound("ui-close");
      setPanelOpen(null);
      return;
    }

    const tab = target.closest<HTMLElement>("[data-mode]");
    if (tab) {
      const modeId = tab.dataset.mode as ModeId;
      if (modeId === currentMode) return; // onglet déjà actif : rien, pas même un son
      playSound("ui-secondary");
      renderMap(modeId); // marque aussi le mode vu (cf. renderMap)
      onModeChange?.(modeId);
      mapEl.scrollTop = 0;
      return;
    }

    const resume = target.closest<HTMLElement>("[data-resume-level]");
    if (resume && onSelect) {
      playSound("ui-primary");
      onSelect(
        resume.dataset.resumeMode as ModeId,
        resume.dataset.resumeLevel as LevelId,
      );
      return;
    }

    const cell = target.closest<HTMLElement>("[data-level]");
    if (cell && onSelect) {
      playSound("ui-primary");
      onSelect(currentMode, cell.dataset.level as LevelId);
    }
  });
  // Échap ferme le panneau ouvert, comme celui de la règle du jeu.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPanel) {
      playSound("ui-close");
      setPanelOpen(null);
    }
  });
}
