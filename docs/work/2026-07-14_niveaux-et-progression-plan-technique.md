# Plan d'implémentation : niveaux prédéfinis et déblocage progressif

Plan technique de la spec [2026-07-14_niveaux-et-progression.md](2026-07-14_niveaux-et-progression.md), d'après le design `docs/design/2026-07-14-progression/Carte de progression - Continue.html` (les mesures, couleurs et la logique de dérivation ci-dessous en sont extraites — le mockup embarque un script de référence qui calcule les états exactement comme la spec les décrit).

## Architecture cible

| Rôle | Module | Statut |
| --- | --- | --- |
| Définition des modes (série + boss) | `src/game/config.ts` | modifié |
| Types et chargement des niveaux JSON | `src/game/levels.ts` | **nouveau** |
| Progression : persistance + dérivation des états | `src/game/progress.ts` | **nouveau** |
| Écran carte (DOM) | `src/render/map.ts` + `style.css` + `index.html` | **nouveau** / modifiés |
| Partie (orchestration) | `src/main.ts`, `src/game/state.ts`, `src/game/rules.ts` | modifiés |
| Génération hors-ligne | `scripts/generate-levels.ts` | **nouveau** |
| Données | `public/levels/{5x5,6x6,7x7,8x8}.json` | **nouveau**, versionnées |

Le solveur (`solver.ts`) et les dictionnaires (`dictionary.ts`) sortent du runtime (sauf DEBUG) et ne servent plus qu'au script de génération. Pixi reste inchangé côté grille ; la carte est 100 % DOM par-dessus le canvas (overlay plein écran `pointer-events: auto`, qui bloque naturellement les gestes Pixi).

## Phase 1 — Modèle : modes, niveaux, progression

### 1.1 `config.ts`

```ts
export type ModeId = "5x5" | "6x6" | "7x7" | "8x8";
export const MODE_ORDER: ModeId[] = ["5x5", "6x6", "7x7", "8x8"];
export const GAME_MODES: Record<ModeId, GameMode> = {
  "5x5": { rows: 5, cols: 5, wordLength: 5, wordCount: 5 },
  // … 6x6, 7x7, 8x8
};
export function bossMode(m: GameMode): GameMode {
  return { rows: m.rows * 2, cols: m.cols * 2, wordLength: m.wordLength, wordCount: m.wordCount * 4 };
}
```

- `bossMode` satisfait l'invariant de pavage existant : `4N × N = (2N)²`.
- Supprimés : `ENABLED_MODES`, `ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY`, `TOAST_MS`, `MODE_LABELS.desc` (le nom `5×5` suffit pour les onglets).
- Conservés : `DIFFICULTY_QUOTAS` et `DIFFICULTY_LABELS` (script de génération + titres de sections ; « Brûlant » (5) reste défini mais inutilisé), constantes solveur (`MAX_GRID_TRIES`…) car importées par le script, palette et géométrie Pixi.

### 1.2 `levels.ts` (nouveau)

```ts
export type LevelId = `${1 | 2 | 3 | 4}-${number}`; // "1-1" … "4-25"
export interface LevelData {
  id: LevelId;
  letters: string;    // rows×cols caractères, ligne par ligne
  words: string[];    // solution
  paths: number[][];  // tracé de chaque mot (indices de cases)
}
export interface ModeLevels {
  modeId: ModeId;
  levels: Record<LevelId, LevelData>;
}
export async function loadModeLevels(modeId: ModeId): Promise<ModeLevels>; // fetch levels/<modeId>.json, cache en Map
export const isBoss = (id: LevelId) => id.endsWith("-25");
export const sectionOf = (id: LevelId): 1 | 2 | 3 | 4;
export function levelMode(modeId: ModeId, id: LevelId): GameMode; // GAME_MODES[modeId] ou bossMode(…)
```

Chargement à l'ouverture de l'onglet du mode (spec) ; le JSON du mode courant est donc chargé avant `renderMap`.

### 1.3 `progress.ts` (nouveau)

Fonctions pures (pas de DOM), le script du design fait foi pour la géométrie :

