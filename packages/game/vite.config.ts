import rune from "rune-sdk/vite";
import { defineConfig } from "vite";

// base par défaut ('/') : un jeu Rune n'est pas servi sous un sous-chemin
// fixe (contrairement à l'ancien hébergement web) — vérifié au build (jalon
// R1, doc 01-architecture-rune.md).
export default defineConfig({
  plugins: [
    rune({
      // Chemin relatif au cwd (packages/game) : le plugin le résout lui-même
      // via path.resolve, pas besoin des types Node ici.
      logicPath: "./src/logic/logic.ts",
      // À activer si logic.js approche la limite de 1 Mo (doc 01) ; laisse le
      // code lisible en attendant.
      minifyLogic: false,
      ignoredDependencies: [],
    }),
  ],
});
