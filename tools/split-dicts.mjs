// @ts-check
// Génère les dictionnaires filtrés par longueur de mot : pour le dictionnaire
// complet et chaque palier de vocabulaire, et chaque longueur jouée
// (wordLength des GAME_MODES), écrit un fichier suffixé « _NN » ne contenant
// que les mots de NN lettres (voir lengthFile). Ce sont ces fichiers que
// charge le jeu (loadDictionaries) — à relancer si les dictionnaires source
// ou les longueurs des GAME_MODES changent.
// Ex. : 1_dico_entree_enfant_05.txt = mots de 5 lettres du palier enfant.
// L'ordre des fichiers source (triés) est préservé.
//
//   node tools/split-dicts.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { GAME_MODES } from "../src/game/config.ts";
import { FULL_DICT_FILE, TIER_FILES, lengthFile } from "../src/game/dictionary.ts";

// Les dictionnaires vivent dans public/ (servis à la racine par Vite).
const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);

const LENGTHS = [
  ...new Set(Object.values(GAME_MODES).map((m) => m.wordLength)),
].sort((a, b) => a - b);

for (const file of [FULL_DICT_FILE, ...Object.values(TIER_FILES)]) {
  const words = readFileSync(path.join(ROOT, file), "utf8")
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)) // CRLF ou LF
    .filter(Boolean);

  for (const len of LENGTHS) {
    const kept = words.filter((w) => w.length === len);
    const out = lengthFile(file, len);
    writeFileSync(path.join(ROOT, out), kept.join("\n") + "\n");
    console.log(`${out} : ${kept.length} mots`);
  }
}
