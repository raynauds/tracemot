# Traceword

Jeu de lettres pour la plateforme [Rune](https://developers.rune.ai) (webview dans l'app mobile) : on trace des mots au doigt sur une grille de lettres (5×5 à 8×8 selon le mode). Chaque grille cache N mots de N lettres qui pavent toutes les cases ; la partie est gagnée quand tous sont trouvés. Jouable seul ou en coopération à 2-4 : progression partagée, tracés des autres en temps réel, classement de fin.

Monorepo npm/TypeScript : `packages/game` (le jeu : logique Rune déterministe `src/logic/` + client PixiJS `src/client/`), `packages/core` (logique partagée), `packages/studio` (génération des grilles).

## Lancer

```
npm install
npm run dev                # le jeu dans le Dev UI Rune (multi-instances, latence simulée)
npm run generate:levels    # régénérer les grilles
npm run check              # vérifications (tsc, lint logic Rune, solveur, tokens…)
npm run build              # build d'upload (npx rune@latest upload)
```

## Documentation

- [Règles et difficultés](docs/reference/regles-et-difficultes.md) - règles du jeu, garanties de la grille, niveaux de difficulté.
- [Fonctionnalités](docs/reference/fonctionnalites.md) - génération de la grille, dictionnaires, tracé, mode debug.
- [Stack et architecture](docs/reference/stack-et-architecture.md) - modules, configuration.
- [Attributions](docs/ATTRIBUTIONS.md) - licences des sons et assets (à reporter dans la description du Dev Dashboard).
