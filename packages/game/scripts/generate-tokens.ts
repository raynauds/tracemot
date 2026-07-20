// Génère src/theme/tokens.css depuis src/theme/tokens.ts — les variables CSS
// du DOM et les nombres de Pixi sortent ainsi de la MÊME palette. Exécuté par
// Node 22 (les types sont strippés) :
//
//   npm run generate:tokens
//
// Le fichier produit est versionné : le build ne dépend pas de ce script, il
// faut seulement penser à le relancer après avoir touché tokens.ts. Le check
// `--check` échoue si le CSS n'est plus à jour (utile en CI, sans écrire).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  COLORS,
  FONTS,
  RULES,
  SHADOWS_HARD,
  VEILS,
} from "../src/theme/tokens.ts";

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "theme",
  "tokens.css",
);

const decl = (name: string, value: string) => `  --${name}: ${value};`;

const css = `/* FICHIER GÉNÉRÉ — ne pas éditer à la main.
   Source : src/theme/tokens.ts · Régénérer : npm run generate:tokens */

:root {
${Object.entries(COLORS).map(([n, v]) => decl(n, v)).join("\n")}

${Object.entries(FONTS).map(([n, v]) => decl(n, v)).join("\n")}

${Object.entries(RULES).map(([n, v]) => decl(`rule-${n}`, v)).join("\n")}

${Object.entries(VEILS).map(([n, v]) => decl(`veil-${n}`, v)).join("\n")}

${Object.entries(SHADOWS_HARD).map(([n, v]) => decl(`shadow-hard-${n}`, v)).join("\n")}
}
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== css) {
    console.error(
      "tokens.css est périmé : src/theme/tokens.ts a changé.\n" +
        "Lancez « npm run generate:tokens » et committez le résultat.",
    );
    process.exit(1);
  }
  console.log("tokens.css est à jour.");
} else {
  writeFileSync(OUT, css);
  console.log(`${OUT} écrit (${Object.keys(COLORS).length} couleurs).`);
}
