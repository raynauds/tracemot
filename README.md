# Tracemot

Jeu de lettres dans le navigateur : on trace des mots du doigt ou à la souris sur une grille de 5×5 lettres. Chaque grille cache exactement 5 mots de 5 lettres qui pavent les 25 cases ; la partie est gagnée quand les 5 sont trouvés. Quatre niveaux de difficulté dosent le vocabulaire, de Doux à Corsé.

Vanilla JS, HTML, CSS - aucune dépendance, aucun build.

## Lancer

Servir le dossier en HTTP (le `fetch` des dictionnaires échoue en `file://`) :

```
python -m http.server
```

Puis ouvrir http://localhost:8000.

## Documentation

- [Règles et difficultés](docs/reference/regles-et-difficultes.md) - règles du jeu, garanties de la grille, niveaux de difficulté.
- [Fonctionnalités](docs/reference/fonctionnalites.md) - génération de la grille, dictionnaires, tracé, mode debug.
- [Stack et architecture](docs/reference/stack-et-architecture.md) - modules JS, configuration.
