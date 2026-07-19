# Tracemot

Jeu de lettres dans le navigateur : on trace des mots du doigt ou à la souris sur une grille de 5×5 lettres. Chaque grille cache exactement 5 mots de 5 lettres qui pavent les 25 cases ; la partie est gagnée quand les 5 sont trouvés.

Monorepo npm/TypeScript : `packages/game` (le jeu, PixiJS + Vite), `packages/core` (logique partagée), `packages/studio` (génération des grilles).

## Lancer

```
npm install
npm run dev                # le jeu
npm run generate:levels    # régénérer les grilles
npm run check              # vérifications (tsc, solveur, tokens…)
```

## Documentation

- [Règles et difficultés](docs/reference/regles-et-difficultes.md) - règles du jeu, garanties de la grille, niveaux de difficulté.
- [Fonctionnalités](docs/reference/fonctionnalites.md) - génération de la grille, dictionnaires, tracé, mode debug.
- [Stack et architecture](docs/reference/stack-et-architecture.md) - modules, configuration.