```ts
// Grille virtuelle 16 lignes × 6 colonnes (4 sections × 4 lignes).
// rc("s-n") = [(s-1)*4 + ceil(n/6), ((n-1)%6)+1] ; inverse idAt(r, c).
// neighbors(id) = haut/bas/gauche/droite dans [1..16]×[1..6] — l'adjacence
// inter-sections (1-19↔2-1…) tombe d'elle-même. Le boss est à part.

export type CellState = "hidden" | "disabled" | "active" | "validated";
export interface ModeProgress { validated: Set<LevelId>; }

export function loadProgress(modeId: ModeId): ModeProgress;      // tracemot.progress.<modeId>
export function saveValidated(modeId: ModeId, id: LevelId): void;

export function cellState(p: ModeProgress, id: LevelId): CellState;
// validated : dans p.validated
// active    : non validée ∧ (id === "1-1" ∨ un voisin validé)
// disabled  : un voisin actif ou validé ("isOn")
// hidden    : sinon

export function bossState(p: ModeProgress, s: Section): CellState;
// validated : "s-25" ∈ p.validated
// active    : les 24 normaux de s validés
// disabled  : une case de {s-6, s-12, s-18, s-24} est "on" (validée ou active)
// hidden    : sinon

export function sectionStats(p, s): { validatedCount: number /* boss inclus */, complete: boolean, lastVisibleRow: 0..4, anyVisible: boolean };
export function isModeUnlocked(modeId: ModeId): boolean;  // 5x5 toujours ; sinon un boss quelconque du mode précédent validé
export function nextLockedMode(): ModeId | null;          // premier mode verrouillé après le dernier débloqué (les suivants : cachés)
export function totalValidated(modeId: ModeId): number;
```

