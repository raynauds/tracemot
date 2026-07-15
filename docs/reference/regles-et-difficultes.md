# Règles, progression et difficultés

## Règles

- Relier des lettres voisines (haut, bas, gauche, droite, pas de diagonale), chaque case au plus une fois par tracé.
- Les mots cachés pavent exactement la grille : chaque lettre sert à exactement un mot. Leur nombre et leur longueur dépendent du [mode](fonctionnalites.md) — N mots de N lettres en N×N, quadruplés sur les défis (grille doublée). Un mot validé désactive ses cases, son tracé reste affiché en fantôme.
- Un mot compte s'il appartient à la **solution prégénérée** du niveau et n'a pas déjà été trouvé. Il n'y a pas de dictionnaire au runtime : tout mot traçable hors solution est refusé (`INCORRECTE`), voir `src/game/rules.ts`.
- La partie est gagnée quand tous les mots du niveau sont trouvés. Le jeu n'est pas chronométré.

## Garanties de la grille

Elles sont établies **hors-ligne** à la génération (`@tracemot/studio`), pas au runtime qui fait confiance au JSON figé. Le solveur garantit qu'exactement les mots de la solution sont traçables (à la longueur du mode), vérifié contre le dictionnaire **complet** ; chaque mot n'a qu'un seul tracé possible ; deux mots de la solution diffèrent toujours d'au moins 2 lettres (pas de SALLE/BALLE). Chaque grille est ensuite **re-vérifiée par un énumérateur de tracés indépendant** du solveur avant d'être écrite (`scripts/generate-levels.ts`), et le harnais `npm run check:solver` contrôle ces invariants en masse.

## Progression : sections, défis, étoiles

Un mode = **4 sections × 18 niveaux** (`@tracemot/core/levels.ts`, `src/game/progress.ts`). Une section = 3 lignes de 5 niveaux normaux, chaque ligne close par un **défi** (A/B/C) sur grille doublée. Deux mécanismes seulement :

- une **chaîne** linéaire à l'intérieur d'une section (valider un niveau ouvre le suivant) ;
- une monnaie, l'**étoile** (1 défi validé = 1 étoile), qui ouvre les sections suivantes (coûts 0/1/2/4 étoiles) et, à 3 étoiles, le mode suivant.

Seule la liste des niveaux validés est persistée (`tracemot.progress.<mode>`) ; tout le reste (cases jouables, étoiles, sections et modes débloqués) s'en déduit.

## Difficultés

**La difficulté est une propriété de la section** (section *s* ⇒ difficulté *s*), pas un choix libre : il n'y a plus de sélecteur. Quatre niveaux nommés dosent le vocabulaire des mots cachés, tiré des paliers de vocabulaire enfant, ado et adulte (fichiers disjoints), les quotas étant exprimés en **fraction du nombre de mots du mode** (arrondie au plus proche) pour garder le même sens sur toutes les grilles. Entre parenthèses, l'équivalent sur 5 mots.

- ⭐ **Doux** — uniquement des mots enfant.
- ⭐⭐ **Équilibré** — enfant + ado, 20 à 40 % de mots ado (1 ou 2).
- ⭐⭐⭐ **Relevé** — enfant + ado, 60 à 100 % de mots ado (3 à 5).
- ⭐⭐⭐⭐ **Corsé** — 20 à 40 % de mots ado et autant d'adulte (1 ou 2 de chaque), le reste enfant.

Les quotas exacts sont dans `DIFFICULTY_QUOTAS` (`@tracemot/core`, `packages/core/src/config.ts`), consommés hors-ligne par le générateur.
