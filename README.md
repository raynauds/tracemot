# Tracemot

Jeu de lettres dans le navigateur : on trace des mots du doigt ou à la souris sur une grille de 5×5 lettres. Vanilla JS, HTML, CSS - aucune dépendance, aucun build.

## Règles

- Relier des lettres voisines (haut, bas, gauche, droite - pas de diagonale), chaque case au plus une fois par tracé.
- 5 mots de 5 lettres pavent exactement les 25 cases : chaque lettre sert à exactement un mot. Un mot validé désactive ses cases, son tracé reste affiché en fantôme.
- Un mot compte s'il figure dans le dictionnaire et n'a pas déjà été trouvé.
- La partie est gagnée après 5 mots. Un chrono tourne du début à la victoire.

La grille garantit qu'exactement 5 mots de 5 lettres sont traçables - vérifié contre le dictionnaire **complet**, pas seulement le vocabulaire courant -, que chaque mot n'a qu'un seul tracé possible, et que deux mots de la solution diffèrent toujours d'au moins 2 lettres (pas de SALLE/BALLE).

## Difficultés

Cinq niveaux nommés (chip du header, qui ouvre une feuille sur mobile ou un popover sur desktop) dosent le vocabulaire des mots cachés, tiré de quatre paliers : enfant, ado, adulte, non connu. Changer de niveau relance une grille, confirmé par un toast.

- ⭐ **Doux** - uniquement des mots enfant.
- ⭐⭐ **Équilibré** - enfant + ado, avec exactement 1 ou 2 mots ado.
- ⭐⭐⭐ **Relevé** - enfant + ado, avec 3 à 5 mots ado.
- ⭐⭐⭐⭐ **Corsé** - exactement 1 ou 2 mots ado et 1 ou 2 mots adulte, le reste enfant.
- ⭐⭐⭐⭐⭐ **Brûlant** - exactement 1 ou 2 mots non connus et 1 ou 2 mots adulte, le reste enfant/ado.

La difficulté choisie est mémorisée (`localStorage`).

## Fonctionnalités

- Génération de la grille par découpe en pavage (backtracking randomisé) puis vérification d'exclusivité contre le dictionnaire complet, avec remplacement d'un mot impliqué tant qu'un tracé parasite subsiste. ~30-50 ms par grille en pratique.
- Cinq fichiers de mots dans `docs/dictionnaires/` : `dictionnaire.txt` (complet, valide les mots joués) et quatre paliers de vocabulaire `1_dico_entree_enfant.txt`, `2_dico_entree_ado.txt`, `3_dico_entree_adulte.txt`, `4_dico_entree_non_connu.txt` (mots cachés selon la difficulté).
- Tracé au doigt ou à la souris (Pointer Events), avec backtrack, vibration sur mobile et ligne SVG suivant le tracé.
- Registre des mots : aperçu du tracé en cours, motif de refus affiché (5 lettres requises, déjà trouvé, absent du dictionnaire), animations de validation.
- Mode debug (`DEBUG = true` dans `js/config.js`) : liste tous les mots trouvables de la grille, survol pour voir leur tracé.

## Lancer

Servir le dossier en HTTP (le `fetch` des dictionnaires échoue en `file://`) :

```
python -m http.server
```

Puis ouvrir http://localhost:8000.

## Configuration

Dans `js/config.js` : `WORDS_TO_WIN` (mots pour gagner), `GRID_SIZE`, `DEBUG`, les difficultés (`ENABLED_DIFFICULTIES`, `DEFAULT_DIFFICULTY`, quotas dans `DIFFICULTY_QUOTAS`), et la génération : `FIVE_WORD_LENGTH`, `MAX_FIVE_GRID_TRIES`, `MAX_GRID_REPAIRS`.

## Structure

Modules ES natifs sous `js/`, sans build. `config.js` (réglages), `state.js` (état partagé), `dictionary.js` et `solver.js` (logique pure, sans DOM), `rules.js` (validation d'un mot), `render.js` (tout le DOM), `input.js` (Pointer Events), `debug.js` (chargé si `DEBUG`), `main.js` (orchestration).