Persistance (localStorage, accès try/catch comme aujourd'hui) :

- `tracemot.progress.<modeId>` : `string[]` JSON des identifiants validés.
- `tracemot.lastMode` : onglet à rouvrir.
- `tracemot.seenModes` : `string[]` des modes déjà visités → pastille vermillon sur un onglet débloqué jamais visité. (Petit ajout à la section persistance de la spec : cet état n'est pas dérivable de la progression.)
- Migration : suppression de `tracemot.mode` et `tracemot.difficulty` au boot.

### 1.4 Harnais de vérification

`tools/progress-check.mjs` (même pattern que `solver-check.mjs`, import direct des `.ts`) : rejoue les exemples de référence de la spec — premier lancement, après 1-1, après 1-1…1-6, et l'état de référence complet (51 validés → section 3 conforme au schéma ✔/●/○/·, boss 2-25 actif, 6×6 débloqué). C'est le filet de sécurité de toute la logique de carte.

## Phase 2 — Génération hors-ligne des niveaux

### 2.1 Exposer les tracés de la solution

`solver.ts` : `buildGrid` connaît déjà `paths` (tracé posé de chaque mot) mais `generate()` ne retourne que `{ letters, solution, tries }`. Ajouter `paths: number[][]` au retour (ordre aligné sur `solution`). Aucun autre changement solveur.

### 2.2 `scripts/generate-levels.ts`

Même environnement d'exécution que `tools/solver-check.mjs` (Node important les `.ts` du jeu, lecture des dictionnaires dans `public/`) :

1. Charge dictionnaires + `buildLengthSets` par longueur de mot (5, 6, 7, 8 — partagé entre un mode et son boss, même `wordLength`).
2. Pour chaque mode : 2 générateurs (`createGridGenerator` sur la géométrie normale et sur `bossMode`).
3. Pour chaque section `s` (difficulté `s` ∈ 1..4) : 24 grilles normales (`1..24`) + 1 boss (`s-25`), soit 100 niveaux.
4. **Exigence stricte `issues === 0`** : `generate()` rend la « meilleure grille imparfaite » après `MAX_GRID_TRIES` — le script doit vérifier et relancer tant que la grille a des tracés parasites (avec plafond de relances et rapport d'échec). C'est la pré-vérification de la spec ; le pavage parfait est garanti par construction.
5. Écrit `public/levels/<modeId>.json` (letters en chaîne compacte, tri par id). Ordre de grandeur : ~40 Ko par mode avant gzip — négligeable.
6. Script npm : `"generate:levels": "node scripts/generate-levels.ts"`.

Point d'attention : la convergence du 16×16 corsé (boss du 8×8) est le cas le plus dur pour le solveur — valider les temps de génération avant de fixer les plafonds, quitte à monter `MAX_GRID_TRIES`/`GRID_REPAIRS_PER_WORD` localement dans le script.

## Phase 3 — Écran carte (DOM)

### 3.1 Structure

`index.html` : le header actuel (sélecteurs difficulté/mode/règle) est remplacé par deux états :

- `#map` : overlay plein écran (`position: fixed; inset: 0; overflow-y: auto; z-index` au-dessus du canvas), écran d'accueil. Contenu généré par `map.ts`.
- Header « en partie » : identifiant du niveau (`5×5 · 1-12`), bouton « ← CARTE », chrono existant. Le bouton « ? » (règle) est conservé.

`src/render/map.ts` :

```ts
export function showMap(): void;   // rend + affiche l'overlay, masque le chrome partie
export function hideMap(): void;
export function renderMap(modeId: ModeId): void; // idempotent, re-rendu complet (DOM léger : ~150 nœuds)
export function bindMap(onSelectLevel: (modeId: ModeId, id: LevelId) => void): void; // délégation d'événements sur #map
```

### 3.2 Rendu (tokens extraits du design)

Fond de carte `#EFE9DA` (distinct du papier `#F6F1E7` du jeu — nouvelle variable CSS).

- **Header carte** : « Tracemot » (Source Serif 700), onglets, compteur `N` vermillon + « VALIDÉS » letterspacé. Bordure basse `2px solid #26221C`.
- **Onglets** : actif = fond `#26221C` texte `#F6F1E7` ; débloqué = fond `#FDFBF5` bordure pleine encre, pastille `6px` `#B3402A` si jamais visité ; prochain verrouillé = `border: 1.5px dashed #C1B7A2`, texte `#B9AF9C`, SVG cadenas (repris du design) ; modes au-delà : absents.
- **Accroche** : italique `#4A4438` ; texte alternatif au premier lancement (progression totalement vide).
- **Jalon de section** : filets `1px #C6BCA6` de part et d'autre, nom en italique gras, compteur mono (`« n validés »` en `#8A806C`, `« 25 ✓ »` en vermillon quand complète, boss compris). Rendu dès qu'une case de la section est visible.
- **Grille de section** : CSS grid `repeat(6, 64px)` / lignes `64px`, gap `8px` (desktop) ; `repeat(6, 1fr)`, lignes `53px`, gap `6px` (mobile). Cases par état :

  | État | Fond | Bordure | Ombre | Numéro | Marque |
  | --- | --- | --- | --- | --- | --- |
  | validée | `#E6E8D6` | `1.5px solid #26221C` | `2.5px 2.5px 0 #26221C` | serif 700 21px encre | ✓ vermillon coin bas-droit |
  | active | `#FDFBF5` | idem | idem | idem | — |
  | désactivée | transparent | `1.5px dashed #C6BCA6` | — | mono 400 12px `#B9AF9C` | — |
  | cachée | case rendue vide (transparent, sans bordure) si sa ligne est visible, sinon ligne non rendue | | | | |

  **Croissance additive** : on ne rend que les lignes jusqu'à `lastVisibleRow` (si le boss est visible, les 4 lignes le sont — logique du design : `rows = max(lastVisibleRow, bossVisible ? 4 : 0)`).

- **Boss** : desktop, case `280×280` (= 4×64 + 3×8) accolée à droite du bloc ; mobile, bandeau pleine largeur `64px` sous la grille. Contenu : marque (✓ vermillon si validé, ★ vermillon si actif), « DÉFI » serif 700, sous-titre mono (`10×10 · 20 MOTS DE 5 LETTRES`, dérivé de `bossMode`), mention d'état (`VALIDÉ` / `PRÊT À JOUER` vermillon / `TERMINEZ LES 24 NIVEAUX`). Actif : bordure `2px` + ombre `4px 4px 0` (plus marquées qu'une case normale).
- **Frange de brouillard** : bloc spacer `150px` + gradient absolu bas (`190px` desktop / `150px` mobile, `rgba(239,233,218,0) → #EFE9DA`) portant « · · · LA CARTE CONTINUE · · · » mono `#B9AF9C`.
- **Légende** : 3 pastilles `12px` (validé / jouable / à débloquer) sous la carte, mono `10.5px #8A806C`.
- Bascule desktop/mobile en pur CSS (media query ~`640px`) : le boss existe en deux nœuds (case et bandeau) dont un seul est affiché, pour garder `map.ts` sans logique de viewport.

Interaction : clic sur case `active` ou `validated` (et boss idem) → `onSelectLevel` ; les autres états ne sont pas cliquables (`disabled`, pas de handler). Clic sur onglet débloqué → `renderMap(mode)` + `lastMode`/`seenModes`.

## Phase 4 — Intégration partie

### 4.1 `state.ts`

- `difficulty`, `words`, `fullPrefixes`, `tierWords` sortent de l'état runtime (DEBUG garde son propre chargement, cf. 4.4).
- Ajouts : `currentModeId: ModeId`, `levelId: LevelId | null`.
- `applyMode(modeId)` → `applyLevel(modeId, level)` : pose `state.mode = levelMode(modeId, level.id)` (gère le boss), `state.geometry`, `state.solution = level.words`, `state.letters = [...level.letters]`.

### 4.2 `main.ts`

```
init():
  migrer/purger anciennes clés localStorage
  initScene() + attachInputHandlers({ onCommit, onReplay: rejouer le niveau courant })
  bindMap(startLevel) ; showMap(loadProgress(lastMode ?? "5x5"))
  // plus de loadDictionaries, plus de generator, plus de bind mode/difficulté

startLevel(modeId, id):
  level = (await loadModeLevels(modeId)).levels[id]
  cancelAllGestures() ; applyLevel(...) ; buildBoard() ; rebuildGrid()
  reset du déroulé (found, usedCells, foundPaths, path…) ; renderNewGame() ; renderSceneGrid()
  hideMap() ; header partie ← "5×5 · 1-12" ; startTimer()

triggerWin():
  saveValidated(modeId, levelId)   // idempotent (Set) — le rejeu ne change rien
  renderWin()                      // bouton principal : « RETOUR À LA CARTE »

retour carte (bouton header ou victoire):
  cancelAllGestures() ; stopTimer() ; showMap()  // re-render : nouvelles cases débloquées visibles
```

`startGame` actuel (générateur, difficulté) disparaît ; le rejeu relance `startLevel` sur le même id.

### 4.3 `rules.ts`

```ts
if (word.length !== state.mode.wordLength) return `${…} LETTRES REQUISES`;
if (state.found.includes(word)) return "DÉJÀ TROUVÉ";
if (!state.solution.includes(word)) return "INCORRECTE";
```

Attention aux doublons possibles dans une solution (le solveur les autorise via `canonKey`) : « déjà trouvé » doit comparer les occurrences (`found` compte les occurrences de `word` < occurrences dans `solution`), sinon un mot présent deux fois est refusé à la seconde.

### 4.4 `render.ts` et debug

- Supprimés : `renderModeBar`, `bindModeBar`, `showModeToast`, `renderDifficultyBar`, `bindDifficultyBar`, `showDifficultyToast` (+ HTML/CSS associés).
- `renderWin` : « RETOUR À LA CARTE » en action principale (REJOUER peut rester en secondaire).
- `showRuleOnFirstVisit` : conservé, déclenché au premier lancement d'un niveau.
- DEBUG : `debug.ts` charge lui-même `loadDictionaries` (avec préfixes plafonnés à `state.geometry.cellCount`) au lieu de lire `state.words` — le runtime normal ne télécharge plus aucun dictionnaire.
- Caméra/scène : rien à faire, déjà paramétrées par la géométrie (16×16 OK) ; vérifier seulement `buildBoard` avec 32 lignes de registre (boss 8×8) — comportement scroll du ledger.

## Phase 5 — Nettoyage et vérification

1. `npm run check` (tsc) et `npm run check:solver` (le harnais solveur reste valable, il teste la génération utilisée par le script).
2. `node tools/progress-check.mjs` : exemples de référence de la spec.
3. `npm run generate:levels` : 400 grilles committées, temps de génération relevés.
4. Test manuel de l'état de référence : injecter la progression 51 niveaux de la spec dans localStorage et comparer l'écran au design (desktop 1280 et mobile 390).
5. Purge : imports morts, CSS des sélecteurs, `_IGNORED_PROMPTS.md` intact, `MODE_LABELS.desc` et toasts retirés.

## Ordre de livraison

Chaque phase compile et se teste seule : **1** (modèle + harnais, aucun impact visible) → **2** (script + JSON committés) → **3** (carte rendue en lecture seule par-dessus le jeu actuel, feature-flag temporaire possible) → **4** (bascule du flux de jeu, suppression des sélecteurs) → **5**. Les phases 2 et 3 sont parallélisables après la 1.

## Points ouverts

- **Portée du compteur « N VALIDÉS »** (ouvert dans la spec) : le design compte les validés du mode affiché — 51 dans l'état de référence. (Suggestion : compteur du mode affiché, cohérent avec l'onglet actif et le script du design.)
- **`tracemot.seenModes`** : ajout à la persistance non prévu par la spec, nécessaire pour la pastille « jamais visité ». (Suggestion : l'adopter ; alternative — pastille tant que `progress.<mode>` est vide — fausse dès qu'on visite sans jouer.)
- **Chrono en partie** : la spec ne persiste ni score ni chrono ; le chrono d'affichage actuel est conservé tel quel. (Suggestion : le garder, il ne coûte rien.)
