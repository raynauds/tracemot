// Chrome DOM en surimpression : header de partie (chrono, niveau, retour
// carte), registre repliable des mots trouvés, consigne, statut et victoire.
// La grille, le tracé et leurs animations sont rendus par PixiJS
// (render/scene.ts) ; la carte de progression par render/map.ts.
//
// Ce module ne connaît que la PARTIE : le choix du niveau appartient à la
// carte, il n'y a donc plus ici ni sélecteur de mode ni sélecteur de
// difficulté (la difficulté est une propriété de la section).

import { REJECT_DISPLAY_MS } from "../game/config.ts";
import { isDefi, levelLabel, type LevelId } from "../game/levels.ts";
import { MAX_STARS, type NextChoice } from "../game/progress.ts";
import { state } from "../game/state.ts";
import { wordRejectReason } from "../game/rules.ts";
import { starIcon } from "./icons.ts";

// Ligne vide du registre : un point par lettre attendue (mode actif).
function wordDots() {
  return Array.from({ length: state.mode.wordLength }, () => "·").join(" ");
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const statusEl = byId("status");
const winEl = byId("win");
const winSubEl = byId("win-sub");
const winStarEl = byId("win-star");
const winStarGainEl = byId("win-star-gain");
const winStarUnlockEl = byId("win-star-unlock");
const winNextEl = byId("win-next");
const winDefiEl = byId("win-defi");
const winMapEl = byId("win-map");
const backMapEl = byId("back-map");
const chronoEl = byId("chrono");
const levelIdEl = byId("level-id");
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

// --- Header de partie -------------------------------------------------------

// Identité du niveau en cours (« 5×5 · 1-12 ») : le seul repère du joueur une
// fois la carte masquée.
export function renderLevelHeader() {
  levelIdEl.textContent = state.levelId
    ? levelLabel(state.modeId, state.levelId)
    : "";
}

// Retour à la carte : même action depuis le header et depuis l'écran de
// victoire (où elle est l'action principale).
export function bindMapReturn(onReturn: () => void) {
  backMapEl.addEventListener("click", onReturn);
  winMapEl.addEventListener("click", onReturn);
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

// La règle vit dans un panneau ouvert par le bouton « ? ». Comme la mécanique
// n'est pas devinable, on l'ouvre d'office au tout premier niveau lancé (et
// seulement celui-là) : le drapeau « vu » est mémorisé en localStorage.
const RULE_SEEN_KEY = "tracemot.rule-seen";
const ruleChipEl = byId("rule-chip");
const rulePanelEl = byId("rule-panel");
const ruleOverlayEl = byId("rule-overlay");
const ruleCloseEl = byId("rule-close");

function setRulePanelOpen(open: boolean) {
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

// Appelée au premier niveau lancé (main.ts) : avant, la carte couvrirait le
// panneau.
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
  // chargement, calées sur le mode par défaut) : on les adopte, et on ajuste
  // leur nombre au niveau actif. Rappelée à chaque niveau : le nombre de mots
  // varie du simple au quadruple (un défi du 8×8 en demande 32 quand le HTML
  // n'en pré-rend que 5 — les 27 manquantes sont créées ici), et listRows est
  // reconstruit de zéro (les lignes adoptées restent valides).
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

// Remet le chrome à neuf pour un nouveau niveau : registre vidé, compteur
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
  hideWin();
}

// --- Suites proposées à la victoire -----------------------------------------

// Les deux boutons de tête sont des SLOTS : ce qu'ils lancent change à chaque
// victoire (nextChoices, cf. game/progress.ts). L'identifiant visé est gardé
// ici plutôt que sur le DOM — le clic n'a rien à re-parser, et un bouton masqué
// ne peut pas relancer la partie précédente puisqu'on l'oublie à chaque rendu.
let winTargets: (LevelId | null)[] = [null, null];
let onPlayLevel: ((id: LevelId) => void) | null = null;

// Libellé d'un bouton : l'identifiant seul suffit (« 1-6 »), la forme du mode
// est déjà dans le header. Un défi s'annonce toujours comme tel, étoile comprise
// — c'est ce qu'il rapporte —, qu'il vienne d'être ouvert ou qu'on y retombe par
// le repli « continuer » (l'ordre canonique le place avant la ligne suivante).
function fillChoice(el: HTMLElement, choice: NextChoice): void {
  if (isDefi(choice.id)) {
    el.append(`DÉFI ${choice.id}`, starIcon());
    return;
  }
  const verb = choice.kind === "next" ? "SUIVANT" : "CONTINUER";
  el.append(`${verb} · ${choice.id}`);
}

export function bindWinNext(onPlay: (id: LevelId) => void) {
  onPlayLevel = onPlay;
  [winNextEl, winDefiEl].forEach((el, slot) => {
    el.addEventListener("click", () => {
      const id = winTargets[slot];
      if (id && onPlayLevel) onPlayLevel(id);
    });
  });
}

function renderWinActions(choices: NextChoice[]) {
  // Le défi, quand il y est, est la SECONDE proposition : après une victoire on
  // enchaîne sur la grille de même taille, la grille doublée reste un choix.
  // nextChoices() les rend déjà dans cet ordre (normal puis défi).
  [winNextEl, winDefiEl].forEach((el, slot) => {
    const choice = choices[slot];
    winTargets[slot] = choice ? choice.id : null;
    el.hidden = !choice;
    el.textContent = "";
    if (choice) fillChoice(el, choice);
  });
}

// star : passé par main.ts au seul cas qui vaut une récompense — un défi gagné
// pour la première fois. Le rejeu d'un défi et les niveaux normaux laissent
// l'écran de victoire inchangé, sans quoi l'étoile ne voudrait plus rien dire.
// choices : ce que la victoire vient d'ouvrir (0 à 2 niveaux).
export function renderWin(opts: {
  star?: { count: number; unlocked: string | null };
  choices?: NextChoice[];
} = {}) {
  const { star, choices = [] } = opts;
  const time = formatTime(Date.now() - state.startTime);
  chronoEl.textContent = `${time} ■`;
  chronoEl.classList.add("won");
  counterEl.classList.add("full");
  const { wordCount } = state.mode;
  winSubEl.textContent = `${wordCount} MOT${wordCount > 1 ? "S" : ""} EN ${time}`;
  winStarEl.hidden = !star;
  if (star) {
    winStarGainEl.textContent = "";
    winStarGainEl.append(
      starIcon(),
      `Étoile gagnée — ${star.count} / ${MAX_STARS}`,
    );
    // Les étoiles au-delà des paliers ne débloquent rien : elles ne comptent
    // que pour la complétion du mode, on n'annonce donc que le gain.
    winStarUnlockEl.hidden = star.unlocked === null;
    winStarUnlockEl.textContent = star.unlocked
      ? `Débloque : ${star.unlocked}`
      : "";
  }
  renderWinActions(choices);
  winEl.hidden = false;
}

// Le retour à la carte et l'enchaînement quittent tous deux l'écran de victoire.
export function hideWin() {
  winEl.hidden = true;
}

// Échec de chargement d'un niveau. L'overlay est opaque et couvre la carte
// (z-index 50) : sans quoi le retour à la carte, qui suit immédiatement, le
// masquerait. Il est donc refermable d'un clic — sinon le joueur y resterait
// enfermé, alors que l'échec est rattrapable (autre niveau, autre mode).
export function renderLoadError(message: string) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.addEventListener("click", hideStatus, { once: true });
}

export function hideStatus() {
  statusEl.hidden = true;
}
