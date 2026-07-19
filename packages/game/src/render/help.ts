// Comment jouer : l'écran des règles, plein écran au-dessus de la partie.
// Structure statique dans index.html (figures comprises) ; ce module ne fait
// que poser les icônes, ouvrir, fermer.
//
// Deux entrées : le panneau règle du header de partie (lien COMMENT JOUER),
// et la toute première partie — l'écran s'ouvre alors de lui-même PAR-DESSUS
// la grille prête (startLevel a fini son travail), sa fermeture la révèle.
//
// « Vu » n'est plus un drapeau localStorage : il vit dans `game.persisted`
// (doc 02/08, ex-tracemot.help-seen) — ce module ne LIT ni n'ÉCRIT plus rien
// lui-même, client.ts lui passe l'état vu à l'appel et se charge de
// persister l'action `setHelpSeen` via `onSeen`.

import { playSound } from "../audio/audio.ts";
import { arrowLeftIcon, checkIcon, starIcon } from "./icons.ts";

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

// Appelé à chaque ouverture (client.ts dispatche `setHelpSeen` dessus) : posé
// une seule fois ici plutôt que dans chaque appelant.
let onSeen: (() => void) | null = null;

// --- Affichage --------------------------------------------------------------

// Toute ouverture marque l'écran comme lu (onSeen) — y compris depuis le
// panneau règle : un joueur qui l'a consulté n'a pas à le revoir d'office.
export function showHelp(opts: { firstPlay?: boolean } = {}): void {
  // Le bouton du bas n'existe qu'à la première partie : la grille attend juste
  // dessous, il y plonge. Ouvert depuis le panneau règle, la sortie est la
  // flèche.
  startEl.hidden = !opts.firstPlay;
  helpEl.hidden = false;
  helpEl.scrollTop = 0;
  onSeen?.();
}

export function hideHelp(): void {
  helpEl.hidden = true;
}

// Appelée par client.ts une fois la grille en place, si `persisted.helpSeen`
// n'est pas encore posé : avant, la fermeture ne révélerait rien.
export function showHelpOnFirstPlay(helpSeen: boolean): void {
  if (helpSeen) return;
  showHelp({ firstPlay: true });
}

// --- Événements -------------------------------------------------------------

export function bindHelp(handlers: { onSeen: () => void }): void {
  onSeen = handlers.onSeen;
  backEl.addEventListener("click", () => {
    playSound("ui-close");
    hideHelp();
  });
  // « C'est parti » engage la partie qui attend dessous : son principal.
  startEl.addEventListener("click", () => {
    playSound("ui-primary");
    hideHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpEl.hidden) {
      playSound("ui-close");
      hideHelp();
    }
  });
}
