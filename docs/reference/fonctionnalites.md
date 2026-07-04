# Fonctionnalités

## Génération de la grille

Découpe en pavage (backtracking randomisé) puis vérification d'exclusivité contre le dictionnaire complet, avec remplacement d'un mot impliqué tant qu'un tracé parasite subsiste. ~30-50 ms par grille en pratique.

## Dictionnaires

Cinq fichiers de mots dans `docs/dictionnaires/` :

- `dictionnaire.txt` - dictionnaire complet, valide les mots joués.
- `1_dico_entree_enfant.txt`, `2_dico_entree_ado.txt`, `3_dico_entree_adulte.txt`, `4_dico_entree_non_connu.txt` - quatre paliers de vocabulaire, disjoints entre eux, d'où sont tirés les mots cachés selon la difficulté.

## Tracé

Au doigt ou à la souris (Pointer Events), avec backtrack, vibration sur mobile et ligne SVG suivant le tracé.

## Registre des mots

Aperçu du tracé en cours, motif de refus affiché (5 lettres requises, déjà trouvé, absent du dictionnaire), animations de validation.

## Mode debug

`DEBUG = true` dans `js/config.js` : liste tous les mots trouvables de la grille, survol pour voir leur tracé.
