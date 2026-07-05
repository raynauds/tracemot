// @ts-check
// Tout ce qui touche au DOM : construction de la grille et du registre,
// tracé SVG, chrono, états de partie (aperçu, refus, victoire).

import {
  CELL_COUNT,
  DIFFICULTY_LABELS,
  DIFFICULTY_TOAST_MS,
  ENABLED_DIFFICULTIES,
  FIVE_WORD_LENGTH,
  FR_NUMBERS,
  REJECT_DISPLAY_MS,
  WORDS_TO_WIN,
} from "./config.js";
import { wordRejectReason } from "./rules.js";
import { state } from "./state.js";

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

export const gridEl = byId("grid");
export const replayEl = byId("replay");
const traceLineEl = byId("trace-line");
const traceEl = byId("trace");
const statusEl = byId("status");
const winEl = byId("win");
const winSubEl = byId("win-sub");
const chronoEl = byId("chrono");
const counterEl = byId("counter");
const wordListEl = byId("word-list");
const ruleTextEl = byId("rule-text");

/** @type {HTMLElement[]} */
const cells = []; // les 25 divs .cell, dans l'ordre
/** @type {HTMLElement[]} */
const listRows = []; // les WORDS_TO_WIN lignes du registre

// --- Utilitaires --------------------------------------------------------

/** @param {number} ms */
function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// Consigne en deux variantes : la phrase complète sur desktop, une version
// resserrée sur mobile où la place verticale est comptée (bascule CSS).
function playingRuleText() {
  const n = FR_NUMBERS[WORDS_TO_WIN] || String(WORDS_TO_WIN);
  const l5 = FR_NUMBERS[FIVE_WORD_LENGTH] || String(FIVE_WORD_LENGTH);
  const N = `${n[0].toUpperCase()}${n.slice(1)}`;
  return {
    desktop:
      `${N} mots de ${l5} lettres pavent la ` +
      `grille : chaque lettre sert à exactement un mot. Reliez des lettres ` +
      `voisines pour les retrouver.`,
    mobile:
      `Trouvez les ${n} mots de ${l5} lettres qui pavent la grille ` +
      `en reliant les lettres adjacentes.`,
  };
}

/** @param {{desktop: string, mobile: string}} rule */
function renderRuleText(rule) {
  const d = document.createElement("span");
  d.className = "rule-desktop";
  d.textContent = rule.desktop;
  const m = document.createElement("span");
  m.className = "rule-mobile";
  m.textContent = rule.mobile;
  ruleTextEl.replaceChildren(d, m);
}

// --- Sélecteur de difficulté (chip + popover / feuille + toast) ------------

/** @type {HTMLElement|null} */
const difficultyNav = document.querySelector(".difficulty");
const diffChipEl = byId("diff-chip");
const diffChipLabelEl = byId("diff-chip-label");
const diffPanelEl = byId("diff-panel");
const diffListEl = byId("diff-list");
const diffOverlayEl = byId("diff-overlay");
const diffCloseEl = byId("diff-close");
const diffToastEl = byId("diff-toast");
const diffToastTitleEl = byId("diff-toast-title");
const diffToastSubEl = byId("diff-toast-sub");

/** @type {HTMLButtonElement[]} Lignes du panneau, une par difficulté. */
const diffRows = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let diffToastTimer = null;

// Lignes du panneau générées depuis DIFFICULTY_LABELS : étoiles pleines
// jusqu'au niveau, nom, description, coche sur le niveau courant.
const maxLevel = Object.keys(DIFFICULTY_LABELS).length;
for (const [levelStr, { name, desc }] of Object.entries(DIFFICULTY_LABELS)) {
  const level = Number(levelStr);
  const row = document.createElement("button");
  row.type = "button";
  row.className = "diff-level";
  row.dataset.difficulty = levelStr;

  const bar = document.createElement("span");
  bar.className = "diff-level-bar";
  const stars = document.createElement("span");
  stars.className = "diff-level-stars";
  const on = document.createElement("span");
  on.className = "on";
  on.textContent = "★".repeat(level);
  const off = document.createElement("span");
  off.className = "off";
  off.textContent = "★".repeat(maxLevel - level);
  stars.append(on, off);
  const text = document.createElement("span");
  text.className = "diff-level-text";
  const nameEl = document.createElement("span");
  nameEl.className = "diff-level-name";
  nameEl.textContent = name;
  const descEl = document.createElement("span");
  descEl.className = "diff-level-desc";
  descEl.textContent = desc;
  text.append(nameEl, descEl);
  const check = document.createElement("span");
  check.className = "diff-level-check";
  check.textContent = "✓";

  row.append(bar, stars, text, check);
  diffListEl.appendChild(row);
  diffRows.push(row);
}

