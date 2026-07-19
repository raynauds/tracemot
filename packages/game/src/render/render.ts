// Chrome DOM en surimpression : header de partie (niveau, retour carte),
// registre repliable des mots trouvés, consigne et victoire.
// La grille, le tracé et leurs animations sont rendus par PixiJS
// (render/scene.ts) ; la carte de progression par render/map.ts.
//
// Ce module ne connaît que la PARTIE : le choix du niveau appartient à la
// carte, il n'y a donc plus ici ni sélecteur de mode ni sélecteur de
// difficulté (la difficulté est une propriété de la section).

import { playSound } from "../audio/audio.ts";
import { REJECT_DISPLAY_MS, WORD_STAMP_MS } from "../game/config.ts";
import { isDefi, levelLabel, type LevelId } from "@tracemot/core";
import { MAX_STARS, type NextChoice } from "../game/progress.ts";
import { local, wordCheckContext } from "../client/local-state.ts";
import type { FoundWord, PlayerId, WinSummary } from "../logic/types.ts";
import { wordRejectReason, type WordRejectCode } from "../game/rules.ts";
import { showHelp } from "./help.ts";
import { countParam } from "./i18n.ts";
import {
  arrowLeftIcon,
  chevronIcon,
  closeIcon,
  infoIcon,
  starIcon,
} from "./icons.ts";

// Ligne vide du registre : un point par lettre attendue (mode actif).
function wordDots() {
  return Array.from({ length: local.mode.wordLength }, () => "·").join(" ");
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const winEl = byId("win");
const winTitleTextEl = byId("win-title-text");
const winSubEl = byId("win-sub");
const winStandingsEl = byId("win-standings");
const winStarEl = byId("win-star");
const winStarGainEl = byId("win-star-gain");
const winStarUnlockEl = byId("win-star-unlock");
const winNextEl = byId("win-next");
const winDefiEl = byId("win-defi");
const winMapEl = byId("win-map");
const backMapEl = byId("back-map");
const levelIdEl = byId("level-id");
const counterEl = byId("counter");
const wordListEl = byId("word-list");
const ruleSpecEl = byId("rule-spec");
const ledgerLabelEl = byId("ledger-label");
const rulePanelTitleEl = byId("rule-panel-title");
const rulePanelLineEl = byId("rule-panel-line");

// --- Textes statiques (doc 08 § i18n) ---------------------------------------
// Posés une fois au chargement, comme les icônes ci-dessous : ce module ne
// re-rend jamais ces libellés hors mise à jour de données (contrairement à
// help.ts, dont les textes sont recalculés à chaque ouverture) — limite
// assumée pour ce premier passage i18n (doc 08, v1 recommandée).
backMapEl.setAttribute("aria-label", Rune.t("Retour à la carte"));
backMapEl.title = Rune.t("Retour à la carte");
ledgerLabelEl.textContent = Rune.t("MOTS TROUVÉS");
winTitleTextEl.textContent = Rune.t("Gagné");
winMapEl.textContent = Rune.t("RETOUR À LA CARTE");

const listRows: HTMLElement[] = []; // les wordCount lignes du registre

// --- Utilitaires --------------------------------------------------------

// Bande « specs » du panneau règle : dimensions du puzzle, tirées du mode
// actif (mises en capitales par le CSS). La phrase serif au-dessus est
// générique (sans nombres) et vit dans le HTML.
function renderRuleSpec() {
  const { wordCount, wordLength } = local.mode;
  ruleSpecEl.textContent = Rune.t("{{count}} mots · {{length}} lettres", {
    count: countParam(wordCount),
    length: String(wordLength),
  });
}

// --- Header de partie -------------------------------------------------------

// Deux boutons muets dans le HTML (leur sens tient dans l'aria-label) : la
// flèche du retour et le « i » de la règle sont des icônes, elles viennent
// d'ici (cf. ./icons.ts).
backMapEl.appendChild(arrowLeftIcon());

// Identité du niveau en cours (« 5×5 · 1-12 ») : le seul repère du joueur une
// fois la carte masquée.
export function renderLevelHeader() {
  levelIdEl.textContent = local.levelId
    ? levelLabel(local.modeId, local.levelId)
    : "";
}

// Retour à la carte : DEUX sorties distinctes depuis Rune (doc 02 § Machine de
// phase), qui ne se confondent plus comme avant le portage.
//   - La flèche du header (mi-partie, pas gagné) quitte une partie EN COURS
//     pour les autres aussi : c'est une proposition d'abandon, soumise au même
//     vote qu'un niveau (doc 02/04) — `onAbandon` dispatche l'action logic.
//   - Le bouton de l'écran de victoire (et Échap pendant qu'il est affiché)
//     ferme un overlay purement LOCAL : la partie reste en place pour la room
//     tant qu'aucune proposition n'est acceptée (« Après victoire, le retour
//     carte est local », doc 02) — `onCloseWin` ne dispatche rien.
export function bindMapReturn(handlers: {
  onAbandon: () => void;
  onCloseWin: () => void;
}) {
  backMapEl.addEventListener("click", () => {
    playSound("ui-close");
    handlers.onAbandon();
  });
  const closeWin = () => {
    playSound("ui-close");
    handlers.onCloseWin();
  };
  winMapEl.addEventListener("click", closeWin);
  // Écran de victoire : seul overlay sans handler clavier propre (aide, carte,
  // panneau règle en ont tous un) — Échap fait ce que fait le bouton « retour
  // à la carte », rien de plus (pas d'historique navigateur, doc 08 § Q22).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !winEl.hidden) closeWin();
  });
}

