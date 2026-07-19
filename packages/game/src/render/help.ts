// Comment jouer : l'écran des règles, plein écran au-dessus de la partie.
// Structure statique dans index.html (figures comprises) ; ce module pose les
// icônes une fois pour toutes, et les TEXTES (traduits, doc 08 § i18n) à
// chaque ouverture — plutôt qu'une fois au chargement du module, pour rester
// correct si la langue change en cours de session (Dev UI § langues).
//
// Deux entrées : le panneau règle du header de partie (lien COMMENT JOUER),
// et le tout premier lancement du jeu — l'écran s'ouvre alors de lui-même
// PAR-DESSUS l'écran d'arrivée (carte ou grille, client.ts au premier
// stateSync), sa fermeture le révèle.
//
// « Vu » n'est plus un drapeau localStorage : il vit dans `game.persisted`
// (doc 02/08, ex-tracemot.help-seen) — ce module ne LIT ni n'ÉCRIT plus rien
// lui-même, client.ts lui passe l'état vu à l'appel et se charge de
// persister l'action `setHelpSeen` via `onSeen`.

import { playSound } from "../audio/audio.ts";
import { checkIcon, closeIcon, starIcon } from "./icons.ts";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Tracemot : élément #${id} introuvable`);
  return el;
}

const helpEl = byId("help");
const closeEl = byId("help-close");
const startEl = byId("help-start");
const titleEl = byId("help-title");
const headingEls = helpEl.querySelectorAll<HTMLElement>(".help-heading");
const lineEls = helpEl.querySelectorAll<HTMLElement>(".help-line");
const defiLabelEl = helpEl.querySelector<HTMLElement>(".help-map-defi-label");

// La croix de sortie, et les signes des figures HTML (le registre coché, la
// case validée, l'étoile du défi — creuse : elle reste à prendre). Les figures
// SVG, elles, portent leur dessin en propre.
closeEl.appendChild(closeIcon());
for (const mark of document.querySelectorAll(
  "#help .help-ledger-check, #help .help-map-check",
)) {
  mark.appendChild(checkIcon());
}
helpEl.querySelector(".help-map-star")?.appendChild(starIcon(false));

// Les 4 étapes, dans l'ordre du HTML (headingEls/lineEls, cf. ci-dessus) :
// contenu du mot MOT/RAS/CLE et lettres des figures exclus (contenu de jeu
// français, doc 08 § i18n Q3) — seul le TEXTE d'accompagnement est traduit.
function helpSteps(): { heading: string; line: string }[] {
  return [
    {
      heading: Rune.t("Tracer"),
      line: Rune.t(
        "Reliez des lettres voisines, sur une même ligne ou une même colonne, puis relâchez : le mot se soumet tout seul.",
      ),
    },
    {
      heading: Rune.t("Une lettre, une fois"),
      line: Rune.t(
        "Chaque lettre ne sert qu'à un seul mot : les cases d'un mot validé sortent du jeu.",
      ),
    },
    {
      heading: Rune.t("Finir la grille"),
      line: Rune.t(
        "La grille est finie quand tous ses mots sont trouvés : le registre les compte pour vous.",
      ),
    },
    {
      heading: Rune.t("Gagner des étoiles"),
      line: Rune.t(
        "Chaque défi validé rapporte une étoile. Elles ouvrent les difficultés suivantes, et le mode au-dessus - des grilles plus grandes, des mots plus longs.",
      ),
    },
  ];
}

// Appelé à chaque ouverture (client.ts dispatche `setHelpSeen` dessus) : posé
// une seule fois ici plutôt que dans chaque appelant.
let onSeen: (() => void) | null = null;

// --- Affichage --------------------------------------------------------------

// Toute ouverture marque l'écran comme lu (onSeen) — y compris depuis le
// panneau règle : un joueur qui l'a consulté n'a pas à le revoir d'office.
export function showHelp(opts: { firstPlay?: boolean } = {}): void {
  // Textes recalculés à chaque ouverture (pas au chargement du module) : ils
  // reflètent la langue courante même si le joueur l'a changée en Dev UI.
  closeEl.setAttribute("aria-label", Rune.t("Fermer les règles"));
  closeEl.title = Rune.t("Fermer");
  titleEl.textContent = Rune.t("Comment jouer");
  helpSteps().forEach((step, i) => {
    const heading = headingEls[i];
    const line = lineEls[i];
    if (heading) heading.textContent = step.heading;
    if (line) line.textContent = step.line;
  });
  if (defiLabelEl) defiLabelEl.textContent = Rune.t("DÉFI");
  startEl.textContent = Rune.t("C'EST PARTI");
  // Le bouton du bas n'existe qu'au premier lancement : l'écran d'arrivée
  // attend juste dessous, il y plonge. Ouvert depuis le panneau règle, la
  // sortie est la croix.
  startEl.hidden = !opts.firstPlay;
  helpEl.hidden = false;
  helpEl.scrollTop = 0;
  onSeen?.();
}

export function hideHelp(): void {
  helpEl.hidden = true;
}

// Appelée par client.ts au tout premier stateSync, une fois l'écran d'arrivée
// peint, si `persisted.helpSeen` n'est pas encore posé : avant, la fermeture
// ne révélerait rien.
export function showHelpOnFirstPlay(helpSeen: boolean): void {
  if (helpSeen) return;
  showHelp({ firstPlay: true });
}

// --- Événements -------------------------------------------------------------

export function bindHelp(handlers: { onSeen: () => void }): void {
  onSeen = handlers.onSeen;
  closeEl.addEventListener("click", () => {
    playSound("ui-close");
    hideHelp();
  });
  // « C'est parti » engage le jeu qui attend dessous : son principal.
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