/** @param {boolean} open */
function setDifficultyPanelOpen(open) {
  diffPanelEl.hidden = !open;
  diffOverlayEl.hidden = !open;
  diffChipEl.classList.toggle("open", open);
  diffChipEl.setAttribute("aria-expanded", String(open));
}

export function renderDifficultyBar() {
  // Une seule difficulté accessible : le sélecteur disparaît, le jeu se
  // présente sans notion de difficulté.
  if (difficultyNav) difficultyNav.hidden = ENABLED_DIFFICULTIES.length <= 1;
  const label = DIFFICULTY_LABELS[state.difficulty];
  diffChipLabelEl.textContent = `${state.difficulty} · ${label.name}`;
  // La chip démarre en visibility:hidden (CSS) : dévoilée maintenant que
  // le niveau affiché est le vrai.
  if (difficultyNav) difficultyNav.classList.add("ready");
  for (const row of diffRows) {
    const level = Number(row.dataset.difficulty);
    row.classList.toggle("selected", level === state.difficulty);
    row.disabled = !ENABLED_DIFFICULTIES.some((d) => d === level);
  }
}

// Confirmation d'un changement de niveau : la feuille s'est refermée,
// le toast rappelle le niveau choisi et qu'une grille est relancée.
export function showDifficultyToast() {
  const label = DIFFICULTY_LABELS[state.difficulty];
  diffToastTitleEl.textContent = `Niveau ${state.difficulty} - ${label.name}`;
  diffToastSubEl.textContent = `${label.desc} · Nouvelle grille`;
  diffToastEl.hidden = false;
  if (diffToastTimer !== null) clearTimeout(diffToastTimer);
  diffToastTimer = setTimeout(() => {
    diffToastTimer = null;
    diffToastEl.hidden = true;
  }, DIFFICULTY_TOAST_MS);
}

/** @param {(difficulty: number) => void} onSelect */
export function bindDifficultyBar(onSelect) {
  diffChipEl.addEventListener("click", () =>
    setDifficultyPanelOpen(diffPanelEl.hidden),
  );
  diffCloseEl.addEventListener("click", () => setDifficultyPanelOpen(false));
  diffOverlayEl.addEventListener("click", () => setDifficultyPanelOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !diffPanelEl.hidden)
      setDifficultyPanelOpen(false);
  });
  for (const row of diffRows) {
    row.addEventListener("click", () => {
      // Sélection = fermeture immédiate ; re-choisir le niveau courant
      // referme simplement, sans relancer de grille.
      setDifficultyPanelOpen(false);
      const level = Number(row.dataset.difficulty);
      if (level !== state.difficulty) onSelect(level);
    });
  }
}

// --- Construction du plateau ---------------------------------------------

export function buildBoard() {
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.style.setProperty("--i", String(i)); // cadence de l'animation d'impression
    // Les classes d'animation one-shot se retirent d'elles-mêmes, sinon elles
    // écraseraient les animations suivantes (pop du tracé, flash…).
    cell.addEventListener("animationend", (e) => {
      if (e.animationName === "cell-deal") cell.classList.remove("deal");
      if (e.animationName === "cell-flash") cell.classList.remove("flash");
    });
    gridEl.appendChild(cell);
    cells.push(cell);
  }

  // Les lignes du registre sont pré-rendues dans le HTML (anti-shift au
  // chargement) : on les adopte, et on n'ajuste que si WORDS_TO_WIN diffère.
  while (wordListEl.children.length > WORDS_TO_WIN) {
    wordListEl.lastElementChild?.remove();
  }
  for (let i = 0; i < WORDS_TO_WIN; i++) {
    const existing = /** @type {HTMLElement|undefined} */ (
      wordListEl.children[i]
    );
    if (existing) {
      listRows.push(existing);
      continue;
    }
    const li = document.createElement("li");
    li.className = "word-row empty";
    const num = document.createElement("span");
    num.className = "word-num";
    num.textContent = String(i + 1).padStart(2, "0");
    const content = document.createElement("span");
    content.className = "word-dots";
    content.textContent = "· · · · ·";
    li.append(num, content);
    wordListEl.appendChild(li);
    listRows.push(li);
  }
}

