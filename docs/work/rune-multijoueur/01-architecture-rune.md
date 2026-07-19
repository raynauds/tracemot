# 01 — Architecture Rune

## Principe

Rune impose exactement deux mondes :

- **`logic.ts`** — état + règles, déterministe, exécuté sur chaque client ET le serveur (predict-rollback). Interdits : mutation hors scope, `async/await`, `try/catch` (throw OK), `eval`, `this`, `Date`, `fetch`, **regex**. `Math.random()` patché déterministe. Fichier < 1 Mo, action < 10 ms.
- **`client.ts`** — rendu (PixiJS, DOM, audio, input). Ne mute jamais `game` : il lit l'état via `onChange` et déclenche `Rune.actions.*`.

La stratification actuelle rend ce split naturel :

| Aujourd'hui | Destination |
|---|---|
| `core/config.ts`, `core/levels.ts`, `core/geometry.ts` | importés par logic ET client (après mise en conformité, cf. plus bas) |
| `game/rules.ts` (`wordRejectReason`) | logic (et client, pour le retour immédiat local) — **après re-signature** : elle importe aujourd'hui le singleton `state` (rules.ts:8) qui disparaît |
| `game/progress.ts` — dérivations pures mono-mode (`cellState`, `starCount`, `sectionUnlocked`, `sectionTeased`, `nextChoices`, `sectionStats`, `firstPlayableLevel`…) | logic ET client (elles prennent déjà un `ModeProgress` en argument) |
| `game/progress.ts` — dérivations **inter-modes câblées sur le stockage** (`isModeUnlocked`, `modeStars`, `totalValidated`, `nextLockedMode`, `starsMissingForMode`, `isModeTeased`, `visibleModes`, `isFirstLaunch`, `resumePoint`) | logic ET client — **après re-signature** : elles lisent le localStorage via `loadProgress` et ne prennent aucune progression en argument ; elles doivent recevoir un `Record<ModeId, ModeProgress>` (+ `lastMode` en paramètre pour `resumePoint`) |
| `game/progress.ts` — persistance localStorage (`readList`, `saveValidated`, `migrateStorage`, `loadLastMode`…) | supprimées, remplacées par `game.persisted` (doc 03) |
| `main.ts` `commitPath`/`triggerWin`/`startLevel` | éclatés : validation/victoire/lancement → actions logic ; effets (sons, tweens, délais) → client |
| `game/state.ts` (singleton mutable) | remplacé par le `game` state Rune + un petit état local client (tracé en cours, hover, caméra) |
| `render/*`, `input/*`, `audio/*`, `theme/*` | client, quasi inchangés dans leur rôle — seule la source de vérité change |

## Structure de fichiers proposée

Migration **en place** de `packages/game` (→ Q2 pour le devenir de la version web) :

```
packages/game/
  src/
    logic/
      logic.ts          # Rune.initLogic : setup, actions, events
      types.ts          # GameState Rune, payloads d'actions, Persisted
      board.ts          # validation d'un tracé (mot, contiguïté, cases libres)
      progression.ts    # union, cellState partagé, crédits persisted
      lobby.ts          # proposition / votes / lancement
    client/
      client.ts         # Rune.initClient({ onChange }) + dispatch vers les vues
      local-state.ts    # tracé en cours, hover, caméra, timers UI
      diff.ts           # détection d'événements par comparaison game/previousGame
    render/  input/  audio/  theme/   # existants, adaptés
    levels/
      data.ts           # import statique des 4 JSON (généré ou import direct)
```

