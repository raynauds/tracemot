# Stack et architecture

## Stack

Vanilla JS, HTML, CSS. Modules ES natifs, aucune dépendance, aucun build. Seules ressources externes : les polices Google Fonts (Source Serif 4, IBM Plex Mono).

## Modules

Tout le code vit sous `js/` :

- `config.js` - réglages.
- `state.js` - état partagé.
- `dictionary.js` et `solver.js` - logique pure, sans DOM (chargement des dictionnaires, génération et résolution de la grille).
- `rules.js` - validation d'un mot.
- `render.js` - tout le DOM.
- `input.js` - Pointer Events.
- `debug.js` - chargé si `DEBUG`.
- `main.js` - orchestration.

## Configuration

Tous les réglages sont dans `js/config.js` :

- `WORDS_TO_WIN` - nombre de mots pour gagner.
- `GRID_SIZE` - taille de la grille.
- `DEBUG` - active le mode debug (voir [fonctionnalites.md](fonctionnalites.md)).
- Difficultés : `ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY`, quotas par palier dans `DIFFICULTY_QUOTAS`.
- Génération : `FIVE_WORD_LENGTH`, `MAX_FIVE_GRID_TRIES`, `MAX_GRID_REPAIRS`.