// --- Registre repliable ----------------------------------------------------

// Panneau flottant ancré à droite : ouvert par défaut sur desktop, replié en
// pastille (compteur n / N) sur mobile. Le bouton d'en-tête plie/déplie.
const ledgerEl = byId("ledger");
const ledgerToggleEl = byId("ledger-toggle");

// Le chevron du repli : posé une fois ici, orienté par le CSS selon l'état.
byId("ledger-caret").appendChild(chevronIcon());

function setLedgerCollapsed(collapsed: boolean) {
  ledgerEl.classList.toggle("collapsed", collapsed);
  ledgerToggleEl.setAttribute("aria-expanded", String(!collapsed));
}

ledgerToggleEl.addEventListener("click", () => {
  playSound("ui-secondary");
  setLedgerCollapsed(!ledgerEl.classList.contains("collapsed"));
});
// État initial : replié sur mobile (pastille), déplié sur desktop.
setLedgerCollapsed(window.matchMedia("(max-width: 860px)").matches);

// --- Règle du jeu (bouton « info » du header) ------------------------------

// La règle vit dans un panneau ouvert par le bouton « info » — sur demande
// seulement : l'accueil appartient à l'écran « Comment jouer »
// (src/render/help.ts), qui s'ouvre d'office au tout premier lancement du jeu
// (persisted.helpSeen, doc 02/08 — plus de drapeau localStorage).
const ruleChipEl = byId("rule-chip");
ruleChipEl.appendChild(infoIcon());
ruleChipEl.setAttribute("aria-label", Rune.t("Règle du jeu"));
ruleChipEl.title = Rune.t("Règle du jeu");
const rulePanelEl = byId("rule-panel");
rulePanelEl.setAttribute("aria-label", Rune.t("Règle du jeu"));
rulePanelTitleEl.textContent = Rune.t("RÈGLE");
rulePanelLineEl.textContent = Rune.t(
  "Reliez des lettres voisines pour tracer les mots. Chaque lettre ne sert qu'une fois.",
);
const ruleOverlayEl = byId("rule-overlay");
const ruleCloseEl = byId("rule-close");
ruleCloseEl.appendChild(closeIcon());
ruleCloseEl.setAttribute("aria-label", Rune.t("Fermer"));
const ruleHelpLinkEl = byId("rule-help-link");
ruleHelpLinkEl.textContent = Rune.t("COMMENT JOUER");

function setRulePanelOpen(open: boolean) {
  rulePanelEl.hidden = !open;
  ruleOverlayEl.hidden = !open;
  ruleChipEl.classList.toggle("open", open);
  ruleChipEl.setAttribute("aria-expanded", String(open));
}