// --- Registre des mots ----------------------------------------------------

// Sur mobile la liste est compressée et scrolle : on garde la ligne active
// en vue. Sans effet quand la liste tient en entier (desktop).
/** @param {HTMLElement} row */
function keepRowVisible(row) {
  if (wordListEl.scrollHeight > wordListEl.clientHeight) {
    row.scrollIntoView({ block: "nearest" });
  }
}

/** @param {HTMLElement} row */
function resetListRow(row) {
  row.className = "word-row empty";
  const content = row.children[1];
  content.className = "word-dots";
  content.textContent = "· · · · ·";
  const reason = row.querySelector(".word-reason");
  if (reason) reason.remove();
}

// Aperçu du tracé en cours dans la première ligne libre du registre :
// les lettres s'affichent en terne tant que le mot n'est pas validé.
export function renderPendingWord() {
  const row = listRows[state.found.length];
  if (!row) return;
  if (state.rejectTimer !== null) {
    clearTimeout(state.rejectTimer);
    state.rejectTimer = null;
  }
  resetListRow(row);
  if (state.path.length === 0) return;
  row.className = "word-row pending";
  const content = row.children[1];
  const word = state.path.map((i) => state.letters[i]).join("");
  // Hint discret : l'encre se densifie dès que le tracé forme un mot
  // acceptable.
  const isWord = wordRejectReason(word) === null;
  content.className = isWord ? "word-text pending valid" : "word-text pending";
  content.textContent = word;
  keepRowVisible(row);
}

// Mot refusé : lettres en rouge, motif du refus à droite, puis la ligne
// redevient libre une fois le message lu.
/**
 * @param {string} word
 * @param {string} reason
 */
export function showReject(word, reason) {
  const row = listRows[state.found.length];
  if (!row) return;
  shakeGrid();
  row.className = "word-row rejected";
  const content = row.children[1];
  content.className = "word-text rejected";
  content.textContent = word;
  const label = document.createElement("span");
  label.className = "word-reason";
  label.textContent = reason;
  row.appendChild(label);
  state.rejectTimer = setTimeout(() => {
    state.rejectTimer = null;
    resetListRow(row);
  }, REJECT_DISPLAY_MS);
}

/**
 * @param {number} index
 * @param {string} word
 * @param {boolean} animate
 */
export function fillListRow(index, word, animate) {
  const row = listRows[index];
  row.className = "word-row";
  const content = row.children[1];
  content.className = animate ? "word-text stamp" : "word-text";
  content.textContent = word;
  keepRowVisible(row);
}

export function renderCounter() {
  counterEl.innerHTML = `<span class="count">${state.found.length}</span> / ${WORDS_TO_WIN}`;
}

// --- Grille et tracé -------------------------------------------------------

export function updateSelection() {
  const last = state.path[state.path.length - 1];
  const inPath = new Set(state.path);
  // Pendant un tracé, le survol des autres cases est neutralisé (CSS).
  gridEl.classList.toggle("tracing", state.path.length > 0);
  cells.forEach((cell, i) => {
    cell.classList.toggle("sel", inPath.has(i) && i !== last);
    cell.classList.toggle("head", i === last);
  });
}

/** @type {SVGElement[]} Polylines fantômes des mots trouvés. */
const ghostLines = [];

/** @param {number[]} path */
function tracePoints(path) {
  return path
    .map((i) => {
      const c = cells[i];
      return `${c.offsetLeft + c.offsetWidth / 2},${c.offsetTop + c.offsetHeight / 2}`;
    })
    .join(" ");
}

function traceWidth() {
  return cells[0].offsetWidth >= 80 ? "6" : "5";
}

