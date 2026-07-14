# Règles et difficultés

## Règles

- Relier des lettres voisines (haut, bas, gauche, droite, pas de diagonale), chaque case au plus une fois par tracé.
- Les mots cachés pavent exactement la grille : chaque lettre sert à exactement un mot. Leur nombre et leur longueur dépendent du [mode de jeu](fonctionnalites.md) — 5 mots de 5 lettres en 5×5, 20 mots de 5 lettres en 20×5, 8 mots de 8 lettres en 8×8. Un mot validé désactive ses cases, son tracé reste affiché en fantôme.
- Un mot compte s'il figure dans le dictionnaire et n'a pas déjà été trouvé.
- La partie est gagnée quand tous les mots du mode sont trouvés. Un chrono tourne du début à la victoire.

## Garanties de la grille

La grille garantit qu'exactement les mots de la solution sont traçables (à la longueur du mode), vérifié contre le dictionnaire **complet**, pas seulement le vocabulaire courant. Chaque mot n'a qu'un seul tracé possible, et deux mots de la solution diffèrent toujours d'au moins 2 lettres (pas de SALLE/BALLE).

## Difficultés

Cinq niveaux nommés dosent le vocabulaire des mots cachés, tiré de quatre paliers : enfant, ado, adulte, non connu. Les quotas sont exprimés en **fraction du nombre de mots du mode** (arrondie au plus proche) : ils gardent le même sens sur toutes les grilles. Entre parenthèses, l'équivalent sur les 5 mots du mode 5×5.

- ⭐ **Doux** - uniquement des mots enfant.
- ⭐⭐ **Équilibré** - enfant + ado, avec 20 à 40 % de mots ado (1 ou 2).
- ⭐⭐⭐ **Relevé** - enfant + ado, avec 60 à 100 % de mots ado (3 à 5).
- ⭐⭐⭐⭐ **Corsé** - 20 à 40 % de mots ado et autant de mots adulte (1 ou 2 de chaque), le reste enfant.
- ⭐⭐⭐⭐⭐ **Brûlant** - 20 à 40 % de mots non connus et autant de mots adulte (1 ou 2 de chaque), le reste enfant/ado.

Le niveau se change depuis la chip du header, qui ouvre une feuille sur mobile ou un popover sur desktop. Changer de niveau relance une grille, confirmé par un toast. La difficulté choisie est mémorisée (`localStorage`).

Les quotas exacts par niveau sont dans `DIFFICULTY_QUOTAS` (`src/game/config.ts`), voir [stack-et-architecture.md](stack-et-architecture.md).
