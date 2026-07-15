// Icônes de l'interface, dessinées en SVG plutôt qu'en glyphe (★ ☆ ✓ ← ✕ ▾ ▸ ⤢).
// Un glyphe dépend de la fonte qui le rend — corps, graisse et alignement
// varient d'une plateforme à l'autre —, alors que ces tracés tiennent la même
// graisse que les filets de la carte, partout.
//
// Les fichiers (src/assets/icons, jeu Feather) sont la source unique du dessin :
// `?raw` les inline dans le bundle à la compilation. On les pose donc en SVG
// vivant dans le DOM — sans requête, et coloriables par le CSS, ce qu'aucune
// <img> ni background-image ne permet (`currentColor` ne les traverse pas).
//
// Le CSS l'emporte sur les attributs de présentation du fichier : .icon impose
// 1em de côté (contre width/height="24") et .is-filled remplit l'étoile (contre
// fill="none") — cf. src/theme/base.css. Le fichier reste donc modifiable sans
// que le code ait à suivre.

import arrowLeftSvg from "../assets/icons/arrow-left.svg?raw";
import checkSvg from "../assets/icons/check.svg?raw";
import chevronRightSvg from "../assets/icons/chevron-right.svg?raw";
import infoSvg from "../assets/icons/info.svg?raw";
import maximizeSvg from "../assets/icons/maximize.svg?raw";
import minusSvg from "../assets/icons/minus.svg?raw";
import plusSvg from "../assets/icons/plus.svg?raw";
import starSvg from "../assets/icons/star.svg?raw";
import xSvg from "../assets/icons/x.svg?raw";

// Parsé une fois : chaque icône posée n'est qu'un clone du nœud modèle.
function template(source: string, className: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = source;
  const svg = host.firstElementChild as SVGSVGElement;
  svg.setAttribute("class", `icon ${className}`); // écrase la classe Feather
  svg.setAttribute("aria-hidden", "true");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return svg;
}

const STAR = template(starSvg, "icon-star");
const CHECK = template(checkSvg, "icon-check");
const ARROW_LEFT = template(arrowLeftSvg, "icon-arrow-left");
const CLOSE = template(xSvg, "icon-close");
const CHEVRON = template(chevronRightSvg, "icon-chevron");
const INFO = template(infoSvg, "icon-info");
const PLUS = template(plusSvg, "icon-plus");
const MINUS = template(minusSvg, "icon-minus");
const MAXIMIZE = template(maximizeSvg, "icon-maximize");

// filled : l'étoile gagnée est pleine, celle qui reste à gagner est creuse —
// c'est le seul écart entre les deux, le contour est le même.
export function starIcon(filled = true): SVGSVGElement {
  const icon = STAR.cloneNode(true) as SVGSVGElement;
  if (filled) icon.classList.add("is-filled");
  return icon;
}

export function checkIcon(): SVGSVGElement {
  return CHECK.cloneNode(true) as SVGSVGElement;
}

// Retour à la carte, dans le header de partie.
export function arrowLeftIcon(): SVGSVGElement {
  return ARROW_LEFT.cloneNode(true) as SVGSVGElement;
}

// Fermeture des panneaux (règle du jeu, décompte des étoiles).
export function closeIcon(): SVGSVGElement {
  return CLOSE.cloneNode(true) as SVGSVGElement;
}

// Un seul chevron pour les deux sens : celui du registre pointe à droite replié,
// et le CSS le fait pivoter vers le bas quand la liste s'ouvre.
export function chevronIcon(): SVGSVGElement {
  return CHEVRON.cloneNode(true) as SVGSVGElement;
}

// Règle du jeu : le bouton qui l'ouvre, dans le header de partie.
export function infoIcon(): SVGSVGElement {
  return INFO.cloneNode(true) as SVGSVGElement;
}

// Les trois boutons de la caméra (src/render/scene.ts).
export function plusIcon(): SVGSVGElement {
  return PLUS.cloneNode(true) as SVGSVGElement;
}

export function minusIcon(): SVGSVGElement {
  return MINUS.cloneNode(true) as SVGSVGElement;
}

export function maximizeIcon(): SVGSVGElement {
  return MAXIMIZE.cloneNode(true) as SVGSVGElement;
}
