// Accueil : le premier écran. Le nom du jeu, la reprise, l'accès à la carte, la
// règle.
//
// Sur le modèle de render.ts, pas sur celui de map.ts : la structure est
// statique dans index.html et ce module ne fait qu'y écrire ce qui varie (le
// libellé du bouton primaire, la ligne d'état). L'accueil n'a rien à
// reconstruire — il n'a que deux états, premier lancement et reprise.
//
// C'est le SEUL écran qui porte la marque. La carte et la partie n'ont pas à se
// nommer (cf. src/theme/DESIGN.md).

import { levelLabel, type LevelId, type ModeId } from "@tracemot/core";
import { playSound } from "../audio/audio.ts";
import {
  isFirstLaunch,
  resumePoint,
  type ResumePoint,
} from "../game/progress.ts";
import { closeIcon, infoIcon } from "./icons.ts";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const homeEl = byId("home");
const titleEl = byId("home-title");
const stateEl = byId("home-state");
const startEl = byId("home-start") as HTMLButtonElement;
const levelsEl = byId("home-levels");
const infoEl = byId("home-info");
const rulePanelEl = byId("home-rule-panel");
const ruleOverlayEl = byId("home-rule-overlay");
const ruleCloseEl = byId("home-rule-close");

// Deux boutons muets dans le HTML : leur sens tient dans leur aria-label, leur
// dessin vient d'ici (cf. ./icons.ts).
infoEl.appendChild(infoIcon());
ruleCloseEl.appendChild(closeIcon());

// Ce que le bouton primaire lancera. Gardé ici plutôt que sur le DOM : le clic
// n'a rien à re-parser, et un rendu qui n'a rien trouvé le remet à null — le
// bouton masqué ne peut donc pas relancer la reprise précédente.
let resume: ResumePoint | null = null;

// --- Rendu ------------------------------------------------------------------

// Deux états, et deux seulement.
//
// Rien à reprendre encore (premier lancement) : la ligne d'état explique la
// mécanique — c'est la seule chose qu'on puisse dire d'utile — et le bouton
// COMMENCE. resumePoint() renvoie alors 5×5 / 1-1, le seul niveau ouvert.
//
// Plus rien à reprendre (tout est validé) : le primaire disparaît, et le choix
// du niveau devient l'unique geste — c'est le seul qui ait encore un sens, on ne
// lui laisse donc pas un bouton mort au-dessus.
function renderHome(): void {
  resume = resumePoint();
  startEl.hidden = resume === null;
  if (!resume) {
    stateEl.textContent = "Toutes les grilles sont validées";
    return;
  }
  // « Reprendre » suppose qu'il y ait quelque chose derrière soi : tant que rien
  // n'est validé nulle part, le point de reprise est le tout premier niveau et
  // le verbe est « commencer ».
  const first = isFirstLaunch();
  startEl.textContent = first ? "COMMENCER" : "REPRENDRE";
  // Le format du point de reprise est celui du header de partie (« 5×5 · 1-4 ») :
  // le joueur retrouvera le même libellé une fois la grille lancée.
  stateEl.textContent = first
    ? "Reliez des lettres voisines pour tracer les mots"
    : levelLabel(resume.modeId, resume.id);
}

// --- Affichage --------------------------------------------------------------

// Toujours re-rendre, comme showMap() : au retour de la carte, la reprise a pu
// changer (un niveau gagné entre-temps) sans que l'appelant ait à y penser.
export function showHome(): void {
  renderHome();
  homeEl.hidden = false;
  // Le chrome de partie est masqué par le CSS via cette classe : l'accueil n'a
  // pas à connaître ses éléments un par un.
  document.body.classList.add("home-open");
}

export function hideHome(): void {
  homeEl.hidden = true;
  document.body.classList.remove("home-open");
}

// La séquence d'écriture du titre. Appelée par main.ts APRÈS le retrait de
// .booting : jouée avant, elle se déroulerait derrière un écran invisible et
// l'accueil apparaîtrait déjà écrit. Idempotente — la classe ne se pose qu'une
// fois, un retour à l'accueil ne rejoue donc pas l'ouverture.
export function revealHome(): void {
  titleEl.classList.add("is-revealed");
}

// --- Règle du jeu -----------------------------------------------------------

function setRulePanelOpen(open: boolean): void {
  rulePanelEl.hidden = !open;
  ruleOverlayEl.hidden = !open;
  infoEl.classList.toggle("open", open);
  infoEl.setAttribute("aria-expanded", String(open));
}

// --- Événements -------------------------------------------------------------

export function bindHome(handlers: {
  onStart: (modeId: ModeId, id: LevelId) => void;
  onLevels: () => void;
}): void {
  // COMMENCER/REPRENDRE engage une partie : son principal. « Niveaux » ouvre
  // la carte pour regarder : son secondaire, comme la règle.
  startEl.addEventListener("click", () => {
    if (resume) {
      playSound("ui-primary");
      handlers.onStart(resume.modeId, resume.id);
    }
  });
  levelsEl.addEventListener("click", () => {
    playSound("ui-secondary");
    handlers.onLevels();
  });

  // hidden est typé string | boolean (« until-found ») mais on n'y écrit que
  // des booléens.
  infoEl.addEventListener("click", () => {
    playSound("ui-secondary");
    setRulePanelOpen(rulePanelEl.hidden as boolean);
  });
  ruleCloseEl.addEventListener("click", () => {
    playSound("ui-secondary");
    setRulePanelOpen(false);
  });
  ruleOverlayEl.addEventListener("click", () => {
    playSound("ui-secondary");
    setRulePanelOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !rulePanelEl.hidden) {
      playSound("ui-secondary");
      setRulePanelOpen(false);
    }
  });
}
