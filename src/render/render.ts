// Chrome DOM en surimpression : registre repliable des mots trouvés,
// sélecteurs de mode et de difficulté, consigne, chrono, statut et victoire.
// La grille, le tracé et leurs animations sont rendus par PixiJS (render/scene.ts).

import {
  DIFFICULTY_LABELS,
  ENABLED_DIFFICULTIES,
  ENABLED_MODES,
  MODE_LABELS,
  REJECT_DISPLAY_MS,
  TOAST_MS,
} from "../game/config.ts";
import { state } from "../game/state.ts";
import { wordRejectReason } from "../game/rules.ts";

// Ligne vide du registre : un point par lettre attendue (mode actif).
function wordDots() {
  return Array.from({ length: state.mode.wordLength }, () => "·").join(" ");
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

export const replayEl = byId("replay");
const statusEl = byId("status");
const winEl = byId("win");
const winSubEl = byId("win-sub");
const winWordsEl = byId("win-words");
const chronoEl = byId("chrono");
const counterEl = byId("counter");
const wordListEl = byId("word-list");
const ruleSpecEl = byId("rule-spec");

const listRows: HTMLElement[] = []; // les wordCount lignes du registre

// --- Utilitaires --------------------------------------------------------

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// Bande « specs » du panneau règle : dimensions du puzzle, tirées du mode
// actif (mises en capitales par le CSS). La phrase serif au-dessus est
// générique (sans nombres) et vit dans le HTML.
function renderRuleSpec() {
  const { wordCount, wordLength } = state.mode;
  ruleSpecEl.textContent = `${wordCount} mots · ${wordLength} lettres`;
}

// --- Sélecteur de difficulté (chip + popover / feuille + toast) ------------

const difficultyNav = byId("difficulty-nav");
const diffChipEl = byId("diff-chip");
const diffChipLabelEl = byId("diff-chip-label");
const diffPanelEl = byId("diff-panel");
const diffListEl = byId("diff-list");
const diffOverlayEl = byId("diff-overlay");
const diffCloseEl = byId("diff-close");
const diffToastEl = byId("diff-toast");
const diffToastTitleEl = byId("diff-toast-title");
const diffToastSubEl = byId("diff-toast-sub");

/** Lignes du panneau, une par difficulté. */
const diffRows: HTMLButtonElement[] = [];
let diffToastTimer: ReturnType<typeof setTimeout> | null = null;

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

function setDifficultyPanelOpen(open: boolean) {
  // Les trois panneaux partagent le voile : jamais ouverts en même temps.
  if (open) {
    setRulePanelOpen(false);
    setModePanelOpen(false);
  }
  diffPanelEl.hidden = !open;
  diffOverlayEl.hidden = !open;
  diffChipEl.classList.toggle("open", open);
  diffChipEl.setAttribute("aria-expanded", String(open));
}

export function renderDifficultyBar() {
  // Une seule difficulté accessible : le sélecteur disparaît, le jeu se
  // présente sans notion de difficulté.
  difficultyNav.hidden = ENABLED_DIFFICULTIES.length <= 1;
  const label = DIFFICULTY_LABELS[state.difficulty];
  diffChipLabelEl.textContent = `${state.difficulty} · ${label.name}`;
  // La chip démarre en visibility:hidden (CSS) : dévoilée maintenant que
  // le niveau affiché est le vrai.
  difficultyNav.classList.add("ready");
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
  }, TOAST_MS);
}

