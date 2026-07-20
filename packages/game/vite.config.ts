import rune from "rune-sdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Chemins relatifs ('./assets/...') : Rune sert le jeu sous un sous-chemin
  // CDN, une base absolue ('/') fait 404 la CSS et les modulepreloads — même
  // réglage que le template officiel `rune create`.
  base: "",
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
