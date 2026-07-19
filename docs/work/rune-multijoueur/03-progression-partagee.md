# 03 — Progression partagée

## Modèle : l'union des validés

Le modèle solo tient en une phrase — *seule la liste des validés est stockée, tout est dérivé* — et il s'étend tel quel au multi :

- **Progression propre** d'un joueur : `persisted.progress` (ses validés par mode), miroir en state (`ownProgress[playerId]`).
- **Progression de la room** : l'**union** des validés de tous les joueurs actifs, par mode (`sharedProgress`). La dérivation existante s'applique à l'union en deux familles (détail doc 01) :
  - les fonctions **mono-mode** (`cellState`, `starCount`, `sectionUnlocked`, `sectionTeased`, `nextChoices`, `sectionStats`, `firstPlayableLevel`) prennent déjà un `ModeProgress` en argument — seule l'adaptation `Set` → `Record` les touche ;
  - les fonctions **inter-modes** (`isModeUnlocked`, `modeStars`, `visibleModes`, `isModeTeased`, `nextLockedMode`, `starsMissingForMode`, `isFirstLaunch`, `resumePoint`) lisent aujourd'hui le localStorage sans argument de progression : elles sont **re-signaturées** pour recevoir un `Record<ModeId, ModeProgress>` (et `resumePoint` reçoit en plus `lastMode`, préférence par joueur). C'est un chantier explicite, pas un déplacement de fichier.

Une fois re-signaturées, sections, étoiles, modes et teasings deviennent mécaniquement ceux du meilleur front commun (→ Q6). Exemple de la spec : je n'ai rien débloqué, un autre joueur a validé tout le 5×5 → l'union contient ses 72 validés, toutes les cases du 5×5 sont `validated`/`active`, et la dérivation inter-modes ouvre même le 6×6. Je vois et je peux tout jouer.

Recalcul de l'union : à `setup`, `playerJoined`, `playerLeft` (départ = l'union **rétrécit**, → Q6c) et après chaque victoire. Fonction unique `rebuildSharedProgress(game)` pour éviter toute désynchronisation.

## « Débloqué grâce à quelqu'un d'autre »

Pas besoin de stocker de provenance : c'est une **comparaison de deux dérivations pures**.

```
etatRoom  = cellState(union, id)        // ce que la carte affiche
etatPerso = cellState(mienne, id)       // ce que j'aurais eu en solo
badge « via autrui » si etatRoom ∈ {active, validated} et etatPerso ∉ {active, validated}
```

Même règle pour les jalons de section et les onglets de mode (section ouverte par l'union mais pas par ma progression → jalon marqué). Présentation du badge : doc 06 (→ Q9).

Nota : dès qu'une victoire en multi crédite tout le monde (ci-dessous), les niveaux joués ensemble deviennent « à moi » aussi — le badge concerne donc surtout l'avance solo qu'un joueur apporte en entrant dans la room, et il s'estompe naturellement à mesure qu'on joue ensemble.

## Validation pour tout le monde

Quand `submitWord` complète la grille (`won = true`), logic crédite le niveau à **chaque joueur actif** (→ Q7) :

```
pour chaque p de playerIds :
  persisted[p].progress[modeId] += levelId   (idempotent, comme saveValidated)
  ownProgress[p] mis à jour en miroir
rebuildSharedProgress(game)
```

- Le crédit est immédiat (pas au `WIN_DELAY_MS`, qui n'est qu'un délai d'affichage client) — même garantie qu'aujourd'hui : « rejouer vite ne doit pas perdre la victoire ».
- Les étoiles suivent : un défi validé crédité à tous donne son étoile à tous (dérivée du persisted de chacun) (→ Q8).
- Spectateurs et absents ne sont pas crédités (`game.persisted` n'expose que les joueurs actifs — contrainte Rune).
- Un joueur qui a participé puis quitte avant la fin n'est pas crédité (il n'est plus dans `playerIds` au moment de la victoire). Ses mots restent au tableau ; leur sort au classement → Q7b. Cas assumé, simple ; alternative listée en Q7. Nuance : une **microcoupure** ne compte pas comme un départ — Rune accorde ~30 s de grâce de reconnexion avant `playerLeft`, donc un déconnecté temporaire reste crédité (et compté dans l'union et les votes).

## Persisted : versioning et migration

- `persisted.schema` remplace `tracemot.schema`. Lecture tolérante : `schema` absent ou différent → on repart d'un `progress` vide (même politique de purge franche que `migrateStorage`, sans `try/catch` — de simples tests d'existence suffisent en JSON).
- Les versions **draft** de Rune lisent le persisted publié mais n'écrivent jamais : le développement ne peut pas corrompre les données réelles.
- Progression web (localStorage) existante : non transférable automatiquement (autre origine, autre appareil). Recommandation : on repart de zéro sur Rune (→ Q4).
- `tracemot.lastMode` / `tracemot.seenModes` / aide vue : préférences par joueur → **persisted** (sync cross-devices, Rune déconseille localStorage). Recommandation unique du plan (docs 01/02/08 alignés) ; schéma en doc 02.

## Points de vigilance

- `firstPlayableLevel`/`resumePoint` (bouton « reprendre ») opèrent sur l'union en room — sens conservé, signatures re-travaillées (cf. plus haut). `isFirstLaunch` (accroche pédagogique de la carte) : sur l'union aussi (si quelqu'un a déjà joué, pas de version « première fois »).
- La règle des verrous teasés « à un défi près » reste calculée sur l'union : cohérente, mais l'arrivée d'un joueur avancé peut faire apparaître/disparaître des verrous d'un coup — la carte se re-rend intégralement (`renderMap`), rien à faire de spécial.
- Q5 (coût de la section Platine 4★) doit être tranché **avant** le premier upload : changer les seuils après coup modifie la dérivation sur des persisted en circulation.
