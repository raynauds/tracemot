# 07 — Victoire et classement

## Déclenchement

Inchangé sur le fond : `submitWord` qui complète le pavage pose `won = true` en logic, crédite les progressions (doc 03) et fige un **`winSummary`** dans le state (comptes par joueur, première validation, étoile, palier débloqué — doc 02) : l'écran de victoire est une projection pure de `game`, reconstructible après un `stateSync` (rejoin, restart). Le « avant/après » de la première validation n'étant pas recalculable une fois les persisted crédités, il est capturé à cet instant — c'est la raison d'être de `winSummary`. Côté client, le diff détecte `won` et joue la séquence actuelle **différée de `WIN_DELAY_MS`** (timer client — le tampon du dernier mot et le fondu du tracé restent visibles, exigence de la review UX). Tout le monde voit la victoire quasi simultanément (predict-rollback), y compris celui qui n'a pas posé le dernier mot. L'état du niveau gagné (`found`, `winSummary`, `won`) reste en place jusqu'au lancement suivant (machine de phase, doc 02) : le retour carte est un geste purement local.

## Contenu de l'écran (multi)

Structure actuelle conservée (confettis, « Gagné. », « N MOTS TROUVÉS », bloc étoile, actions), plus un **classement** inséré entre le sous-titre et le bloc étoile :

```
   Gagné.
   5 MOTS TROUVÉS           ← total, libellé actuel (5 en 5×5, jusqu'à 32 en défi 8×8)

   ┌──────────────────────────────┐
   │ ① [avatar] Léa        3 mots │   ← teinte du joueur sur le rang/barre
   │ ② [avatar] Moi        1 mot  │
   │ ② [avatar] Sacha      1 mot  │
   │ ④ [avatar] Nour       0 mot  │   ← ex æquo au même rang, rang suivant sauté
   └──────────────────────────────┘

   ★ n/12 …                 ← bloc étoile actuel (défi, première validation)
   [ SUIVANT ]  [ DÉFI ]  [ RETOUR À LA CARTE ]
```

- Tri : nombre de mots décroissant. **Égalité = même rang** (ex æquo, rang suivant sauté) — pas de départage par ordre de validation, le jeu est coopératif (→ Q15b).
- Les joueurs à 0 mot apparaissent (ils étaient là) ; les spectateurs non.
- On n'affiche **pas** les mots trouvés par joueur (spec) — seulement le compte. Le registre, lui, reste teinté par trouveur (doc 05).
- Un joueur parti en cours de partie n'apparaît pas au classement (cohérent avec le non-crédit de progression, doc 03) — ses mots comptent dans le total de la grille mais ne sont attribués à personne au classement (→ Q7b).
- Solo en room : pas de classement (rien à classer), écran actuel tel quel.
- Le bloc étoile (défi gagné pour la première fois *au sens de l'union*) s'affiche chez tout le monde : l'étoile est créditée à tous (doc 03).

Données : `winSummary` (comptes figés à la victoire, première validation, étoile) + identités via `Rune.getPlayerInfo`.

## `Rune.gameOver` : ne pas l'utiliser par niveau

Tension : `Rune.gameOver()` est le mécanisme standard de fin de partie Rune (popup plateforme, scores), mais il **clôt la partie** — incompatible avec la boucle cœur du jeu (victoire → SUIVANT → niveau suivant dans la même room, enchaînement fluide que la review UX valorise).

Recommandation (→ Q20) : **pas de `gameOver` à la fin d'un niveau**. La room est une session de jeu continue sur la carte ; l'écran de victoire maison porte le classement. Rune n'exige nulle part dans sa doc qu'un jeu appelle `gameOver` (aucune exigence review documentée sur ce point non plus — mais la doc ne dit rien dans l'autre sens : zone grise à valider en playtest/review), avec deux replis possibles si Rune l'impose :

- repli 1 : `gameOver({ players: {compte de mots par joueur}, minimizePopUp: true })` — le popup s'affiche **réduit en barre basse**, c'est le mécanisme documenté pour les écrans de fin maison. Nota : `delayPopUp: true` ne donne que quelques secondes de sursis (le popup s'affiche tout seul si `showGameOverPopUp()` n'est jamais appelé) — il sert à laisser finir une animation, pas à retenir le popup jusqu'à une décision du joueur ;
- repli 2 : `gameOver` seulement sur un jalon rare (mode complété).

Attention si repli : `players` doit contenir **tous** les joueurs présents, scores numériques uniquement (pas de mélange statuts/scores), et `gameOver` clôt la partie — l'enchaînement dans la room saute, c'est bien pour ça que c'est un repli.

## Enchaînement

SUIVANT / DÉFI / CONTINUER = `nextChoices(union)` → boutons qui **proposent** (flow « prêt ? », doc 04) — permis par la garde de `proposeLevel` (`phase === "map"` **ou** `won`, doc 02) : pas besoin de repasser par la carte. L'état « en attente des autres » s'affiche par-dessus l'écran de victoire. RETOUR À LA CARTE : local, libre après victoire (aucune action réseau).
