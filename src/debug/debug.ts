// Panneau debug : liste tous les mots trouvables dans la grille courante,
// ceux du dictionnaire enfant en évidence. Survoler un mot met son tracé
// en évidence dans la grille. Chargé dynamiquement par main.ts si DEBUG.
//
// Les grilles étant prégénérées, le runtime ne charge plus aucun
// dictionnaire : ce module charge le sien, pour lui seul. Le coût (plusieurs
// Mo de mots + préfixes) reste ainsi confiné au mode debug.

import { state } from "../game/state.ts";
import { loadDictionaries } from "../game/dictionary.ts";
import { findAllWords } from "../game/solver.ts";
import { setDebugHint } from "../render/scene.ts";

let debugPanelEl: HTMLElement | null = null;

// Dictionnaires du panneau. Les préfixes servent à élaguer le DFS de
// findAllWords : ils sont plafonnés à la longueur maximale d'un tracé, soit le
// nombre de cases de la grille. Un niveau plus grand (un boss, ou un autre
// mode) exige donc de les reconstruire — d'où la mémorisation du plafond
// couvert par le chargement courant.
let fullWords = new Set<string>();
let fullPrefixes = new Set<string>();
let childWords = new Set<string>();
let loadedCellCount = 0;
let loading: Promise<void> | null = null;

async function ensureDictionaries(cellCount: number): Promise<void> {
  if (loadedCellCount >= cellCount) return;
  // Un chargement en vol est forcément pour un plafond inférieur (sinon on
  // serait sorti ci-dessus) : on l'attend avant de relancer, plutôt que de
  // paralléliser deux lectures des mêmes fichiers.
  if (loading) await loading;
  if (loadedCellCount >= cellCount) return;
  loading = (async () => {
    const { full, tiers } = await loadDictionaries(cellCount);
    fullWords = full.words;
    fullPrefixes = full.prefixes;
    childWords = tiers.enfant.words;
    loadedCellCount = cellCount;
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
}

export function buildDebugPanel() {
  debugPanelEl = document.createElement("div");
  debugPanelEl.className = "debug-panel";
  document.body.appendChild(debugPanelEl);
  document.body.classList.add("debug");
}

// Appelé au lancement d'un niveau. Asynchrone (chargement des dictionnaires)
// mais sans valeur de retour utile : si le joueur a changé de niveau entre
// temps, le rendu obsolète est abandonné.
export function renderDebugPanel(): void {
  if (!debugPanelEl) return;
  const levelId = state.levelId;
  void ensureDictionaries(state.geometry.cellCount)
    .then(() => {
      if (state.levelId !== levelId) return;
      paint();
    })
    .catch((err) => {
      console.error("Tracemot : échec du chargement du dictionnaire", err);
    });
}

function paint() {
  if (!debugPanelEl) return;
  const all = findAllWords(
    state.geometry,
    state.letters,
    fullWords,
    fullPrefixes,
  );
  const entries = [...all.entries()].sort(([a], [b]) => a.localeCompare(b));
  const childCount = entries.filter(([w]) => childWords.has(w)).length;

  debugPanelEl.textContent = "";
  const label = document.createElement("span");
  label.className = "debug-label";
  // Plus de génération au runtime : l'identifiant du niveau remplace le
  // compteur de tirages.
  label.textContent =
    `DEBUG - NIVEAU ${state.levelId ?? "?"} - ` +
    `${entries.length} MOTS TROUVABLES, DONT ${childCount} ENFANT`;
  if (state.solution.length > 0) {
    label.textContent += ` - SOLUTION : ${state.solution.join(" ")}`;
  }
  debugPanelEl.appendChild(label);

  for (const [word, path] of entries) {
    const span = document.createElement("span");
    span.className = childWords.has(word) ? "debug-word child" : "debug-word";
    span.textContent = word;
    span.addEventListener("mouseenter", () => setDebugHint(path));
    span.addEventListener("mouseleave", () => setDebugHint(null));
    debugPanelEl.appendChild(span);
  }
}
