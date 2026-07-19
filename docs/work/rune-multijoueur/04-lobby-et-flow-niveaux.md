# 04 — Lobby et flow des niveaux

## Navigation : locale, lancement : synchronisé

La carte reste un écran **local** : chacun navigue librement entre onglets de mode et sections (→ Q10). Seul le **lancement d'un niveau** est un événement de room. C'est la coupure la plus simple et elle préserve l'usage solo de la carte.

En phase `playing`, un joueur qui rouvre la carte (bouton retour) : recommandation — le retour carte **après victoire** est libre et purement local (fermer l'overlay de victoire ; l'état du niveau gagné reste en place côté logic jusqu'au lancement suivant, cf. machine de phase doc 02), et **en cours de partie** il vaut abandon collectif donc passe par un consentement : une **proposition d'abandon** (`proposal.kind = "abandon"`, action `proposeAbandon`) soumise au même vote que les niveaux (→ Q13). L'alternative « chacun peut aller voir la carte pendant que les autres jouent » multiplie les états d'écran par joueur pour un gain faible.

## Machine à états du vote

```
                    proposeLevel(m, id)
   [pas de proposition] ───────────────▶ [proposition ouverte]
                                          proposal = {modeId, levelId, proposedBy,
                                                      accepted: [proposedBy]}
        ▲                                     │
        │  answerProposal(false)              │ answerProposal(true)
        │  proposal = null                    │ accepted += playerId
        │  lastRefusal = {by, kind, seq+1}    │
        │                                     ▼
        ├──────────────────────── [accepted == playerIds] → lancement
        │                                 phase = playing, reset partie
        │                                 (kind "abandon" : phase = map)
        │
        │  cancelProposal (proposeur) — sans lastRefusal
        │  update() : gameTime - openedAt > 30 s → expire, snackbar « sans réponse »
        └── (idem si playerLeft du proposeur)
```

Règles :

- **Qui propose** : n'importe quel joueur, dès qu'aucune proposition n'est ouverte (→ Q10). Une proposition en cours bloque les autres (`invalidAction`) — pas de file d'attente en v1. Course de deux `proposeLevel` quasi simultanés (predict-rollback) : chacun voit sa proposition en optimiste ; le perdant à l'ordre serveur est rollback — son overlay d'attente est remplacé par le prompt de vote du gagnant, avec une snackbar discrète « X a proposé en premier » (détection dans `diff.ts`, doc 02).
- **Unanimité des joueurs actifs** requise (→ Q11). Un `playerLeft` pendant le vote : si le partant est le **proposeur**, la proposition est annulée (sans snackbar « a refusé ») ; sinon il est retiré du décompte — l'unanimité peut être atteinte par ce départ (réévaluation dans l'event). Attention à la **grâce de reconnexion Rune (~30 s)** : un joueur déconnecté reste « présent » jusqu'à expiration — il peut bloquer un vote pendant ce laps ; c'est le timeout ci-dessous qui borne l'attente.
- **Refus** : ferme la proposition pour tout le monde. Chez les votants en attente et le proposeur : l'overlay « en attente des autres » se ferme, remplacé par la snackbar « X a refusé » (`Rune.getPlayerInfo(by).displayName`). Chez le refuseur : son prompt se ferme, sans snackbar (→ Q11b). Reproposition libre immédiatement.
- **Annulation** : le proposeur annule via l'action dédiée `cancelProposal` (pas de `lastRefusal`, donc pas de snackbar « a refusé »).
- **Timeout** : une proposition sans unanimité au bout de **~30 s expire** (→ Q11c), snackbar « sans réponse » (variante du refus). Mécanisme : une action ne peut pas faire expirer quoi que ce soit d'elle-même — c'est le callback `update()` de logic (tick 1/s, `Rune.gameTime()` vs `proposal.openedAt`) qui s'en charge (doc 02).
- **Solo en room** (1 joueur actif) : `proposeLevel` lance directement, sans étape de vote — le jeu se comporte comme l'actuel.
- **Rejouer un niveau déjà validé** : autorisé comme en solo, même flow de vote (→ Q17) — la garde de `proposeLevel` accepte `active` **et** `validated` (le prédicat « jouable » de la carte).

## UI

- **Proposeur** : clic sur une case jouable de la carte → la case passe en état « proposé » et un overlay léger « En attente des autres… » avec la liste des joueurs et leur statut (accepté / en attente), bouton ANNULER (action `cancelProposal` — sans snackbar « a refusé »).
- **Les autres** : prompt par-dessus l'écran courant (carte ou victoire) : « <Avatar> X propose *5×5 · 1-12* — PRÊT ? / PAS MAINTENANT ». Le libellé du niveau réutilise `levelLabel`. Le prompt doit être posable par-dessus n'importe quel écran local (z-index au-dessus de map/home/win, sous status).
- **Snackbar** : composant neuf (rien n'existe). Sur les tokens du design system : fond `card`, filet `--rule-heavy`, ombre dure, texte mono, auto-dismiss ~4 s + swipe. `prefers-reduced-motion` respecté (apparition sans glissement). Réutilisable pour « déjà trouvé » (doc 05) et les arrivées/départs de joueurs.
- **Écrans en retard** : un joueur encore sur l'écran de victoire quand un autre propose depuis la carte reçoit le même prompt ; l'acceptation générale bascule tout le monde en partie (`phase` change → transitions pilotées par le diff, quel que soit l'écran local).

## Enchaînement depuis la victoire

Les boutons SUIVANT / DÉFI / CONTINUER (issus de `nextChoices` sur l'union) ne lancent plus : ils **proposent** (`proposeLevel`) et rejoignent le flow ci-dessus (→ Q13). Le vote unanime des présents remplace le tap unique. RETOUR À LA CARTE reste local après victoire.

## Arrivées et départs

- `playerJoined` en phase `playing` : le joueur reçoit tout par `stateSync`, sa scène se construit sur la grille en cours, il joue immédiatement (→ Q12). Son entrée recalcule l'union → la carte des autres peut gagner des accès (visible au prochain affichage de la carte).
- `playerJoined` pendant un vote : il est ajouté au décompte requis (unanimité des présents au moment du lancement). Simple et cohérent ; alternative (il ne vote pas) en Q12b.
- `playerLeft` en partie : ses tracés disparaissent, ses mots restent. La partie continue (le pavage reste finissable : les mots sont à tout le monde). Rappel grâce de reconnexion : entre la coupure et le `playerLeft` (~30 s), son tracé reste figé dans le state — le client estompe tout tracé distant muet depuis ~5 s (doc 05).
