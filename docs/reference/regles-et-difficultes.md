# Règles et difficultés

## Règles

- Relier des lettres voisines (haut, bas, gauche, droite, pas de diagonale), chaque case au plus une fois par tracé.
- 5 mots de 5 lettres pavent exactement les 25 cases : chaque lettre sert à exactement un mot. Un mot validé désactive ses cases, son tracé reste affiché en fantôme.
- Un mot compte s'il figure dans le dictionnaire et n'a pas déjà été trouvé.
- La partie est gagnée après 5 mots. Un chrono tourne du début à la victoire.

## Garanties de la grille

La grille garantit qu'exactement 5 mots de 5 lettres sont traçables, vérifié contre le dictionnaire **complet**, pas seulement le vocabulaire courant. Chaque mot n'a qu'un seul tracé possible, et deux mots de la solution diffèrent toujours d'au moins 2 lettres (pas de SALLE/BALLE).

## Difficultés

Cinq niveaux nommés dosent le vocabulaire des mots cachés, tiré de quatre paliers : enfant, ado, adulte, non connu.

- ⭐ **Doux** - uniquement des mots enfant.
- ⭐⭐ **Équilibré** - enfant + ado, avec exactement 1 ou 2 mots ado.
- ⭐⭐⭐ **Relevé** - enfant + ado, avec 3 à 5 mots ado.
- ⭐⭐⭐⭐ **Corsé** - exactement 1 ou 2 mots ado et 1 ou 2 mots adulte, le reste enfant.
- ⭐⭐⭐⭐⭐ **Brûlant** - exactement 1 ou 2 mots non connus et 1 ou 2 mots adulte, le reste enfant/ado.

Le niveau se change depuis la chip du header, qui ouvre une feuille sur mobile ou un popover sur desktop. Changer de niveau relance une grille, confirmé par un toast. La difficulté choisie est mémorisée (`localStorage`).

Les quotas exacts par niveau sont dans `DIFFICULTY_QUOTAS` (`js/config.js`), voir [stack-et-architecture.md](stack-et-architecture.md).
