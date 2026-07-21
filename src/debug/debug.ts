// Panneau debug : liste tous les mots trouvables dans la grille courante,
// ceux du dictionnaire enfant en évidence. Survoler un mot met son tracé
// en évidence dans la grille. Chargé dynamiquement par main.ts si DEBUG.

import { preloadDefinition } from "../game/definitions.ts";
import { findAllWords } from "../game/solver.ts";
import { state } from "../game/state.ts";
import { setDebugHint } from "../render/scene.ts";

let debugPanelEl: HTMLElement | null = null;
let defEl: HTMLElement | null = null;

/** Mot de test pour la récupération de définition via le Wiktionnaire. */
const TEST_WORD = "pre";

export function buildDebugPanel() {
  debugPanelEl = document.createElement("div");
  debugPanelEl.className = "debug-panel";
  document.body.appendChild(debugPanelEl);
  document.body.classList.add("debug");

  defEl = document.createElement("span");
  defEl.className = "debug-def";
  defEl.textContent = `${TEST_WORD} : chargement de la définition…`;
  preloadDefinition(TEST_WORD).then((def) => {
    if (!defEl) return;
    defEl.textContent = def
      ? `${def.title} ${def.nature} : ${def.text}`
      : `${TEST_WORD} : définition introuvable`;
  });
}

export function renderDebugPanel() {
  if (!debugPanelEl) return;
  const all = findAllWords(
    state.geometry,
    state.letters,
    state.words,
    state.fullPrefixes,
  );
  const entries = [...all.entries()].sort(([a], [b]) => a.localeCompare(b));
  const childCount = entries.filter(([w]) =>
    state.tierWords.enfant.has(w),
  ).length;

  debugPanelEl.textContent = "";
  const label = document.createElement("span");
  label.className = "debug-label";
  const t = state.gridTries;
  label.textContent =
    `DEBUG - ${entries.length} MOTS TROUVABLES, DONT ${childCount} ENFANT - ` +
    `GRILLE VALIDE EN ${t} TIRAGE${t > 1 ? "S" : ""}`;
  if (state.solution.length > 0) {
    label.textContent += ` - SOLUTION : ${state.solution.join(" ")}`;
  }
  debugPanelEl.appendChild(label);
  if (defEl) debugPanelEl.appendChild(defEl);

  for (const [word, path] of entries) {
    const span = document.createElement("span");
    span.className = state.tierWords.enfant.has(word)
      ? "debug-word child"
      : "debug-word";
    span.textContent = word;
    span.addEventListener("mouseenter", () => setDebugHint(path));
    span.addEventListener("mouseleave", () => setDebugHint(null));
    debugPanelEl.appendChild(span);
  }
}
