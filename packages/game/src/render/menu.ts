// Menu du jeu (rouage) : un seul point d'entrée pour les à-côtés — le
// tutoriel (« Comment jouer »), les crédits, et quitter la partie en cours.
//
// Deux déclencheurs pour un même panneau : le rouage du header de partie
// (statique, index.html) et celui du header de la carte (reconstruit à chaque
// rendu, cf. buildMenuChip consommé par map.ts). Le panneau, lui, est UNIQUE
// et vit au niveau du body : ancré au coin haut-droit de l'écran — où les
// deux rouages se posent —, il échappe aux contextes d'empilement des deux
// headers (la carte, z-index 40, recouvrirait un panneau né dans le header de
// partie, z-index 25). Habillage : src/render/menu.css, sur le composant
// voile + panneau partagé (src/render/panel.css).
//
// QUITTER LA PARTIE n'apparaît qu'en partie : sur la carte il n'y a rien à
// quitter (proposer un niveau EST le geste de départ). L'item porte un libellé
// explicite là où l'ancienne flèche « retour » se donnait pour une navigation :
// quitter une partie en cours est une PROPOSITION d'abandon soumise au vote de
// la room (doc 02/04) — le détour par le menu ajoute la friction qui protège
// l'action rare et collective d'un tap accidentel.

import { playSound } from "../audio/audio.ts";
import { closeIcon, settingsIcon } from "./icons.ts";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const overlayEl = byId("menu-overlay");
const panelEl = byId("menu-panel");
const titleEl = byId("menu-title");
const closeEl = byId("menu-close");
const helpItemEl = byId("menu-help");
const creditsItemEl = byId("menu-credits");
const quitItemEl = byId("menu-quit");
const gameChipEl = byId("menu-chip-game");

// La croix et le rouage du header de partie : posés une fois, comme partout.
closeEl.appendChild(closeIcon());
gameChipEl.appendChild(settingsIcon());

// Les DEUX rouages reflètent l'état du panneau : celui de la carte est relu à
// chaque appel — le DOM de la carte est reconstruit à chaque rendu, un nœud
// gardé en référence serait périmé.
function setChipsExpanded(open: boolean): void {
  for (const chip of document.querySelectorAll<HTMLElement>(".menu-chip")) {
    chip.setAttribute("aria-expanded", String(open));
    chip.classList.toggle("open", open);
  }
}

export function openMenu(): void {
  // Textes recalculés à chaque ouverture (pas au chargement du module) : ils
  // reflètent la langue courante même si le joueur l'a changée en Dev UI —
  // même règle que help.ts.
  titleEl.textContent = Rune.t("MENU");
  panelEl.setAttribute("aria-label", Rune.t("Menu"));
  closeEl.setAttribute("aria-label", Rune.t("Fermer"));
  helpItemEl.textContent = Rune.t("COMMENT JOUER");
  creditsItemEl.textContent = Rune.t("CRÉDITS");
  quitItemEl.textContent = Rune.t("QUITTER LA PARTIE");
  // Sur la carte, rien à quitter : body.map-open est déjà LE signal « la
  // carte est l'écran affiché » (map.ts), le menu n'a pas d'état à tenir.
  quitItemEl.hidden = document.body.classList.contains("map-open");
  panelEl.hidden = false;
  overlayEl.hidden = false;
  setChipsExpanded(true);
}

export function closeMenu(): void {
  panelEl.hidden = true;
  overlayEl.hidden = true;
  setChipsExpanded(false);
}

// Le clic d'un rouage, quel qu'il soit : celui du header de partie (bindMenu)
// comme celui de la carte (délégation de map.ts).
export function toggleMenu(): void {
  playSound(panelEl.hidden ? "ui-secondary" : "ui-close");
  if (panelEl.hidden) openMenu();
  else closeMenu();
}

// Rouage du header de CARTE : fabriqué à chaque rendu de map.ts (son DOM est
// intégralement reconstruit), donc les libellés y sont toujours dans la
// langue courante. Le clic est capté par la délégation de bindMap — aucun
// écouteur propre, comme tout ce que la carte pose.
export function buildMenuChip(): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "menu-chip map-menu-chip";
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", String(!panelEl.hidden));
  chip.setAttribute("aria-label", Rune.t("Menu"));
  chip.title = Rune.t("Menu");
  chip.appendChild(settingsIcon());
  return chip;
}

// Consulter (aide, crédits) sonne en secondaire ; fermer et quitter sonnent en
// fermeture — quitter SORT de l'écran, comme le faisait l'ancienne flèche.
export function bindMenu(handlers: {
  onHelp: () => void;
  onCredits: () => void;
  onQuit: () => void;
}): void {
  // aria-label du rouage statique : posé une fois, comme les libellés
  // statiques de render.ts (limite i18n assumée, doc 08 v1).
  gameChipEl.setAttribute("aria-label", Rune.t("Menu"));
  gameChipEl.title = Rune.t("Menu");
  gameChipEl.addEventListener("click", toggleMenu);

  const close = () => {
    playSound("ui-close");
    closeMenu();
  };
  closeEl.addEventListener("click", close);
  overlayEl.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panelEl.hidden) close();
  });

  helpItemEl.addEventListener("click", () => {
    playSound("ui-secondary");
    closeMenu();
    handlers.onHelp();
  });
  creditsItemEl.addEventListener("click", () => {
    playSound("ui-secondary");
    closeMenu();
    handlers.onCredits();
  });
  quitItemEl.addEventListener("click", () => {
    playSound("ui-close");
    closeMenu();
    handlers.onQuit();
  });
}
