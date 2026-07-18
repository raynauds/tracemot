// Colophon : la page des crédits, plein écran. Tout le contenu est statique
// (index.html) — les attributions ne varient pas au runtime, ce module ne fait
// qu'ouvrir et fermer.
//
// Deux entrées : le lien CRÉDITS de l'accueil (l'ours de la page imprimée) et
// « crédits sonores » du panneau SONS. L'écran se pose au-dessus de tout ce qui
// a pu l'ouvrir (accueil ou partie) : le fermer rend ce qu'il couvrait.

import { playSound } from "../audio/audio.ts";
import { arrowLeftIcon } from "./icons.ts";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const creditsEl = byId("credits");
const backEl = byId("credits-back");

backEl.appendChild(arrowLeftIcon());

export function showCredits(): void {
  creditsEl.hidden = false;
  creditsEl.scrollTop = 0;
}

export function hideCredits(): void {
  creditsEl.hidden = true;
}

export function bindCredits(): void {
  backEl.addEventListener("click", () => {
    playSound("ui-secondary");
    hideCredits();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !creditsEl.hidden) {
      playSound("ui-secondary");
      hideCredits();
    }
  });
}