export function bindDifficultyBar(onSelect: (difficulty: number) => void) {
  diffChipEl.addEventListener("click", () =>
    // hidden est typé string | boolean (« until-found ») mais on n'y écrit
    // que des booléens.
    setDifficultyPanelOpen(diffPanelEl.hidden as boolean),
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

// --- Sélecteur de mode (chip + popover / feuille + toast) -------------------

// Même composant que la difficulté : chip du header ouvrant une feuille de
// choix, toast de confirmation. Les classes CSS .diff-* sont réutilisées
// (comme le panneau règle) ; seules les lignes diffèrent (pas d'étoiles).
const modeNav = byId("mode-nav");
const modeChipEl = byId("mode-chip");
const modeChipLabelEl = byId("mode-chip-label");
const modePanelEl = byId("mode-panel");
const modeListEl = byId("mode-list");
const modeOverlayEl = byId("mode-overlay");
const modeCloseEl = byId("mode-close");
const modeToastEl = byId("mode-toast");
const modeToastTitleEl = byId("mode-toast-title");
const modeToastSubEl = byId("mode-toast-sub");

/** Lignes du panneau, une par mode. */
const modeRows: HTMLButtonElement[] = [];
let modeToastTimer: ReturnType<typeof setTimeout> | null = null;

// Lignes du panneau générées depuis MODE_LABELS : nom de la grille
// (largeur × hauteur), description du puzzle, coche sur le mode courant.
for (const [id, { name, desc }] of Object.entries(MODE_LABELS)) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "diff-level";
  row.dataset.mode = id;

  const bar = document.createElement("span");
  bar.className = "diff-level-bar";
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

  row.append(bar, text, check);
  modeListEl.appendChild(row);
  modeRows.push(row);
}

function setModePanelOpen(open: boolean) {
  // Les trois panneaux partagent le voile : jamais ouverts en même temps.
  if (open) {
    setDifficultyPanelOpen(false);
    setRulePanelOpen(false);
  }
  modePanelEl.hidden = !open;
  modeOverlayEl.hidden = !open;
  modeChipEl.classList.toggle("open", open);
  modeChipEl.setAttribute("aria-expanded", String(open));
}

export function renderModeBar() {
  // Un seul mode accessible : le sélecteur disparaît, le jeu se présente
  // sans notion de mode.
  modeNav.hidden = ENABLED_MODES.length <= 1;
  modeChipLabelEl.textContent = MODE_LABELS[state.modeId].name;
  // La chip démarre en visibility:hidden (CSS) : dévoilée maintenant que
  // le mode affiché est le vrai.
  modeNav.classList.add("ready");
  for (const row of modeRows) {
    const id = row.dataset.mode ?? "";
    row.classList.toggle("selected", id === state.modeId);
    row.disabled = !ENABLED_MODES.includes(id);
  }
}

// Confirmation d'un changement de mode : la feuille s'est refermée, le toast
// rappelle la grille choisie et qu'une partie est relancée.
export function showModeToast() {
  const label = MODE_LABELS[state.modeId];
  modeToastTitleEl.textContent = `Grille ${label.name}`;
  modeToastSubEl.textContent = `${label.desc} · Nouvelle grille`;
  modeToastEl.hidden = false;
  if (modeToastTimer !== null) clearTimeout(modeToastTimer);
  modeToastTimer = setTimeout(() => {
    modeToastTimer = null;
    modeToastEl.hidden = true;
  }, TOAST_MS);
}

export function bindModeBar(onSelect: (id: string) => void) {
  modeChipEl.addEventListener("click", () =>
    // hidden est typé string | boolean (« until-found ») mais on n'y écrit
    // que des booléens.
    setModePanelOpen(modePanelEl.hidden as boolean),
  );
  modeCloseEl.addEventListener("click", () => setModePanelOpen(false));
  modeOverlayEl.addEventListener("click", () => setModePanelOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modePanelEl.hidden) setModePanelOpen(false);
  });
  for (const row of modeRows) {
    row.addEventListener("click", () => {
      // Sélection = fermeture immédiate ; re-choisir le mode courant
      // referme simplement, sans relancer de grille.
      setModePanelOpen(false);
      const id = row.dataset.mode ?? "";
      if (id !== state.modeId) onSelect(id);
    });
  }
}

// --- Registre repliable ----------------------------------------------------

// Panneau flottant ancré à droite : ouvert par défaut sur desktop, replié en
// pastille (compteur n / N) sur mobile. Le bouton d'en-tête plie/déplie.
const ledgerEl = byId("ledger");
const ledgerToggleEl = byId("ledger-toggle");

function setLedgerCollapsed(collapsed: boolean) {
  ledgerEl.classList.toggle("collapsed", collapsed);
  ledgerToggleEl.setAttribute("aria-expanded", String(!collapsed));
}

ledgerToggleEl.addEventListener("click", () =>
  setLedgerCollapsed(!ledgerEl.classList.contains("collapsed")),
);
// État initial : replié sur mobile (pastille), déplié sur desktop.
setLedgerCollapsed(window.matchMedia("(max-width: 860px)").matches);

// --- Règle du jeu (bouton « ? » du header) ---------------------------------

// La règle n'est plus affichée en permanence : elle vit dans le même panneau
// que la difficulté, ouvert par le bouton « ? ». Comme la mécanique n'est pas
// devinable, on l'ouvre d'office à la toute première visite (et seulement
// celle-là) : le drapeau « vu » est mémorisé en localStorage.
const RULE_SEEN_KEY = "tracemot.rule-seen";
const ruleChipEl = byId("rule-chip");
const rulePanelEl = byId("rule-panel");
const ruleOverlayEl = byId("rule-overlay");
const ruleCloseEl = byId("rule-close");

function setRulePanelOpen(open: boolean) {
  // Les trois panneaux partagent le voile : jamais ouverts en même temps.
  if (open) {
    setDifficultyPanelOpen(false);
    setModePanelOpen(false);
  }
  rulePanelEl.hidden = !open;
  ruleOverlayEl.hidden = !open;
  ruleChipEl.classList.toggle("open", open);
  ruleChipEl.setAttribute("aria-expanded", String(open));
}

// hidden est typé string | boolean (« until-found ») mais on n'y écrit que
// des booléens.
ruleChipEl.addEventListener("click", () =>
  setRulePanelOpen(rulePanelEl.hidden as boolean),
);
ruleCloseEl.addEventListener("click", () => setRulePanelOpen(false));
ruleOverlayEl.addEventListener("click", () => setRulePanelOpen(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !rulePanelEl.hidden) setRulePanelOpen(false);
});

