// Domaine partagé (@traceword/core) : dimensions des modes, barèmes de
// difficulté et paramètres du solveur. GAME_MODES et DEFAULT_MODE sont faits
// pour être modifiés, le reste décrit la grille. Aucune dépendance au thème,
// au DOM ou à Pixi — la présentation (couleurs, métriques caméra) vit côté
// jeu (packages/game/src/game/config.ts).

export type GameMode = {
  rows: number;
  cols: number;
  wordLength: number;
  wordCount: number;
};

// Série N×N : un mode = N mots de N lettres sur une grille N×N. L'identifiant
// du mode EST sa forme (« 5x5 »), et MODE_ORDER fixe l'ordre de déblocage :
// le mode N+1 s'ouvre quand le mode N compte 3 ÉTOILES, une étoile étant un
// défi validé (cf. progress.ts).
export type ModeId = "5x5" | "6x6" | "7x7" | "8x8";
export const MODE_ORDER: ModeId[] = ["5x5", "6x6", "7x7", "8x8"];

// Le pavage parfait exige wordCount × wordLength = rows × cols (validé
// ci-dessous). Tout le reste (registre, compteur, condition de victoire,
// caméra, solveur) dérive du mode actif.
export const GAME_MODES: Record<ModeId, GameMode> = {
  "5x5": { rows: 5, cols: 5, wordLength: 5, wordCount: 5 },
  "6x6": { rows: 6, cols: 6, wordLength: 6, wordCount: 6 },
  "7x7": { rows: 7, cols: 7, wordLength: 7, wordCount: 7 },
  "8x8": { rows: 8, cols: 8, wordLength: 8, wordCount: 8 },
};

// Format « défi » (le niveau qui clôt une ligne de la carte, et rapporte une
// étoile) : la grille double de côté et le nombre de mots quadruple, à longueur
// de mot constante. Le pavage tient par construction (4N mots de N lettres =
// (2N)² cases), mais le garde-fou ci-dessous le vérifie quand même : c'est
// l'invariant central du solveur, on ne le laisse pas reposer sur une lecture
// d'algèbre.
export function defiMode(m: GameMode): GameMode {
  return {
    rows: m.rows * 2,
    cols: m.cols * 2,
    wordLength: m.wordLength,
    wordCount: m.wordCount * 4,
  };
}

// Pure : ne fait que vérifier, ne throw plus au chargement du module (un throw
// top-level planterait l'init de la VM logic Rune sans catch possible, doc 01
// § mise en conformité #2). Le garde-fou est exécuté par tools/check-pavage.mjs,
// appelé par "npm run check" — pas par l'import de ce module.
export function assertPavage(id: string, m: GameMode): void {
  if (m.wordCount * m.wordLength !== m.rows * m.cols) {
    throw new Error(
      `Traceword : mode « ${id} » invalide - ` +
        `${m.wordCount} × ${m.wordLength} ≠ ${m.rows} × ${m.cols}`,
    );
  }
}

// Mode par défaut : le seul accessible au premier lancement.
export const DEFAULT_MODE: ModeId = "5x5";

export type Tier = "enfant" | "ado" | "adulte" | "inconnu";
export type Difficulty = 1 | 2 | 3 | 4;

// Une section d'un mode = une difficulté (section s ⇒ difficulté s) : les
// quatre sections couvrent l'ensemble des difficultés.
export type Section = 1 | 2 | 3 | 4;

// Difficultés (nombre d'étoiles). Chaque niveau fixe la composition des
// mots cachés parmi les quatre paliers de vocabulaire : bornes [min, max]
// en FRACTION du nombre de mots du mode (arrondies au plus proche par le
// solveur) pour les paliers « ado », « adulte » et « inconnu », le reste
// venant du palier « enfant ». Sur 5 mots, 0.2 = 1 mot ; le barème reste
// cohérent quel que soit wordCount. Utilisé hors runtime, par le script de
// génération des niveaux.
export const DIFFICULTY_QUOTAS: Record<
  Difficulty,
  {
    ado: [number, number];
    adulte: [number, number];
    inconnu: [number, number];
  }
> = {
  1: { ado: [0, 0], adulte: [0, 0], inconnu: [0, 0] },
  2: { ado: [0.2, 0.4], adulte: [0, 0], inconnu: [0, 0] },
  3: { ado: [0.6, 1], adulte: [0, 0], inconnu: [0, 0] },
  4: { ado: [0.2, 0.4], adulte: [0.2, 0.4], inconnu: [0, 0] },
};

// Les libellés des difficultés (rangs Bronze→Platine et descriptions) sont de
// la présentation pure : ils vivent côté client, traduits par Rune.t
// (packages/game/src/render/i18n.ts) — core et logic ne manipulent que le
// code (Difficulty/Section).

// Tentatives complètes (choix des mots + placement + réparations +
// vérification) avant de rendre la meilleure grille imparfaite rencontrée.
export const MAX_GRID_TRIES = 250;
// Rondes de réparation locale par tentative, PAR MOT de la solution
// (remplacement d'un mot impliqué dans un tracé parasite) : le budget total
// suit le nombre de mots du mode — 12 × 5 = 60 rondes en 5×5, 240 en 10×10.
export const GRID_REPAIRS_PER_WORD = 12;
// Mots de remplacement essayés par ronde de réparation : celui qui laisse
// le moins de tracés parasites est retenu (hill-climbing). Indispensable
// aux grandes grilles, où un remplacement aveugle ne converge pas.
export const REPAIR_CANDIDATES = 8;

// Pondération des lettres selon leur fréquence en français (Q volontairement rare).
export const LETTER_WEIGHTS: Record<string, number> = {
  A: 76,
  B: 9,
  C: 33,
  D: 37,
  E: 145,
  F: 11,
  G: 9,
  H: 9,
  I: 75,
  J: 5,
  K: 1,
  L: 55,
  M: 30,
  N: 71,
  O: 54,
  P: 30,
  Q: 4,
  R: 66,
  S: 79,
  T: 72,
  U: 63,
  V: 16,
  W: 1,
  X: 4,
  Y: 3,
  Z: 2,
};
