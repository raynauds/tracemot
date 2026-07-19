// @ts-check
// Vérifie l'invariant de pavage (wordCount × wordLength === rows × cols) pour
// chaque mode et son format défi. Cette vérification vivait en throw
// top-level dans config.ts : un throw au chargement du module planterait
// l'init de la VM logic Rune sans catch possible (doc 01, mise en conformité
// #2). Déplacée ici, elle est exécutée par "npm run check" plutôt que par le
// simple import du module.
//
//   node tools/check-pavage.mjs

import {
  GAME_MODES,
  MODE_ORDER,
  assertPavage,
  defiMode,
} from "../src/config.ts";

let failures = 0;
for (const id of MODE_ORDER) {
  try {
    assertPavage(id, GAME_MODES[id]);
    assertPavage(`${id} (défi)`, defiMode(GAME_MODES[id]));
  } catch (err) {
    failures++;
    console.error(`  ÉCHEC : ${err instanceof Error ? err.message : err}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log(`Pavage des ${MODE_ORDER.length} modes (normal + défi) : OK`);