// hidden est typé string | boolean (« until-found ») mais on n'y écrit que
// des booléens.
ruleChipEl.addEventListener("click", () => {
  playSound(rulePanelEl.hidden ? "ui-secondary" : "ui-close");
  setRulePanelOpen(rulePanelEl.hidden as boolean);
});
ruleCloseEl.addEventListener("click", () => {
  playSound("ui-close");
  setRulePanelOpen(false);
});
ruleOverlayEl.addEventListener("click", () => {
  playSound("ui-close");
  setRulePanelOpen(false);
});
// Le panneau ne montre qu'un résumé (rule-spec) ; ce lien mène au tutoriel
// entier sans repasser par l'accueil — sinon le revoir en partie coûte deux
// sorties d'écran (retour carte, puis retour accueil).
ruleHelpLinkEl.addEventListener("click", () => {
  playSound("ui-secondary");
  setRulePanelOpen(false);
  showHelp();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !rulePanelEl.hidden) {
    playSound("ui-close");
    setRulePanelOpen(false);
  }
});

// --- Registre : adoption des lignes pré-rendues ----------------------------

export function buildBoard() {
  // Les lignes du registre sont pré-rendues dans le HTML (anti-shift au
  // chargement, calées sur le mode par défaut) : on les adopte, et on ajuste
  // leur nombre au niveau actif. Rappelée à chaque niveau : le nombre de mots
  // varie du simple au quadruple (un défi du 8×8 en demande 32 quand le HTML
  // n'en pré-rend que 5 — les 27 manquantes sont créées ici), et listRows est
  // reconstruit de zéro (les lignes adoptées restent valides).
  const { wordCount } = local.mode;
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

// Pastille avatar d'un mot trouvé par un AUTRE joueur (doc 05/06) : un enfant
// de plus dans la ligne, jamais aux index 0/1 (num/contenu) qui restent
// adressés par index ailleurs dans ce fichier — toujours retirée avant d'en
// reposer une, pour ne jamais en laisser une périmée sur une ligne réutilisée.
function clearRowAvatar(row: HTMLElement) {
  row.querySelector(".word-avatar")?.remove();
}

function resetListRow(row: HTMLElement) {
  row.className = "word-row empty";
  const content = row.children[1];
  content.className = "word-dots";
  content.textContent = wordDots();
  const reason = row.querySelector(".word-reason");
  if (reason) reason.remove();
  clearRowAvatar(row);
}

// Aperçu du tracé en cours dans la première ligne libre du registre :
// les lettres s'affichent en terne tant que le mot n'est pas validé.
export function renderPendingWord() {
  const row = listRows[local.found.length];
  if (!row) return;
  if (local.rejectTimer !== null) {
    clearTimeout(local.rejectTimer);
    local.rejectTimer = null;
  }
  resetListRow(row);
  if (local.path.length === 0) return;
  row.className = "word-row pending";
  const content = row.children[1];
  const word = local.path.map((i) => local.letters[i]).join("");
  // Hint discret : l'encre se densifie dès que le tracé forme un mot
  // acceptable.
  const isWord = wordRejectReason(word, wordCheckContext()) === null;
  content.className = isWord ? "word-text pending valid" : "word-text pending";
  content.textContent = word;
  keepRowVisible(row);
}

// Libellé français d'un code de refus (game/rules.ts, désormais pur et
// dépourvu de toute chaîne affichable — doc 01 § mise en conformité #5).
// Casse normale, pas de majuscules : ce sont des messages, pas des labels —
// la règle du projet réserve les majuscules aux labels, boutons et états
// (DESIGN.md).
export function rejectLabel(code: WordRejectCode): string {
  switch (code) {
    case "length":
      return Rune.t("{{count}} lettres requises", {
        count: countParam(local.mode.wordLength),
      });
    case "notInSolution":
      return Rune.t("Incorrecte");
    case "alreadyFound":
      return Rune.t("Déjà trouvé");
  }
}

// Mot refusé : lettres en rouge, motif du refus à droite, puis la ligne
// redevient libre une fois le message lu.
export function showReject(word: string, reason: string) {
  const row = listRows[local.found.length];
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
  local.rejectTimer = setTimeout(() => {
    local.rejectTimer = null;
    resetListRow(row);
  }, REJECT_DISPLAY_MS);
}

// `stamp` marque l'instant où le mot est trouvé, pas l'état de la ligne : on la
// retire une fois l'animation passée. Laissée en place, elle rejouerait le
// tampon à chaque fois que la ligne réapparaît — le registre replié met sa
// liste en display:none, et la rouvrir recrée la boîte, ce qui relance toute
// animation encore attachée.
//
// Timer plutôt qu'`animationend` : si le registre est replié au moment de la
// validation, l'animation ne se joue jamais et l'événement ne part pas — la
// classe survivrait justement dans le cas qu'on veut couvrir.
export function fillListRow(index: number, entry: FoundWord, animate: boolean) {
  const row = listRows[index];
  row.className = "word-row";
  const content = row.children[1];
  content.className = animate ? "word-text stamp" : "word-text";
  content.textContent = entry.word;
  clearRowAvatar(row);
  // Mes mots restent vermillon, sans pastille (doc 05/06 § Q18b) ; ceux d'un
  // autre joueur teintent le numéro (.word-num, ledger.css § owner-N) et
  // affichent son avatar Rune.
  if (entry.by !== local.yourPlayerId) {
    const slot = local.colorSlots[entry.by];
    if (slot !== undefined) row.classList.add(`owner-${slot}`);
    const avatar = document.createElement("img");
    avatar.className = "word-avatar";
    avatar.src = Rune.getPlayerInfo(entry.by).avatarUrl;
    avatar.alt = "";
    row.appendChild(avatar);
  }
  if (animate) {
    setTimeout(() => content.classList.remove("stamp"), WORD_STAMP_MS);
  }
  keepRowVisible(row);
}

export function renderCounter() {
  counterEl.innerHTML = `<span class="count">${local.found.length}</span> / ${local.mode.wordCount}`;
}

// --- Grille (feedbacks portés en Pixi) -------------------------------------
// La sélection, le tracé, les fantômes, les cases consommées et les feedbacks
// (deal, pop, flash, shake, stamp) sont désormais rendus par render/scene.ts.

// Retour haptique discret (mobile) quand une lettre rejoint le tracé.
export function buzz() {
  if (navigator.vibrate) navigator.vibrate(8);
}

// --- États de partie --------------------------------------------------------

// Remet le chrome à neuf pour un nouveau niveau : registre vidé, compteur
// réinitialisé, consigne rétablie, victoire masquée. La grille Pixi est
// réaffichée par render/scene.ts (renderSceneGrid).
export function renderNewGame() {
  if (local.rejectTimer !== null) {
    clearTimeout(local.rejectTimer);
    local.rejectTimer = null;
  }
  listRows.forEach(resetListRow);
  renderCounter();
  counterEl.classList.remove("full");
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
    el.append(Rune.t("DÉFI {{id}}", { id: choice.id }), starIcon());
    return;
  }
  const label =
    choice.kind === "next"
      ? Rune.t("SUIVANT · {{id}}", { id: choice.id })
      : Rune.t("CONTINUER · {{id}}", { id: choice.id });
  el.append(label);
}

