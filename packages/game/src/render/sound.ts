// Réglages sonores : le panneau des deux volumes — l'interface et la musique —
// ouvert depuis l'accueil (bouton SONS) et depuis le header de partie.
//
// La structure du panneau est statique et UNIQUE (index.html) : les curseurs
// portent l'état affiché, en avoir deux copies obligerait à les tenir
// synchrones. Le panneau et son voile sont donc DÉPLACÉS sous le déclencheur
// qui les ouvre — chaque ancre les positionne par ses propres règles CSS
// (le voile, fixe, se moque de l'endroit où il vit).
//
// Les curseurs vont de 0 à 10 : dix crans suffisent à l'oreille, et le pas
// rend chaque réglage franc — pas de 73 % impossible à retrouver. Le moteur
// (src/audio/audio.ts) reçoit la fraction 0-1 et la persiste.

import {
  getMusicVolume,
  getUiVolume,
  playSound,
  setMusicVolume,
  setUiVolume,
} from "../audio/audio.ts";
import { closeIcon, volumeIcon } from "./icons.ts";

const STEPS = 10;

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const overlayEl = byId("sound-overlay");
const panelEl = byId("sound-panel");
const closeEl = byId("sound-close");
const uiInput = byId("sound-ui") as HTMLInputElement;
const musicInput = byId("sound-music") as HTMLInputElement;
const uiValueEl = byId("sound-ui-value");
const musicValueEl = byId("sound-music-value");

// Les deux déclencheurs et leur ancre : le panneau part vivre chez celui qui
// l'ouvre.
const homeTriggerEl = byId("home-sound");
const homeAnchorEl = byId("home-sound-anchor");
const chipTriggerEl = byId("sound-chip");
const chipAnchorEl = byId("header-sound-anchor");

// Boutons muets dans le HTML : leur dessin vient d'ici (cf. ./icons.ts). Le
// bouton de l'accueil, lui, parle en toutes lettres (« SONS ») — pas d'icône.
chipTriggerEl.appendChild(volumeIcon());
closeEl.appendChild(closeIcon());

// Les crans sous la piste : onze graduations, comme une règle. Générées ici
// plutôt qu'écrites onze fois dans le HTML.
for (const scaleId of ["sound-ui-scale", "sound-music-scale"]) {
  const scale = byId(scaleId);
  for (let i = 0; i <= STEPS; i++) {
    scale.appendChild(document.createElement("i"));
  }
}

// --- Curseurs ---------------------------------------------------------------

// Réécrit ce que le curseur montre : la part encrée de la piste (--fill, lue
// par le CSS) et la valeur en clair. À zéro, le chiffre cède la place au mot —
// « 0 % » laisserait croire qu'il reste quelque chose à entendre.
function renderSlider(input: HTMLInputElement, valueEl: HTMLElement): void {
  const v = Number(input.value);
  input.style.setProperty("--fill", `${(v / STEPS) * 100}%`);
  valueEl.textContent = v === 0 ? "COUPÉ" : `${v * 10} %`;
}

function sliderVolume(input: HTMLInputElement): number {
  return Number(input.value) / STEPS;
}

// --- Ouverture / fermeture --------------------------------------------------

// Le déclencheur dont le panneau est ouvert, ou null. C'est lui qui porte
// l'état (classe .open, aria-expanded) et qui désigne l'ancre.
let openTrigger: HTMLElement | null = null;

function setOpen(trigger: HTMLElement | null): void {
  if (openTrigger) {
    openTrigger.classList.remove("open");
    openTrigger.setAttribute("aria-expanded", "false");
  }
  openTrigger = trigger;
  if (trigger) {
    const anchor = trigger === homeTriggerEl ? homeAnchorEl : chipAnchorEl;
    anchor.append(overlayEl, panelEl);
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }
  overlayEl.hidden = !trigger;
  panelEl.hidden = !trigger;
}

// --- Événements -------------------------------------------------------------

export function bindSound(): void {
  // État initial des curseurs : ce que le moteur a relu du stockage.
  uiInput.value = String(Math.round(getUiVolume() * STEPS));
  musicInput.value = String(Math.round(getMusicVolume() * STEPS));
  renderSlider(uiInput, uiValueEl);
  renderSlider(musicInput, musicValueEl);

  for (const trigger of [homeTriggerEl, chipTriggerEl]) {
    trigger.addEventListener("click", () => {
      playSound("ui-secondary");
      setOpen(openTrigger === trigger ? null : trigger);
    });
  }
  closeEl.addEventListener("click", () => {
    playSound("ui-secondary");
    setOpen(null);
  });
  overlayEl.addEventListener("click", () => {
    playSound("ui-secondary");
    setOpen(null);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openTrigger) {
      playSound("ui-secondary");
      setOpen(null);
    }
  });

  // Interface : le réglage s'applique pendant le glissement, mais ne S'ENTEND
  // qu'au relâchement — un échantillon par geste, pas une mitraille par cran.
  // (playSound se tait de lui-même à zéro : le silence EST le bon échantillon.)
  uiInput.addEventListener("input", () => {
    setUiVolume(sliderVolume(uiInput));
    renderSlider(uiInput, uiValueEl);
  });
  uiInput.addEventListener("change", () => {
    playSound("ui-secondary");
  });

  // Musique : elle joue déjà — elle est son propre échantillon, en direct.
  musicInput.addEventListener("input", () => {
    setMusicVolume(sliderVolume(musicInput));
    renderSlider(musicInput, musicValueEl);
  });
}