// Appelée une fois la partie prête (main.ts) : avant, l'overlay de statut
// (« chargement du dictionnaire ») couvrirait le panneau.
export function showRuleOnFirstVisit() {
  let seen = null;
  try {
    seen = localStorage.getItem(RULE_SEEN_KEY);
  } catch (_) {
    /* stockage indisponible */
  }
  if (seen) return;
  setRulePanelOpen(true);
  try {
    localStorage.setItem(RULE_SEEN_KEY, "1");
  } catch (_) {
    /* stockage indisponible : la règle se rouvrira au prochain chargement */
  }
}

// --- Registre : adoption des lignes pré-rendues ----------------------------

export function buildBoard() {
  // Les lignes du registre sont pré-rendues dans le HTML (anti-shift au
  // chargement, calées sur le mode par défaut) : on les adopte, et on
  // ajuste leur nombre au mode actif. Rappelée au changement de mode :
  // listRows est reconstruit de zéro (les lignes adoptées restent valides).
  const { wordCount } = state.mode;
  listRows.length = 0;
  while (wordListEl.children.length > wordCount) {
    wordListEl.lastElementChild?.remove();
  }
  for (let i = 0; i < wordCount; i++) {
    const existing = wordListEl.children[i] as HTMLElement | undefined;
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
    content.textContent = wordDots();
    li.append(num, content);
    wordListEl.appendChild(li);
    listRows.push(li);
  }
}

// --- Registre des mots ----------------------------------------------------

// Sur mobile la liste est compressée et scrolle : on garde la ligne active
// en vue. Sans effet quand la liste tient en entier (desktop).
function keepRowVisible(row: HTMLElement) {
  if (wordListEl.scrollHeight > wordListEl.clientHeight) {
    row.scrollIntoView({ block: "nearest" });
  }
}

function resetListRow(row: HTMLElement) {
  row.className = "word-row empty";
  const content = row.children[1];
  content.className = "word-dots";
  content.textContent = wordDots();
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
export function showReject(word: string, reason: string) {
  const row = listRows[state.found.length];
  if (!row) return;
  // Le flash et la secousse de la grille sont rendus par render/scene.ts (Pixi).
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

export function fillListRow(index: number, word: string, animate: boolean) {
  const row = listRows[index];
  row.className = "word-row";
  const content = row.children[1];
  content.className = animate ? "word-text stamp" : "word-text";
  content.textContent = word;
  keepRowVisible(row);
}

export function renderCounter() {
  counterEl.innerHTML = `<span class="count">${state.found.length}</span> / ${state.mode.wordCount}`;
}

// --- Grille (feedbacks portés en Pixi) -------------------------------------
// La sélection, le tracé, les fantômes, les cases consommées et les feedbacks
// (deal, pop, flash, shake, stamp) sont désormais rendus par render/scene.ts.

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
// Pixi est réaffichée par render/scene.ts (renderSceneGrid).
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
  winWordsEl.replaceChildren();
}

// Délai d'apparition du premier mot de la liste de victoire (durée du pop
// de l'overlay, voir win-pop dans style.css), puis cascade mot à mot.
const WIN_WORD_BASE_DELAY_MS = 450;
const WIN_WORD_STAGGER_MS = 40;

export function renderWin() {
  const time = formatTime(Date.now() - state.startTime);
  chronoEl.textContent = `${time} ■`;
  chronoEl.classList.add("won");
  counterEl.classList.add("full");
  const { wordCount } = state.mode;
  winSubEl.textContent = `${wordCount} MOT${wordCount > 1 ? "S" : ""} EN ${time}`;
  // Liste des mots trouvés (ordre de découverte), chacun lié à sa définition.
  // Les mots de la grille sont sans accents : le lien est approximatif pour
  // les mots accentués (assumé, voir portail-lexical).
  winWordsEl.replaceChildren();
  winEl.style.setProperty("--win-cols", wordCount > 8 ? "2" : "1");
  state.found.forEach((word, i) => {
    const li = document.createElement("li");
    li.className = "win-word";
    li.style.animationDelay = `${WIN_WORD_BASE_DELAY_MS + i * WIN_WORD_STAGGER_MS}ms`;
    const link = document.createElement("a");
    link.href = `https://www.portail-lexical.fr/definition/${word.toLowerCase()}`;
    link.target = "_blank";
    link.rel = "noopener";
    const num = document.createElement("span");
    num.className = "win-word-num";
    num.textContent = String(i + 1).padStart(2, "0");
    const text = document.createElement("span");
    text.className = "win-word-text";
    text.textContent = word;
    const ext = document.createElement("span");
    ext.className = "win-word-ext";
    ext.textContent = "↗";
    link.append(num, text, ext);
    li.appendChild(link);
    winWordsEl.appendChild(li);
  });
  winEl.hidden = false;
}

export function renderLoadError(message: string) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
}

export function hideStatus() {
  statusEl.hidden = true;
}
