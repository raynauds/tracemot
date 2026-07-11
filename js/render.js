// @ts-check
// Chrome DOM en surimpression : registre repliable des mots trouvés,
// sélecteur de difficulté, consigne, chrono, statut et victoire. La grille,
// le tracé et leurs animations sont rendus par PixiJS (js/scene.js).

import {
  DIFFICULTY_LABELS,
  DIFFICULTY_TOAST_MS,
  ENABLED_DIFFICULTIES,
  FIVE_WORD_LENGTH,
  FR_NUMBERS,
  REJECT_DISPLAY_MS,
  WORDS_TO_WIN,
} from "./config.js";
import { state } from "./state.js";
import { wordRejectReason } from "./rules.js";

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

export const replayEl = byId("replay");
const statusEl = byId("status");
const winEl = byId("win");
const winSubEl = byId("win-sub");
const chronoEl = byId("chrono");
const counterEl = byId("counter");
const wordListEl = byId("word-list");
const ruleSpecEl = byId("rule-spec");

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

// Bande « specs » de la règle : dimensions du puzzle en toutes lettres, tirées
// de la config (mises en capitales par le CSS). La phrase serif au-dessus est
// générique (sans nombres) et vit dans le HTML.
function renderRuleSpec() {
  const l5 = FR_NUMBERS[FIVE_WORD_LENGTH] || String(FIVE_WORD_LENGTH);
  ruleSpecEl.textContent =
    `${WORDS_TO_WIN} mots · ${l5} lettres · toute la grille`;
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
  diffToastTitleEl.textContent = `Niveau ${state.difficulty} — ${label.name}`;
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
    if (e.key === "Escape" && !diffPanelEl.hidden) setDifficultyPanelOpen(false);
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

// --- Registre repliable ----------------------------------------------------

// Panneau flottant ancré à droite : ouvert par défaut sur desktop, replié en
// pastille (compteur n / N) sur mobile. Le bouton d'en-tête plie/déplie.
const ledgerEl = byId("ledger");
const ledgerToggleEl = byId("ledger-toggle");

/** @param {boolean} collapsed */
function setLedgerCollapsed(collapsed) {
  ledgerEl.classList.toggle("collapsed", collapsed);
  ledgerToggleEl.setAttribute("aria-expanded", String(!collapsed));
}

ledgerToggleEl.addEventListener("click", () =>
  setLedgerCollapsed(!ledgerEl.classList.contains("collapsed")),
);
// État initial : replié sur mobile (pastille), déplié sur desktop.
setLedgerCollapsed(window.matchMedia("(max-width: 860px)").matches);

// --- Règle du jeu (colophon repliable) -------------------------------------

// Ouverte par défaut ; l'utilisateur peut la minimiser en chip. Le choix
// persiste : au retour on rouvre, sauf s'il avait minimisé (localStorage).
const RULE_STORAGE_KEY = "tracemot.rule";
const ruleEl = byId("rulecard");
const ruleToggleEl = byId("rule-toggle");

/** @param {boolean} collapsed */
function setRuleCollapsed(collapsed) {
  ruleEl.classList.toggle("collapsed", collapsed);
  ruleToggleEl.setAttribute("aria-expanded", String(!collapsed));
}

ruleToggleEl.addEventListener("click", () => {
  const collapsed = !ruleEl.classList.contains("collapsed");
  setRuleCollapsed(collapsed);
  try {
    localStorage.setItem(RULE_STORAGE_KEY, collapsed ? "collapsed" : "open");
  } catch (_) {
    /* stockage indisponible : le choix ne survivra pas au rechargement */
  }
});

// État initial : minimisé seulement si l'utilisateur l'avait choisi.
let ruleStored = null;
try {
  ruleStored = localStorage.getItem(RULE_STORAGE_KEY);
} catch (_) {
  /* stockage indisponible */
}
setRuleCollapsed(ruleStored === "collapsed");

// --- Registre : adoption des lignes pré-rendues ----------------------------

export function buildBoard() {
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
  // Le flash et la secousse de la grille sont rendus par js/scene.js (Pixi).
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

// --- Grille (feedbacks portés en Pixi) -------------------------------------
// La sélection, le tracé, les fantômes, les cases consommées et les feedbacks
// (deal, pop, flash, shake, stamp) sont désormais rendus par js/scene.js.

// Retour haptique discret (mobile) quand une lettre rejoint le tracé.
export function buzz() {
  if (navigator.vibrate) navigator.vibrate(8);
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

// Remet le chrome à neuf pour une nouvelle partie : registre vidé, compteur
// et chrono réinitialisés, consigne rétablie, victoire masquée. La grille
// Pixi est réaffichée par js/scene.js (renderSceneGrid).
export function renderNewGame() {
  if (state.rejectTimer !== null) {
    clearTimeout(state.rejectTimer);
    state.rejectTimer = null;
  }
  listRows.forEach(resetListRow);
  renderCounter();
  counterEl.classList.remove("full");
  chronoEl.classList.remove("won");
  renderRuleSpec();
  winEl.hidden = true;
}

export function renderWin() {
  const time = formatTime(Date.now() - state.startTime);
  chronoEl.textContent = `${time} ■`;
  chronoEl.classList.add("won");
  counterEl.classList.add("full");
  winSubEl.textContent = `${WORDS_TO_WIN} MOT${WORDS_TO_WIN > 1 ? "S" : ""} EN ${time}`;
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
