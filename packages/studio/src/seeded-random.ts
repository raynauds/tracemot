// PRNG seedé du script de génération : remplace Math.random(), dans lequel le
// solveur tire tous ses choix (lettres, pavage, mots, réparations).
//
// POURQUOI UN MODULE À PART, IMPORTÉ EN PREMIER — et non trois lignes dans le
// corps de generate-levels.ts : les modules importés sont évalués AVANT le
// corps du module qui les importe. Un `Math.random = …` écrit dans le corps du
// script s'appliquerait donc APRÈS l'évaluation de solver.ts, et ne tiendrait
// que parce que le solveur relit Math.random à chaque appel. Le jour où un
// module figerait la référence (`const rnd = Math.random`) ou tirerait au
// chargement, le corpus deviendrait irreproductible SANS QUE RIEN NE LE DISE :
// les 400 niveaux versionnés changeraient à la régénération suivante.
// Installé ici et importé en tête, le patch précède l'évaluation de tout le
// graphe de modules — l'invariant est tenu par l'ordre d'import, plus par la
// façon dont le solveur lit Math.random.
//
// NE PAS DÉPLACER l'import de ce module dans generate-levels.ts : il doit
// rester la PREMIÈRE déclaration d'import.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32 bits : graine stable dérivée d'une chaîne. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

let rng = mulberry32(1);
Math.random = () => rng();

/**
 * Réamorce le tirage. La graine ne dépend que de `key` : un niveau ne dépend
 * donc que de son identifiant et de son numéro de tirage — régénérer un
 * sous-ensemble (--mode / --section / --only) reproduit exactement les mêmes
 * grilles que le run complet.
 */
export function reseed(key: string): void {
  rng = mulberry32(hashSeed(key));
}
