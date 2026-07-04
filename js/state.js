// @ts-check
// État centralisé de la partie. main.js écrit le déroulement, render.js
// et input.js le lisent (input.js ne modifie que path et pointerId).

export const state = {
  ready: false, // dictionnaires chargés et partie en place
  /** @type {import("./config.js").Difficulty} Difficulté courante (étoiles). */
  difficulty: 1,
  /** @type {string[]} Mots cachés de la grille. */
  solution: [],
  /** @type {{candidates: Record<import("./config.js").Tier, string[]>, words5: Set<string>, prefixes5: Set<string>}|null}
   *  Sous-ensembles « 5 lettres » des dictionnaires, construits au premier
   *  lancement de partie. */
  five: null,
  /** @type {Set<string>} Tous les mots (validation des tracés). */
  words: new Set(),
  /** @type {Set<string>} Préfixes du dictionnaire complet (mode debug uniquement). */
  fullPrefixes: new Set(),
  /** @type {Record<import("./config.js").Tier, Set<string>>}
   *  Mots des quatre paliers de vocabulaire (choix des mots cachés). */
  tierWords: {
    enfant: new Set(),
    ado: new Set(),
    adulte: new Set(),
    inconnu: new Set(),
  },
  /** @type {string[]} Les 25 lettres de la grille courante. */
  letters: [],
  /** @type {number[]} Indices des cases du tracé en cours. */
  path: [],
  /** @type {number|null} Pointeur actif (les autres doigts sont ignorés). */
  pointerId: null,
  /** @type {string[]} */
  found: [],
  /** @type {Set<number>} Cases consommées par les mots trouvés (chaque
   *  lettre sert à un seul mot, elle est désactivée une fois utilisée). */
  usedCells: new Set(),
  /** @type {number[][]} Tracés des mots trouvés : le trait reste affiché
   *  en fantôme pour pouvoir relire les mots sur la grille. */
  foundPaths: [],
  /** @type {number|null} Timeout d'effacement du dernier mot refusé. */
  rejectTimer: null,
  won: false,
  gridTries: 0, // tirages de grilles avant d'en obtenir une valide (debug)
  startTime: 0,
  /** @type {number|null} */
  timerId: null,
};