// Tracés fantômes : le trait d'un mot validé reste affiché,
// dans les tons des cases désactivées, pour relire les mots sur la grille.
export function renderFoundTraces() {
  while (ghostLines.length > state.foundPaths.length) {
    const line = ghostLines.pop();
    if (line) line.remove();
  }
  while (ghostLines.length < state.foundPaths.length) {
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    );
    line.setAttribute("class", "trace-ghost");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke-linecap", "butt");
    line.setAttribute("stroke-linejoin", "miter");
    traceEl.insertBefore(line, traceLineEl); // sous le tracé actif
    ghostLines.push(line);
  }
  ghostLines.forEach((line, i) => {
    line.setAttribute("points", tracePoints(state.foundPaths[i]));
    line.setAttribute("stroke-width", traceWidth());
  });
}

// Barres du tracé : polyline recalculée depuis la géométrie réelle des cases.
export function updateTrace() {
  traceEl.setAttribute(
    "viewBox",
    `0 0 ${gridEl.clientWidth} ${gridEl.clientHeight}`,
  );
  // Les fantômes suivent la même géométrie (utile au resize).
  renderFoundTraces();
  if (state.path.length < 2) {
    traceLineEl.setAttribute("points", "");
    return;
  }
  traceLineEl.setAttribute("points", tracePoints(state.path));
  traceLineEl.setAttribute("stroke-width", traceWidth());
}

// Les cases consommées par un mot trouvé sortent du jeu.
export function renderUsedCells() {
  cells.forEach((cell, i) => {
    cell.classList.toggle("disabled", state.usedCells.has(i));
  });
}

function shakeGrid() {
  gridEl.classList.remove("shake");
  // Force le redémarrage de l'animation si un shake est déjà en cours.
  void gridEl.offsetWidth;
  gridEl.classList.add("shake");
}

// Flash rouge des cases d'un tracé refusé (accompagne le shake).
/** @param {number[]} indices */
export function flashPath(indices) {
  for (const i of indices) {
    const cell = cells[i];
    cell.classList.remove("flash");
    void cell.offsetWidth;
    cell.classList.add("flash");
  }
}

// Retour haptique discret (mobile) quand une lettre rejoint le tracé.
export function buzz() {
  if (navigator.vibrate) navigator.vibrate(8);
}

// Survol d'un mot du panneau debug : reproduit l'apparence du :hover sur
// les cases de son tracé (classe .debug-hint).
/** @param {number[]|null} path */
export function setDebugHint(path) {
  const inPath = path ? new Set(path) : null;
  cells.forEach((cell, i) => {
    cell.classList.toggle("debug-hint", inPath !== null && inPath.has(i));
  });
}

// --- Chrono ------------------------------------------------------------

export function startTimer() {
  stopTimer();
  state.startTime = Date.now();
  chronoEl.textContent = "00:00";
  state.timerId = setInterval(() => {
    chronoEl.textContent = formatTime(Date.now() - state.startTime);
  }, 500);
}

export function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

// --- États de partie --------------------------------------------------------

// Remet le plateau à neuf pour la grille courante (state.letters) :
// impression des lettres en cascade, registre vidé, grille affichée.
export function renderNewGame() {
  if (state.rejectTimer !== null) {
    clearTimeout(state.rejectTimer);
    state.rejectTimer = null;
  }
  cells.forEach((cell, i) => {
    cell.textContent = state.letters[i];
    cell.classList.remove(
      "sel",
      "head",
      "flash",
      "deal",
      "debug-hint",
      "disabled",
    );
  });
  // Le reflow force le redémarrage de l'animation quand on rejoue.
  void gridEl.offsetWidth;
  cells.forEach((cell) => cell.classList.add("deal"));
  listRows.forEach(resetListRow);
  renderCounter();
  counterEl.classList.remove("full");
  chronoEl.classList.remove("won");
  renderRuleText(playingRuleText());
  winEl.hidden = true;
  gridEl.hidden = false;
  updateTrace();
}

export function renderWin() {
  const time = formatTime(Date.now() - state.startTime);
  chronoEl.textContent = `${time} ■`;
  chronoEl.classList.add("won");
  counterEl.classList.add("full");
  winSubEl.textContent = `${WORDS_TO_WIN} MOT${WORDS_TO_WIN > 1 ? "S" : ""} EN ${time}`;
  ruleTextEl.textContent =
    "Chrono arrêté - cette grille est résolue. Rejouer distribue de nouvelles lettres.";
  gridEl.hidden = true;
  winEl.hidden = false;
}

/** @param {string} message */
export function renderLoadError(message) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
}

export function hideStatus() {
  statusEl.hidden = true;
}
