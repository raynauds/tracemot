// Compteur d'actions/s (Dev-mode uniquement) : vérifie à l'œil le budget Rune
// (10 actions/joueur/s, doc 05 § Contrainte cadre) pendant le développement —
// jamais actif en prod par défaut. Activable via `?dev=1` dans l'URL (aucun
// flag de build : le projet ne livre que des builds `vite build`) — un joueur
// ordinaire ne tombe jamais dessus par erreur.
//
// Couleur en dur assumée (DESIGN.md § Colors : « le vert #2e7d32 du panneau
// de debug » — exception déjà documentée, le debug n'est pas de l'interface
// produit).

const DEBUG_GREEN = "#2e7d32";
const WINDOW_MS = 1000;
const BUDGET_PER_SECOND = 10; // doc 05 § Contrainte cadre

export const devActionsEnabled = new URLSearchParams(location.search).has("dev");

const timestamps: number[] = [];
let overlay: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlay) return overlay;
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "8px";
  el.style.bottom = "8px";
  el.style.zIndex = "999";
  el.style.padding = "4px 8px";
  el.style.fontFamily = "monospace";
  el.style.fontSize = "11px";
  el.style.color = "#fff";
  el.style.background = DEBUG_GREEN;
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  overlay = el;
  return el;
}

/** À appeler à chaque `Rune.actions.*` dispatché par CE client (client.ts
 *  uniquement) — no-op tant que `?dev=1` n'est pas présent dans l'URL. */
export function trackAction(name: string): void {
  if (!devActionsEnabled) return;
  const now = Date.now();
  timestamps.push(now);
  while (timestamps.length && now - timestamps[0] > WINDOW_MS) timestamps.shift();
  const rate = timestamps.length;
  const el = ensureOverlay();
  el.textContent = `actions/s: ${rate} (${name})`;
  if (rate > BUDGET_PER_SECOND) {
    el.style.background = "#b3402a"; // vermillon : hors budget, alerte visible
    console.warn(`Traceword [dev] : ${rate} actions/s — au-delà du budget Rune (${BUDGET_PER_SECOND}/s)`);
  } else {
    el.style.background = DEBUG_GREEN;
  }
}
