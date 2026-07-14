// Réglages du jeu. GAME_MODES, DEFAULT_MODE et DEBUG sont faits pour être
// modifiés, le reste décrit la grille et l'interface.

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

function assertPavage(id: string, m: GameMode) {
  if (m.wordCount * m.wordLength !== m.rows * m.cols) {
    throw new Error(
      `Tracemot : mode « ${id} » invalide - ` +
        `${m.wordCount} × ${m.wordLength} ≠ ${m.rows} × ${m.cols}`,
    );
  }
}

for (const id of MODE_ORDER) {
  assertPavage(id, GAME_MODES[id]);
  assertPavage(`${id} (défi)`, defiMode(GAME_MODES[id]));
}

// Mode par défaut : le seul accessible au premier lancement.
export const DEFAULT_MODE: ModeId = "5x5";

// Mode debug : affiche en bas de l'écran tous les mots trouvables dans la
// grille courante - ceux du dictionnaire enfant en vert et en gras.
// Survoler un mot met en évidence son tracé dans la grille.
export const DEBUG = false;

export type Tier = "enfant" | "ado" | "adulte" | "inconnu";
export type Difficulty = 1 | 2 | 3 | 4 | 5;

// Une section d'un mode = une difficulté (section s ⇒ difficulté s). Les
// quatre sections couvrent donc 1..4 ; « Brûlant » (5) reste défini mais
// n'est plus employé par la progression.
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
  5: { ado: [0, 1], adulte: [0.2, 0.4], inconnu: [0.2, 0.4] },
};

// Nom et description de chaque difficulté : titre du jalon de section sur la
// carte (le nom décrit la grille, pas le joueur).
export const DIFFICULTY_LABELS: Record<
  Difficulty,
  { name: string; desc: string }
> = {
  1: { name: "Doux", desc: "Que des mots très courants" },
  2: { name: "Équilibré", desc: "Un ou deux mots moins courants" },
  3: { name: "Relevé", desc: "Une bonne pincée de mots moins courants" },
  4: { name: "Corsé", desc: "Quelques mots recherchés dans le lot" },
  5: { name: "Brûlant", desc: "Une ou deux perles rares dans le lot" },
};

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

// Seuil du panneau debug (findAllWords) : longueur minimale des mots listés.
export const MIN_WORD_LENGTH = 3;
// Durée d'affichage d'un mot refusé (rouge + motif) avant que la ligne
// du registre ne redevienne libre.
export const REJECT_DISPLAY_MS = 2000;

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

// --- Géométrie du monde Pixi (unités « monde », échelle 1) -----------------
// Taille d'une case et espace inter-cases. La grille est rendue à cette
// échelle puis cadrée par la caméra ; aucune valeur écran n'est figée ici.
export const CELL_SIZE = 100;
export const CELL_GAP = 10;
// Marge de vue autour de la grille, en fraction du petit côté de l'écran.
// Règle « à quel point on peut dézoomer et écarter la grille » : au dézoom max,
// la grille laisse VIEW_MARGIN de vide de chaque côté (donc on dézoome plus), et
// cette même marge sert de débattement de pan supplémentaire pour pousser la
// grille hors de l'interface (registre, en-tête…). Monter la valeur = plus de
// marge et de dézoom.
export const VIEW_MARGIN = 0.2;
// Marge (px écran) visée au cadrage d'ouverture « tout voir ». Indépendante de
// VIEW_MARGIN : celle-ci fixe jusqu'où on peut dézoomer, FIT_MARGIN_PX fixe le
// zoom par défaut affiché au chargement (grille cadrée avec ce vide sur le côté
// contraignant, mots trouvés supposé fermé). Le résultat reste borné dans
// [fitScale, maxScale]. Baisser = grille plus grande à l'ouverture.
export const FIT_MARGIN_PX = 24;
// Zoom maximum : on ne voit jamais moins que ZOOM_MAX_CELLS cases de côté.
export const ZOOM_MAX_CELLS = 3;
// Facteur des boutons + / − (zoom discret).
export const ZOOM_STEP = 1.25;
// Pan clavier (flèches / ZQSD-WASD), en px/s.
export const KEY_PAN_SPEED = 900;
// Auto-pan pendant le tracé : bande de bord déclenchante (px) et vitesse
// maximale atteinte au ras du bord (px/s).
export const EDGE_PAN_MARGIN = 64;
export const EDGE_PAN_MAX_SPEED = 700;

// --- Palette numérique (0xRRGGBB) pour Pixi -------------------------------
// Portée depuis style.css : Pixi attend des couleurs numériques.
export const PAPER = 0xf6f1e7;
export const CARD = 0xfdfbf5;
export const CARD_HOVER = 0xf3ecdc;
export const INK = 0x26221c;
export const VERMILION = 0xb3402a;
export const MUTED = 0x6e6656;
export const LINE = 0xd8cfbc;
export const GHOST = 0xb9af9c;