- **`vite-plugin-rune`** (template officiel `npx rune@latest create`) gère le double bundle : logic.js séparé, SDK injecté. On l'ajoute à la config Vite existante plutôt que de repartir du template — le monorepo, TS 7 et les assets sont déjà en place. Si le plugin se marie mal avec le workspace npm, repli : scaffolder le template dans `packages/rune-app` et y pointer les sources (→ risque R1).
- `base: '/tracemot/'` disparaît (hypothèse : un jeu uploadé n'est pas servi sous ce chemin ; non sourcé dans la doc Rune — à vérifier au premier build, jalon R1).
- ESLint plugin `rune-sdk/eslint.js` branché sur `src/logic/` : il attrape mécaniquement les violations de déterminisme.

## Mise en conformité du code partagé (chantier 1)

Modifications *avant* toute feature multi, chacune triviale mais bloquante :

1. **`core/levels.ts`** : `DEFI_SUFFIX = /-([ABC])$/` → réécrire `isDefi`/`defiKeyOf` sans regex (test sur le dernier caractère : `"ABC".includes(id[id.length - 1])` + vérification du tiret). Regex interdite en logic.
2. **`core/config.ts`** : `assertPavage` **throw au chargement du module**. Un throw top-level planterait l'init de la VM logic sans catch possible. Déplacer la vérification dans un test (`npm run check`) et la retirer du chemin d'import.
3. **État JSON pur** : `usedCells: Set<number>` disparaît — il est **dérivable** (union des cases de `found[].path`), on ne le stocke plus. `ModeProgress.validated` passe de `Set<LevelId>` à `Record<LevelId, true>` (JSON pur, lookup direct) — les fonctions de dérivation sont adaptées en conséquence (cf. point 4 et 6).
4. **`game/progress.ts`** : scinder en **trois** groupes — (a) dérivation pure mono-mode, importable telle quelle (au type près, cf. point 3 : accepter `Record<LevelId, true>` au lieu de `Set`, changement mécanique `has(id)` → `id in rec`) ; (b) dérivations inter-modes à **re-signaturer** (`isModeUnlocked` & co., cf. tableau ci-dessus — elles lisent aujourd'hui le localStorage) ; (c) persistance localStorage, supprimée au profit du persisted (doc 03). Aucun `try/catch` ne doit rester sur le chemin logic.
5. **`rules.ts`** : deux changements — `wordRejectReason` retourne des **codes** (`"length" | "notInSolution" | "alreadyFound"`) au lieu de messages français (libellés et `Rune.t()` côté client), et elle est **re-signaturée en fonction pure** `(word, { wordLength, solution, found })` : elle importe aujourd'hui le singleton `state` (rules.ts:8), qui disparaît.
6. **Conversion unique Set/Record** : le state et le persisted stockent du JSON (`Record<LevelId, true>` / `LevelId[]`) ; l'unique point de conversion est `rebuildSharedProgress` (persisted `LevelId[]` → `Record`). Les fonctions de dérivation consomment le `Record` directement — pas de reconstruction de `Set` à chaque lecture.

## Données de niveaux : import statique partout

- 124 Ko pour les 288 niveaux : **inline dans logic.js** (12 % de la limite) ET dans le bundle client (chacun importe `levels/data.ts`). Le `fetch` de `level-loader.ts` disparaît, ainsi que son cache de promesses et le jeton anti-course `selection` de `main.ts` (les actions Rune sont sérialisées).
- L'état Rune ne porte **que** `modeId`/`levelId` (+ mots trouvés) ; lettres, solution et paths se résolvent localement depuis le module. Pas de risque de dérive : les deux bundles sont générés du même source au même build.
- La validation devient **autoritaire** : logic revérifie chaque tracé soumis (contiguïté orthogonale via `geometry.neighbors`, cases non consommées, mot ∈ solution) — aujourd'hui la contiguïté n'est garantie que par `input.ts`, ce qui ne suffit plus quand le payload vient du réseau.
- Les solutions sont lisibles dans le bundle livré : assumé, le jeu est coopératif (pas de triche compétitive qui compte).

## Ce qui reste local au client

Tracé en cours du joueur (muté à chaque pointermove — sa *publication* est throttlée, doc 05), hover, caméra/zoom/pan, tweens et timers d'UI (`WIN_DELAY_MS`, `rejectTimer` — qui sort de l'état de jeu), déblocage AudioContext. Les préférences (dernier onglet de mode, aide vue) vont dans le **persisted** (Rune déconseille localStorage) — recommandation unique, docs 02/03/08 alignés.

## Risques

- **R1 — vite-plugin-rune × monorepo npm workspaces / TS 7** : non vérifié. Premier jalon du chantier 1 : un « hello logic » qui build et tourne dans le Dev UI. Repli : package dédié scaffoldé par le template.
- **R2 — webview Rune** : `history.pushState` (geste retour, `history.ts`) et le resize `resizeTo: window` + `devicePixelRatio` sont à revalider dans le Dev UI mobile (→ Q22).
- **R3 — `reactive: true`** (défaut) : le proxy de réactivité a un coût ; si le rendu Pixi rame, `reactive: false` est disponible mais retire l'égalité référentielle dans `onChange` — le diff (doc 02) doit être écrit pour tolérer les deux.
