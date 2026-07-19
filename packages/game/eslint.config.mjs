// Setup ESLint minimal : le repo n'a pas d'ESLint ailleurs, celui-ci ne cible
// que src/logic/ (le seul dossier soumis aux contraintes de déterminisme
// Rune — doc 01-architecture-rune.md). "logicModule" (et non "recommended")
// car src/logic/ est prévu multi-fichiers (types.ts, board.ts, progression.ts,
// lobby.ts...) qui s'importent entre eux : la variante "recommended" interdit
// tout import/export dans un fichier logic.
import tsParser from "@typescript-eslint/parser";
import runePlugin from "rune-sdk/eslint.js";

const { logicModule } = runePlugin.configs;

export default [
  {
    files: ["src/logic/**/*.ts"],
    languageOptions: {
      ...logicModule.languageOptions,
      parser: tsParser,
    },
    plugins: logicModule.plugins,
    rules: logicModule.rules,
  },
];
