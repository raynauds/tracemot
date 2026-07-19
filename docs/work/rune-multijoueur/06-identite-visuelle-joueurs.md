# 06 — Identité visuelle des joueurs

## Le conflit avec la direction artistique

`DESIGN.md` est explicite et jusqu'ici non négocié : papier/encre/vermillon, **le vermillon est la seule couleur d'accent** (« si un élément est vermillon, c'est qu'il est gagné »), interdiction d'introduire une seconde couleur d'accent sans justification. Le multijoueur *est* cette justification : il faut identifier jusqu'à 3 autres joueurs. C'est la décision de design la plus lourde du portage (→ Q18) ; elle doit finir **documentée dans DESIGN.md** comme dérogation cadrée, pas comme une exception sauvage.

## Proposition : « encres d'autres mains »

Principe : le joueur local garde exactement la sémantique actuelle — repos = card, engagé = **encre**, acquis = **vermillon**. Les autres joueurs reçoivent chacun une **encre colorée sourde**, désaturée, de même valeur tonale que l'encre : des couleurs de *stylo*, pas d'interface. Le vermillon reste hors palette joueurs, réservé à la récompense (→ Q18b).

Palette : **4 slots** — l'assignation est globale et il peut y avoir 4 joueurs, donc 4 encres sont nécessaires pour que deux joueurs ne partagent jamais une teinte (à 3 slots, un tiers verrait deux « autres » indistincts). Chaque écran n'en **affiche** au plus que 3 (on ne se voit pas soi-même). À valider sur écran, contraste AA sur `paper`/`card` :

```
--player-1: #2f5a6b   (encre bleu pétrole)
--player-2: #5b4a78   (encre violette)
--player-3: #4f6b3a   (encre olive)
--player-4: #7d5a2a   (encre ocre brûlée)
```

- Déclinaisons par usage, par joueur : trait (100 %), trait « léger » du tracé en cours distant (alpha ~0.45), fond de case (~12 % sur card), texte/numéro (100 % sur paper — vérifier AA).
- Implémentation dans `theme/tokens.ts` (source unique) → `tokens.css` regénéré + `hex()` Pixi, comme le reste de la palette. Aucun littéral en dur.
- **Attribution globale et stable** : `colorSlots: Record<PlayerId, 0|1|2|3>` **stocké dans le state** (doc 02) et maintenu par `playerJoined`/`playerLeft` — premier slot libre à l'arrivée, libéré au départ. Stocké (et non dérivé de `playerIds`) précisément pour rester stable aux départs/retours. La couleur de X est identique sur tous les écrans (utile en vocal : « le violet, là »).
- Le joueur local n'affiche **pas** son propre slot : il est « l'encre », les autres sont « les encres colorées ». Chaque joueur vit la même asymétrie — c'est le modèle spec (« je vois CASS de manière plus légère avec la teinte du joueur »).

## Teinte seule ≠ identification : la pastille avatar

La spec le dit : « on doit être en mesure d'identifier facilement le joueur concerné ». Trois couleurs sourdes ne suffisent pas seules (daltonisme, mémorisation). Recommandation (→ Q19) : **teinte + pastille avatar Rune** partout où un élément appartient à un joueur — Rune fournit `Rune.getPlayerInfo(playerId)` → `avatarUrl`/`displayName`, et réutiliser les avatars est une best practice plateforme.

| Surface | Traitement |
|---|---|
| Tracé en cours distant | trait teinte alpha 0.45 + pastille avatar (cerclée de la teinte) sur la case de tête |
| Cases sous tracé distant | fond teinte ~12 % (mon `sel`/`head` garde priorité) |
| Mot validé — grille | tracé fantôme dans la teinte du trouveur ; mes mots : fantôme actuel (vermillon/ghost) |
| Mot validé — registre | numéro `.word-num` teinté + mini pastille avatar en tête de ligne ; mes mots : vermillon sans pastille |
| Carte — « débloqué via autrui » (doc 03) | badge **neutre** « grâce à la room » : coin de case replié + entrée de légende (`buildLegend`), sans attribution nominative — l'union peut venir de plusieurs joueurs, le détail par joueur n'apporte rien (→ Q9) |
| Prompt « prêt ? », snackbar refus, classement | avatar + `displayName` systématiques |
| Écran de victoire | classement avec avatar, nom, compte de mots, barre/numéro teinté (doc 07) |

La pastille avatar est ronde (exception `border-radius` déjà prévue par DESIGN.md pour les pastilles, 6px → étendre l'exception aux avatars) et cerclée de la teinte du joueur : le lien couleur ↔ personne se réapprend à chaque regard.

## Garde-fous

- Jamais de teinte joueur sur un élément non possédé (boutons, verrous, chrome) : la dérogation couvre *l'appartenance*, rien d'autre.
- `prefers-reduced-motion` et contrastes : mêmes exigences que la review UX du 2026-07-19 ; les fonds teintés à 12 % ne portent jamais de texte.
- Texte sur aplat de teinte (si un état plein s'avère nécessaire) : `paper`, comme sur vermillon.
- Les tokens `--player-*` sont ordinaux (pas liés à un joueur nommé) : le CSS/Pixi ne connaît que « slot 1/2/3 ».
