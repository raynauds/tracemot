// Intégration avec l'historique du navigateur : sans rien posé dans
// l'historique, le geste retour mobile (edge swipe / bouton système) quitte
// directement l'application au lieu de refermer l'overlay ouvert. Les quatre
// écrans qui se posent PAR-DESSUS un autre — aide, crédits, carte, victoire —
// poussent donc une entrée à l'ouverture ; ce module ne fait QUE la
// comptabilité de cette entrée, chaque overlay garde la charge de son propre
// show()/hide().
//
// Enchaînement (ex. victoire → carte, cf. render.ts:bindMapReturn) : ouvrir un
// second overlay pendant qu'un premier est affiché REMPLACE son entrée plutôt
// que d'en empiler une seconde — l'historique ne grandit pas à chaque clic
// interne, et un retour ramène à ce qui précédait toute la chaîne, pas à
// l'écran intermédiaire.
//
// Jeton anti-course : fermer par bouton/Échap/clic hors panneau consomme
// l'entrée via history.back() — elle doit disparaître, pas rester à
// traverser plus tard. Ce back() déclenche lui-même un popstate, que
// `consuming` empêche d'être relu comme un retour utilisateur : sans lui,
// l'overlay se refermerait une seconde fois, ou le mauvais closer serait
// appelé en plein enchaînement.

export type OverlayKey = "help" | "credits" | "map" | "win";

const MARK = "tmOverlay";

// L'overlay tracké actuellement ouvert (au plus un : ils se recouvrent, ne se
// superposent pas entre eux). null = aucun, l'historique n'a rien de nous à
// consommer.
let current: OverlayKey | null = null;
// history.back() déclenché par popOverlay() (fermeture bouton/Échap), pas par
// l'utilisateur : le popstate qui en résulte ne doit rien refermer de plus.
let consuming = false;
const closers: Partial<Record<OverlayKey, () => void>> = {};

// Appelé par le show*() de chaque overlay tracké. Idempotent : un rendu qui se
// relance (showMap() au retour de partie) ne pousse pas une seconde entrée
// pour le même overlay.
export function pushOverlay(key: OverlayKey): void {
  if (current === key) return;
  if (current) {
    // Chaînage : l'overlay précédent n'a pas eu le temps de se fermer avant
    // que celui-ci s'ouvre (victoire → carte). Remplacer, pas empiler.
    history.replaceState({ [MARK]: key }, "");
  } else {
    history.pushState({ [MARK]: key }, "");
  }
  current = key;
}

// Appelé par le hide*() de chaque overlay tracké, quel que soit le chemin de
// fermeture (bouton, Échap, clic hors panneau, enchaînement vers un autre
// overlay). Sans effet si l'entrée est déjà consommée par ailleurs — retour
// navigateur, ou enchaînement qui a déjà remplacé la clé courante par une
// autre (pushOverlay ci-dessus).
export function popOverlay(key: OverlayKey): void {
  if (current !== key) return;
  current = null;
  if ((history.state as Record<string, unknown> | null)?.[MARK] === key) {
    consuming = true;
    history.back();
  }
}

// Le vrai fermoir de l'overlay : la fonction que popstate appelle quand le
// retour vient authentiquement de l'utilisateur (jamais quand il vient de
// popOverlay() lui-même). Un par overlay tracké, posé par chaque module au
// moment où il se lie (bindHelp(), bindCredits(), bindMap(), bindMapReturn()).
export function bindOverlayCloser(key: OverlayKey, close: () => void): void {
  closers[key] = close;
}

// L'overlay tracké actuellement au premier plan, pour les gardes clavier : un
// handler Échap ne doit agir que sur l'écran RÉELLEMENT affiché. L'état `hidden`
// d'un overlay ne suffit pas — l'écran de victoire, par exemple, survit à son
// `hidden` (backToMap ne le masque que par la classe CSS map-open) ; c'est cette
// clé, tenue à jour par push/pop, qui dit qui est devant.
export function currentOverlay(): OverlayKey | null {
  return current;
}

window.addEventListener("popstate", () => {
  if (consuming) {
    consuming = false;
    return;
  }
  if (!current) return; // aucun overlay tracké ouvert : rien à faire ici
  const key = current;
  current = null;
  closers[key]?.();
});
