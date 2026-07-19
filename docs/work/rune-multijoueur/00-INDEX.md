# Portage Rune multijoueur — plan d'implémentation

Migration de `packages/game` (site web solo) vers une web app Rune (webview dans l'app mobile Rune), avec mode multijoueur coopératif : progression partagée, lobby « prêt ? », tracés des autres joueurs en temps réel, mots teintés par trouveur, classement de victoire.

## Comment lire ce plan

1. **Commencer par [QUESTIONS.md](QUESTIONS.md)** : toutes les décisions à trancher, avec cases à cocher et suggestions. Tant qu'elles ne sont pas tranchées, les docs 01-09 décrivent l'option recommandée et signalent les alternatives par des renvois `→ Q<n>`.
2. Les docs 01-09 sont ordonnés du socle vers la surface : architecture → état → progression → flows → rendu → conformité → découpage.

| Doc | Contenu |
|---|---|
| [01-architecture-rune.md](01-architecture-rune.md) | Split logic/client, structure du monorepo, build Vite, mise en conformité déterministe du code existant, données de niveaux |
| [02-etat-et-actions.md](02-etat-et-actions.md) | Forme complète du `game` state Rune, liste des actions, events, invariants |
| [03-progression-partagee.md](03-progression-partagee.md) | `game.persisted`, union des progressions, « débloqué grâce à un autre », validation pour tous |
| [04-lobby-et-flow-niveaux.md](04-lobby-et-flow-niveaux.md) | Carte, proposition de niveau, vote « prêt ? », refus + snackbar, enchaînements |
| [05-presence-temps-reel.md](05-presence-temps-reel.md) | Streaming des tracés (limite 10 actions/s), rendu des tracés distants, conflits de cases |
| [06-identite-visuelle-joueurs.md](06-identite-visuelle-joueurs.md) | Couleurs par joueur, dérogation DESIGN.md, pastilles/avatars, déclinaisons par surface |
| [07-victoire-et-classement.md](07-victoire-et-classement.md) | Écran de victoire multi, classement par mots trouvés, rapport à `Rune.gameOver` |
| [08-conformite-plateforme-et-build.md](08-conformite-plateforme-et-build.md) | Exigences de review Rune (menus, audio, réseau, tailles d'écran), i18n, upload |
| [09-chantiers.md](09-chantiers.md) | Découpage en 6 chantiers ordonnés, critères de sortie de chacun |

## Faits établis (cartographie du 2026-07-19)

- Code actuel ~6 200 lignes TS ; logique déjà bien stratifiée : `@tracemot/core` pur, `game/` (état, règles, progression) sans DOM, `render/` (PixiJS 8 + chrome DOM), `input/`.
- 288 niveaux prégénérés (4 modes × 72), 124 Ko de JSON au total — importables statiquement dans logic.js (limite 1 Mo très confortable).
- Progression = une seule donnée persistée (liste des `LevelId` validés par mode), tout le reste est dérivé par des fonctions pures → le modèle « union des progressions » se greffe naturellement.
- Aucun `Math.random`/`Date` au runtime. Points de friction Rune identifiés : regex dans `core/levels.ts` (`isDefi`), `Set` dans l'état, `try/catch` + `localStorage` dans `progress.ts`, `fetch`/`async` dans `level-loader.ts`, `setTimeout` dans `main.ts`/`render.ts`.
- Contraintes Rune clés : logic.js déterministe < 1 Mo, état JSON < 1 Mo, 10 actions/joueur/s max, payload < 25 Ko, 1-4 joueurs, `game.persisted` ≤ 100 Ko/joueur, grâce de reconnexion ~30 s avant `playerLeft`, review humaine sur best practices (pas de menu, pas de contrôles audio maison, aucune requête externe — fortement recommandé, pas d'interdiction écrite), portrait 280×653 → 1280×800.

Le plan a été passé au crible d'une vérification adversariale (4 angles : exactitude API Rune, exactitude vs code réel, complétude produit, faisabilité des mécanismes — 44 constats, tous traités) : machine de phase découplée des écrans locaux, 4 slots de couleur globaux, `winSummary` pour la reconstruction `stateSync`, timeout de vote via `update()`, re-signature des fonctions de progression inter-modes, attributions contractuelles des sons, entre autres.