export function bindWinNext(onPlay: (id: LevelId) => void) {
  onPlayLevel = onPlay;
  [winNextEl, winDefiEl].forEach((el, slot) => {
    el.addEventListener("click", () => {
      const id = winTargets[slot];
      if (id && onPlayLevel) {
        playSound("ui-primary");
        onPlayLevel(id);
      }
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

// --- Classement (doc 07) ----------------------------------------------------

// Circulaire jusqu'à 4 (maxPlayers de la room, logic/logic.ts) : jamais besoin
// d'un repli au-delà.
const RANK_GLYPHS = ["①", "②", "③", "④"];

function rankGlyph(rank: number): string {
  return RANK_GLYPHS[rank - 1] ?? `${rank}.`;
}

// « 1 mot » (singulier), « 0 mot »/« 3 mots » sinon — la légende de la spec
// (doc 07) ne met le pluriel qu'à partir de 2.
function wordCountLabel(count: number): string {
  return count === 1
    ? Rune.t("1 mot")
    : Rune.t("{{count}} mots", { count: countParam(count) });
}

// Moi : jamais mon propre nom Rune ni ma propre couleur — le vermillon me
// désigne partout ailleurs dans l'app (doc 06), le classement ne déroge pas.
function playerLabel(id: PlayerId): string {
  return id === local.yourPlayerId
    ? Rune.t("Moi")
    : Rune.getPlayerInfo(id).displayName;
}

function standingAccentClass(id: PlayerId): string {
  if (id === local.yourPlayerId) return "you";
  const slot = local.colorSlots[id];
  // Slot inconnu (joueur parti après la victoire, avant que je revoie cet
  // écran) : pas de teinte, plutôt qu'une couleur inventée.
  return slot !== undefined ? `owner-${slot}` : "";
}

// Tri par mots décroissant, égalité = même rang (rang suivant sauté) — pas de
// départage par ordre de validation, coopératif (doc 07 § Q15b). L'ordre des
// clés de `counts` (winSummary, logic/progression.ts) suit `playerIds`, sans
// incidence ici puisqu'on retrie entièrement.
function rankStandings(
  counts: WinSummary["counts"],
): { playerId: PlayerId; rank: number; count: number }[] {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const standings: { playerId: PlayerId; rank: number; count: number }[] = [];
  let rank = 0;
  let previousCount: number | null = null;
  entries.forEach(([playerId, count], i) => {
    if (previousCount === null || count !== previousCount) rank = i + 1;
    standings.push({ playerId, rank, count });
    previousCount = count;
  });
  return standings;
}

// Un joueur par ligne ; masqué en solo dans la room (rien à classer, doc 07 §
// « solo en room »). Les joueurs partis AVANT la victoire n'apparaissent pas
// dans `counts` (Q7b, logic/progression.ts § wordCountsByPlayer) ; les
// spectateurs n'y ont jamais figuré.
function renderStandings(winSummary: WinSummary | null): void {
  const standings = rankStandings(winSummary?.counts ?? {});
  winStandingsEl.textContent = "";
  winStandingsEl.hidden = standings.length < 2;
  if (standings.length < 2) return;
  for (const { playerId, rank, count } of standings) {
    const li = document.createElement("li");
    const accent = standingAccentClass(playerId);
    li.className = accent ? `standing-row ${accent}` : "standing-row";
    const rankSpan = document.createElement("span");
    rankSpan.className = "standing-rank";
    rankSpan.textContent = rankGlyph(rank);
    const avatar = document.createElement("img");
    avatar.className = "standing-avatar";
    avatar.src = Rune.getPlayerInfo(playerId).avatarUrl;
    avatar.alt = "";
    const name = document.createElement("span");
    name.className = "standing-name";
    name.textContent = playerLabel(playerId);
    const countSpan = document.createElement("span");
    countSpan.className = "standing-count";
    countSpan.textContent = wordCountLabel(count);
    li.append(rankSpan, avatar, name, countSpan);
    li.setAttribute(
      "aria-label",
      // {{words}} et non {{count}} : la valeur est un libellé déjà traduit
      // (wordCountLabel), pas un nombre — nommer le paramètre `count`
      // enclencherait la mécanique de pluriel d'i18next (cf. ./i18n.ts).
      Rune.t("Rang {{rank}} : {{name}}, {{words}}", {
        rank: String(rank),
        name: playerLabel(playerId),
        words: wordCountLabel(count),
      }),
    );
    winStandingsEl.appendChild(li);
  }
}

// star : passé par client/client.ts (winRenderOpts) au seul cas qui vaut une
// récompense — un défi gagné pour la première fois. Le rejeu d'un défi et les
// niveaux normaux laissent l'écran de victoire inchangé, sans quoi l'étoile ne
// voudrait plus rien dire.
// choices : ce que la victoire vient d'ouvrir (0 à 2 niveaux).
export function renderWin(
  opts: {
    star?: { count: number; unlocked: string | null };
    choices?: NextChoice[];
    winSummary?: WinSummary | null;
  } = {},
) {
  const { star, choices = [], winSummary = null } = opts;
  counterEl.classList.add("full");
  const { wordCount } = local.mode;
  winSubEl.textContent =
    wordCount > 1
      ? Rune.t("{{count}} MOTS TROUVÉS", { count: countParam(wordCount) })
      : Rune.t("{{count}} MOT TROUVÉ", { count: countParam(wordCount) });
  renderStandings(winSummary);
  winStarEl.hidden = !star;
  if (star) {
    winStarGainEl.textContent = "";
    winStarGainEl.append(
      starIcon(),
      Rune.t("Étoile gagnée — {{count}} / {{max}}", {
        count: countParam(star.count),
        max: String(MAX_STARS),
      }),
    );
    // Les étoiles au-delà des paliers ne débloquent rien : elles ne comptent
    // que pour la complétion du mode, on n'annonce donc que le gain.
    winStarUnlockEl.hidden = star.unlocked === null;
    winStarUnlockEl.textContent = star.unlocked
      ? Rune.t("Accès à : {{unlock}}", { unlock: star.unlocked })
      : "";
  }
  renderWinActions(choices);
  winEl.hidden = false;
}

// Le retour à la carte et l'enchaînement quittent tous deux l'écran de victoire.
export function hideWin() {
  winEl.hidden = true;
}
