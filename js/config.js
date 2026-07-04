// @ts-check
// Réglages du jeu. WORDS_TO_WIN et DEBUG sont faits pour être modifiés,
// le reste décrit la grille et l'interface.

// Nombre de mots à trouver pour gagner. Modifiez cette valeur pour
// expérimenter : elle pilote le nombre de lignes de la liste, le
// compteur « n / N », la condition de victoire et le seuil de
// solvabilité exigé lors de la génération de la grille.
export const WORDS_TO_WIN = 5;

// Mode debug : affiche en bas de l'écran tous les mots trouvables dans la
// grille courante - ceux du dictionnaire enfant en vert et en gras.
// Survoler un mot met en évidence son tracé dans la grille.
export const DEBUG = false;

/** @typedef {"enfant"|"ado"|"adulte"|"inconnu"} Tier */
/** @typedef {1|2|3|4|5} Difficulty */

// Difficultés (nombre d'étoiles). Chaque niveau fixe la composition des
// mots cachés parmi les quatre paliers de vocabulaire : bornes [min, max]
// du nombre de mots tirés dans les paliers « ado », « adulte » et
// « inconnu », le reste venant du palier « enfant ».
/** @type {Record<Difficulty, {ado: [number, number], adulte: [number, number], inconnu: [number, number]}>} */
export const DIFFICULTY_QUOTAS = {
  1: { ado: [0, 0], adulte: [0, 0], inconnu: [0, 0] },
  2: { ado: [1, 2], adulte: [0, 0], inconnu: [0, 0] },
  3: { ado: [3, 5], adulte: [0, 0], inconnu: [0, 0] },
  4: { ado: [1, 2], adulte: [1, 2], inconnu: [0, 0] },
  5: { ado: [0, 5], adulte: [1, 2], inconnu: [1, 2] },
};
/** @type {Difficulty} */
export const DEFAULT_DIFFICULTY = 1;
// Difficultés accessibles dans l'interface (au moins une). Retirez des
// entrées pour restreindre le jeu. Avec une seule difficulté accessible,
// le sélecteur (chip du header) disparaît entièrement.
/** @type {Difficulty[]} */
export const ENABLED_DIFFICULTIES = [1, 2, 3, 4, 5];

// Nom et description de chaque difficulté : chip du header, lignes de la
// feuille de sélection et toast de confirmation.
/** @type {Record<Difficulty, {name: string, desc: string}>} */
export const DIFFICULTY_LABELS = {
  1: { name: "Doux", desc: "Que des mots très courants" },
  2: { name: "Équilibré", desc: "Un ou deux mots moins courants" },
  3: { name: "Relevé", desc: "Une bonne pincée de mots moins courants" },
  4: { name: "Corsé", desc: "Quelques mots recherchés dans le lot" },
  5: { name: "Brûlant", desc: "Une ou deux perles rares dans le lot" },
};

// Durée d'affichage du toast confirmant un changement de difficulté.
export const DIFFICULTY_TOAST_MS = 2000;

// Longueur imposée des mots. Le pavage parfait exige
// WORDS_TO_WIN × FIVE_WORD_LENGTH = CELL_COUNT.
export const FIVE_WORD_LENGTH = 5;
// Tentatives complètes (choix des mots + placement + réparations +
// vérification) avant de rendre la meilleure grille imparfaite rencontrée.
export const MAX_FIVE_GRID_TRIES = 250;
// Rondes de réparation locale par tentative : redistribution d'une lettre
// de remplissage ou remplacement d'un mot impliqué dans un tracé parasite.
export const MAX_GRID_REPAIRS = 60;

// Seuil du panneau debug (findAllWords) : longueur minimale des mots listés.
export const MIN_WORD_LENGTH = 3;
export const GRID_SIZE = 5;
// Durée d'affichage d'un mot refusé (rouge + motif) avant que la ligne
// du registre ne redevienne libre.
export const REJECT_DISPLAY_MS = 2000;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

// Pondération des lettres selon leur fréquence en français (Q volontairement rare).
/** @type {Record<string, number>} */
export const LETTER_WEIGHTS = {
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

/** @type {Record<number, string>} */
export const FR_NUMBERS = {
  1: "un",
  2: "deux",
  3: "trois",
  4: "quatre",
  5: "cinq",
  6: "six",
  7: "sept",
  8: "huit",
  9: "neuf",
  10: "dix",
};
