// Crédits : les attributions des sons et des caractères, ouvertes par le menu
// (render/menu.ts). Même squelette d'écran que « Comment jouer »
// (src/render/screen.css) ; le contenu — rôles traduits, œuvres et auteurs en
// texte nu — est posé à chaque ouverture, pour suivre la langue courante
// (même règle que help.ts).
//
// TEXTE NU seulement : aucun lien, aucune URL — la best practice Rune (doc 08
// § Q21c) proscrit les liens sortants, pas l'attribution, et certaines
// licences (CC BY 4.0) demandent une attribution visible dans le produit
// même. docs/ATTRIBUTIONS.md reste la référence contractuelle : toute entrée
// modifiée ici doit l'être là-bas aussi (et sur le Dev Dashboard).

import { playSound } from "../audio/audio.ts";
import { closeIcon } from "./icons.ts";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Traceword : élément #${id} introuvable`);
  return el;
}

const creditsEl = byId("credits");
const closeEl = byId("credits-close");
const titleEl = byId("credits-title");
const listEl = byId("credits-list");

// La croix de sortie : posée une fois, comme celle de l'aide.
closeEl.appendChild(closeIcon());

// Le rôle (ce que ça fait dans le jeu) se traduit ; l'œuvre, l'auteur et la
// licence sont des noms propres et des identifiants légaux — ils restent tels
// quels, dans toutes les langues.
function entries(): { role: string; note: string }[] {
  return [
    {
      role: Rune.t("Bruitages d'interface"),
      note: "« Ultimate UI SFX Pack » — JDSherbert, © 2023",
    },
    {
      role: Rune.t("Tampon des mots trouvés"),
      note: "« Universal UI Soundpack » — Nathan Gibson, CC BY 4.0",
    },
    {
      role: Rune.t("Son de victoire"),
      note: "« Game Assets All-in-1 » — Kenney, CC0",
    },
    {
      role: Rune.t("Musique"),
      note: "« Jazzy Lofi Calm » — Dvir Silverstone, via Pixabay",
    },
    {
      role: Rune.t("Caractères"),
      note: "Source Serif 4 — Adobe · IBM Plex Mono — IBM, SIL Open Font License",
    },
  ];
}

export function showCredits(): void {
  closeEl.setAttribute("aria-label", Rune.t("Fermer"));
  closeEl.title = Rune.t("Fermer");
  titleEl.textContent = Rune.t("Crédits");
  listEl.textContent = "";
  for (const { role, note } of entries()) {
    const dt = document.createElement("dt");
    dt.className = "credits-role";
    dt.textContent = role;
    const dd = document.createElement("dd");
    dd.className = "credits-note";
    dd.textContent = note;
    listEl.append(dt, dd);
  }
  creditsEl.hidden = false;
  creditsEl.scrollTop = 0;
}

export function hideCredits(): void {
  creditsEl.hidden = true;
}

export function bindCredits(): void {
  closeEl.addEventListener("click", () => {
    playSound("ui-close");
    hideCredits();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !creditsEl.hidden) {
      playSound("ui-close");
      hideCredits();
    }
  });
}
