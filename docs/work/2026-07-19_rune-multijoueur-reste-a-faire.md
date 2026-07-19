# Rune multijoueur — reste à faire

État au 2026-07-19 : les 6 chantiers du plan [rune-multijoueur](rune-multijoueur/00-INDEX.md) sont implémentés et commités (`82e64fe` → `e97e98b`, branche `rune-refactor`). `npm run check` et `npm run build -w @tracemot/game` verts, logic.js 153 Ko (< 1 Mo). Ce doc liste ce qui n'a **pas** pu être fait par les agents (interdiction de lancer le projet) ou reste volontairement en suspens.

## 1. Validation au Dev UI (bloquant avant upload)

Aucun `npm run dev` n'a été lancé : tous les critères de sortie « validé au Dev UI » du doc 09 restent à jouer à la main.

- [ ] **Parité solo** (chantier 1) : carte premier écran, aide première fois, jeu, refus local, victoire, SUIVANT/DÉFI, kill/restart (`stateSync`) → scène reconstruite, persisted visible dans l'inspecteur.
- [ ] **Progression partagée** (chantier 2) : profil vierge + profil avancé → le vierge voit et joue tout ; victoire commune créditée aux deux persisted ; badge « grâce à la room » ; union qui rétrécit au départ d'un joueur.
- [ ] **Lobby** (chantier 3, à 3 instances) : proposition, refus (snackbar chez les bons joueurs), acceptation unanime, annulation, timeout AFK 30 s, deux propositions simultanées (course), départ du proposeur en plein vote, abandon en cours de partie, arrivée pendant un vote.
- [ ] **Présence** (chantier 4, 2-4 instances + latence simulée) : tracés distants fluides, estompe des tracés muets (~5 s), courses au mot propres (snackbar « X l'a trouvé juste avant »), budget < 10 actions/s — compteur intégré, activable via `?dev=1`.
- [ ] **Victoire multi** (chantier 5) : classement à 3 joueurs dont un à 0 mot, ex æquo, kill/restart pendant l'écran de victoire → écran reconstruit, enchaînement fluide.
- [ ] **QA layout** : 280×653 → 1280×800, zone de jeu 450 px, safe areas sous l'UI Rune, défis 16×16 au tactile (ergonomie + éventuel indicateur de bord pour tracés distants hors viewport, renvoyé au test par le doc 05).
- [ ] **Webview mobile** (via l'URL réseau du Dev UI) : déblocage AudioContext, `document.fonts.ready`, resize `devicePixelRatio`, geste retour système (Q22 — `history.ts` a été retiré, à confirmer que la webview donne un retour utilisable).

## 2. i18n

- [ ] Relire les traductions en/es/pt/ru : générées par LLM, jamais relues par un locuteur natif (rappel en commentaire dans le tag JSON d'`index.html`). 103-125 clés selon la langue (pluriels CLDR en ru).
- [ ] Attention outillage : `npm run i18n:extract` (`npx rune extract-translations`) **réécrit `index.html` et supprime tous les commentaires HTML**, y compris le bloc d'attributions. Après chaque extraction, vérifier/restaurer les commentaires.

## 3. Publication

- [ ] Image preview PNG **686×960**, sans texte, bas 240 px réservés (requise pour la release publique, pas pour le playtest).
- [ ] Titre + description sur le Dev Dashboard, **avec les attributions contractuelles** (JDSherbert, Nathan Gibson, Kenney — source : `docs/ATTRIBUTIONS.md`), après vérification des termes exacts de chaque licence.
- [ ] `npx rune@latest upload`, lien playtest (bon jalon post-Dev UI), puis review (~2-3 jours ouvrés).
- [ ] Hypothèse à confirmer au premier upload : un jeu uploadé est servi à la racine (`base: '/'` — le `base: '/tracemot/'` a été retiré).
- [ ] **Q20 / `gameOver`** : décision « jamais de gameOver par niveau » à valider en playtest/review ; les deux replis (`minimizePopUp`, jalon rare) sont documentés en commentaire au-dessus d'`applyVictory` (`logic/progression.ts`) et dans le doc 07.

## 4. Dettes techniques assumées (non bloquantes)

- **Portée du lint Rune** : `check:rune-logic` ne couvre que `src/logic/**` — le code partagé inliné dans logic.js (`@tracemot/core`, `game/rules.ts`, `game/progress.ts`, `levels/data.ts`) n'est pas lint-é. Aucune violation actuelle, mais une regex/`Date`/`async` ajoutée là passerait le check en silence. Extension = parserOptions cross-package, mission dédiée.
- **TS 7 (préversion)** : n'expose plus l'API compilateur classique — tout outillage type-aware futur devra passer par le même contournement (`overrides` npm `ts-api-utils` → TS 5.9 dans le package.json racine ; un changement d'override exige `rm -rf node_modules package-lock.json && npm install`).
- **Estompe des tracés distants** : le fond de case teinté (~12 %) disparaît net quand le tracé sort du cache, seuls trait + pastille suivent le fondu (documenté dans `scene.ts`).
- **Course au mot** : `wordRaceLost` suppose une seule course par tick (cas courant, documenté dans `diff.ts`).
- **`isFirstLaunch`** : non câblée (décision produit préexistante, documentée dans `map.ts`).
- **Pastille « nouveau » / modes vus** : seed une fois par session depuis le persisted, sticky ensuite (comportement voulu, voir `map.ts`).

## 5. Hors périmètre v1 (réouvrable)

- Dictionnaires multilingues (regénération studio par langue) — Q3.
- « Points reportés » solo (sauvegarde de partie en cours sur grands défis, indices) — le multi atténue le besoin.
- Import de la progression web (localStorage) — abandonné, Q4.
