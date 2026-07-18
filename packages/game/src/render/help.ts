// Comment jouer : l'écran des règles, plein écran au-dessus de l'accueil.
// Structure statique dans index.html (figures comprises) ; ce module ne fait
// que poser les icônes, ouvrir, fermer.
//
// Deux entrées : le « ? » de l'accueil, et la toute première partie — l'écran
// s'ouvre alors de lui-même PAR-DESSUS la grille prête (startLevel a fini son
// travail), sa fermeture la révèle. C'est l'héritier du panneau règle qui
// s'ouvrait d'office au premier niveau (l'ancien drapeau tracemot.rule-seen
// vaut donc « déjà vu » : un joueur qui connaît la règle n'a pas à relire).

import { playSound } from "../audio/audio.ts";
import { arrowLeftIcon, checkIcon, starIcon } from "./icons.ts";

const HELP_SEEN_KEY = "tracemot.help-seen";
const LEGACY_RULE_SEEN_KEY = "tracemot.rule-seen";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const helpEl = byId("help");
const backEl = byId("help-back");
const startEl = byId("help-start");

// La flèche de sortie, et les signes des figures HTML (le registre coché, la
// case validée, l'étoile du défi — creuse : elle reste à prendre). Les figures
// SVG, elles, portent leur dessin en propre.
backEl.appendChild(arrowLeftIcon());
for (const mark of document.querySelectorAll(
  "#help .help-ledger-check, #help .help-map-check",
)) {
  mark.appendChild(checkIcon());
}
helpEl.querySelector(".help-map-star")?.appendChild(starIcon(false));

function markSeen(): void {
  try {
    localStorage.setItem(HELP_SEEN_KEY, "1");
  } catch {
    // Stockage indisponible : l'écran se rouvrira à la prochaine première fois.
  }
}

function seen(): boolean {
  try {
    return (
      localStorage.getItem(HELP_SEEN_KEY) !== null ||
      localStorage.getItem(LEGACY_RULE_SEEN_KEY) !== null
    );
  } catch {
    return false;
  }
}

// --- Affichage --------------------------------------------------------------

// Toute ouverture marque l'écran comme lu — y compris depuis le « ? » : un
// joueur qui l'a consulté avant de jouer n'a pas à le revoir d'office.
export function showHelp(opts: { firstPlay?: boolean } = {}): void {
  // Le bouton du bas n'existe qu'à la première partie : la grille attend juste
  // dessous, il y plonge. Ouvert depuis l'accueil, la sortie est la flèche.
  startEl.hidden = !opts.firstPlay;
  helpEl.hidden = false;
  helpEl.scrollTop = 0;
  markSeen();
}

export function hideHelp(): void {
  helpEl.hidden = true;
}

// Appelée par startLevel (main.ts) une fois la grille en place : avant, la
// fermeture ne révélerait rien.
export function showHelpOnFirstPlay(): void {
  if (seen()) return;
  showHelp({ firstPlay: true });
}

// --- Événements -------------------------------------------------------------

export function bindHelp(): void {
  backEl.addEventListener("click", () => {
    playSound("ui-secondary");
    hideHelp();
  });
  // « C'est parti » engage la partie qui attend dessous : son principal.
  startEl.addEventListener("click", () => {
    playSound("ui-primary");
    hideHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpEl.hidden) {
      playSound("ui-secondary");
      hideHelp();
    }
  });
}
