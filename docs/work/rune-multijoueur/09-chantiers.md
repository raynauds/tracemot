# 09 — Découpage en chantiers

Six chantiers ordonnés, chacun laissant le jeu **jouable et testable au Dev UI**. Les chantiers 2-5 sont largement indépendants entre eux une fois le 1 posé (2 et 3 permutables ; 4 peut précéder 3).

## Chantier 1 — Socle Rune (parité solo)

Le jeu actuel, identique à jouer, mais architecturé pour Rune. Aucune feature multi visible.

- Intégrer `vite-plugin-rune` + ESLint rune dans `packages/game` (jalon 0 : « hello logic » qui build et tourne au Dev UI — lève le risque R1 avant tout le reste).
- Mise en conformité du partagé (doc 01, les 6 points) : regex `isDefi`, `assertPavage` hors chemin d'import, `rules.ts` (codes de refus **+ re-signature en fonction pure**, elle importe le singleton `state`), split de `progress.ts` en trois groupes — dont la **re-signature de la famille inter-modes** (`isModeUnlocked`, `modeStars`, `visibleModes`, `isModeTeased`, `nextLockedMode`, `starsMissingForMode`, `isFirstLaunch`, `resumePoint` : elles lisent le localStorage aujourd'hui) —, et passage `Set` → `Record<LevelId, true>` avec point de conversion unique.
- `levels/data.ts` en import statique ; suppression de `level-loader.ts` (fetch) et du jeton `selection`.
- `logic.ts` v1 : state minimal (phase, modeId/levelId, found, won, winSummary), actions `proposeLevel` (lancement direct à 1 joueur), `submitWord` (validation autoritaire complète), `proposeAbandon` (abandon direct à 1 joueur) ; events `playerJoined`/`playerLeft` squelettes.
- `client.ts` + `diff.ts` : tout le rendu piloté par `onChange` ; `stateSync/isNewGame` reconstruit la scène complète (grille + fantômes + registre depuis `found`).
- Persisted : `persistPlayerData: true`, schéma, crédit de victoire (encore mono-joueur).
- Conformité qui fâche tôt : suppression accueil/panneau audio/crédits/history (doc 08) — le flow d'écrans change, autant stabiliser tout de suite.
- **Sortie** : parité solo au Dev UI, y compris kill/restart (stateSync) et persisted visible dans l'inspecteur.

## Chantier 2 — Progression partagée

- Union (`rebuildSharedProgress`), `ownProgress`, carte rendue sur l'union.
- Badge « débloqué via autrui » + légende (doc 03/06 — la teinte fine peut attendre le 4, un badge neutre suffit ici).
- Crédit de victoire à tous les présents ; étoiles/annonces dérivées de l'union.
- **Sortie** : au Dev UI, un profil vierge + un profil avancé → le vierge voit et joue tout ; victoire commune créditée aux deux persisted.

## Chantier 3 — Lobby « prêt ? »

- State `proposal` (kind level/abandon, `openedAt`)/`lastRefusal`, actions `proposeLevel`/`proposeAbandon`/`answerProposal`/`cancelProposal`, timeout 30 s via `update()` + `Rune.gameTime()`, départs/arrivées pendant vote (y compris départ du proposeur).
- UI : overlay d'attente (proposeur, bouton ANNULER), prompt de vote (autres), **snackbar** (composant neuf, réutilisable — refus, « sans réponse », « a proposé en premier »).
- Enchaînement victoire → proposition (boutons SUIVANT/DÉFI/CONTINUER, permis par `won`).
- **Sortie** : à 3 instances Dev UI — proposition, refus (snackbar chez les bons joueurs), acceptation unanime, annulation, timeout AFK, deux propositions simultanées, départ du proposeur en plein vote, abandon en cours de partie.

## Chantier 4 — Présence temps réel et identité

- Tokens `--player-1..4` (tokens.ts → CSS + Pixi), `colorSlots` en state (attribution globale stable), dérogation documentée dans DESIGN.md (après Q18 tranchée).
- `updateTrace` + throttle client (trailing annulé au submit/effacement) ; Graphics par joueur distant, pastille avatar de tête, surlignage de cases, estompe des tracés muets (grâce de reconnexion).
- Mots validés teintés (fantômes, cases, registre avec avatar).
- Conflits : invalidation du tracé local sur cases consommées, course au mot (rollback + snackbar discrète), sons/haptique filtrés par auteur.
- **Sortie** : à 2-4 instances avec latence simulée — tracés distants fluides, budget < 10 actions/s tenu (log de comptage), courses propres.

## Chantier 5 — Victoire multi

- `winSummary` complet (comptes figés, première validation, étoile — reconstructible après stateSync), classement (ex æquo rang sauté, avatars/noms), insertion dans l'écran existant.
- Positionnement `gameOver` (Q20) figé après test playtest.
- **Sortie** : victoire à 3 joueurs dont un à 0 mot, classement correct, kill/restart pendant l'écran de victoire → écran reconstruit, enchaînement fluide.

## Chantier 6 — Polissage et publication

- QA layout 280×653 → 1280×800, zone de jeu 450 px, safe areas sous l'UI Rune, défis 16×16 au tactile.
- `Rune.t()` sur l'UI + extraction ; audio revalidé en webview ; `prefers-reduced-motion`.
- Image preview 686×960, titre/description (crédit Kenney), upload, playtest link, review.
- **Sortie** : soumission en review.

## Pré-requis produit

Les questions **Q1-Q5** (périmètre, solo, langue, progression web, coût Corsé) conditionnent le chantier 1 ; **Q18-Q19** (couleurs) le chantier 4 ; **Q20** (gameOver) le chantier 5. Le reste peut se trancher en cours de route — les recommandations des docs tiennent lieu de défaut.
