# 08 — Conformité plateforme et build

Ce que la review Rune vérifie et ce que la webview impose. Précision de statut : la doc Rune formule menus/pause/audio comme des **best practices** (« Avoid UI Like Menu Screens, Pause Buttons, Audio Buttons ») vérifiées lors de la review humaine — pas des interdictions écrites. Le plan recommande de s'y conformer d'emblée (un refus coûte un cycle de review), mais Q21 se tranche en connaissance de cause : c'est du « fortement déconseillé », pas du « interdit ».

## Chrome et écrans : ce qui doit disparaître

| Existant | Verdict | Détail |
|---|---|---|
| Écran d'accueil (`home.ts`) | **À supprimer** (→ Q21a) | Best practice « pas de menu » : le jeu doit s'ouvrir dans le gameplay. La **carte devient le premier écran** (elle est déjà « l'écran d'accueil du choix de niveau »). Le bouton REPRENDRE de l'accueil migre en tête de carte si on y tient. |
| Panneau AUDIO (`sound.ts` + persistance des volumes dans `audio/audio.ts`) | **À supprimer** (→ Q21b) | Rune fournit les contrôles audio in-app. Les sons restent ; partent : le panneau (`sound.ts`) **et** la persistance des volumes qui vit dans `audio/audio.ts` (`readVolume`/`writeVolume`, clés `tracemot.vol-ui`/`tracemot.vol-music`) — `audio.ts` est conservé pour le reste (préchargement, lecture, déblocage). |
| Écran crédits (`credits.ts`) | **À retirer du build Rune** (→ Q21c) | « Pas de branding/liens » — MAIS attention : les attributions **JDSherbert et Nathan Gibson sont contractuelles** (requises par les licences des sons, cf. commentaire `index.html:338-342` et les readme dans `public/sounds/`). La migration doit reloger **toutes** les attributions requises (JDSherbert, Nathan Gibson, Kenney) dans la description du jeu sur le Dev Dashboard, après vérification des termes exacts de chaque licence — supprimer l'écran sans ça viole les licences. |
| Écran « Comment jouer » (`help.ts`) | **Conservé** | Un onboarding n'est pas un menu ; `showHelpOnFirstPlay` garde son sens (clé « vue » → **persisted**, recommandation unique du plan). |
| `history.ts` (pushState/popstate, geste retour) | **À retirer** (→ Q22) | Dans la webview Rune, le retour système appartient à l'app Rune ; nos entrées d'historique risquent de la parasiter. À vérifier au Dev UI, mais le retrait est l'hypothèse de départ. |
| Écran de chargement | Ne pas en créer | Best practice : différer `Rune.initClient()` jusqu'à assets prêts (fontes + sons + scène Pixi — l'équivalent du `.booting` actuel, qui lui peut rester). |

## Réseau, assets, environnement

- **Aucune requête réseau ni ressource externe.** Tous les assets sont déjà locaux (fontes woff2, sons, JSON) — les JSON de niveaux passent en import statique (doc 01), fontes/sons restent des assets bundlés servis par l'upload. Vérifier qu'aucun `<link>`/import CDN ne traîne.
- **localStorage** : déconseillé par Rune (l'OS peut purger). Progression → persisted (doc 03). Préférences (aide vue, dernier onglet, modes vus) → persisted aussi (< 1 Ko) — schéma en doc 02, recommandation alignée dans tout le plan.
- **AudioContext** : le déblocage au premier geste (listeners `window`) doit être revalidé dans la webview (le Dev UI permet de tester sur téléphone via l'URL réseau).
- **`.booting` / polices** : `document.fonts.ready` fonctionne en webview ; conserver.

## Écrans et orientation

- **Portrait** (défaut `initLogic`, pas de `landscape`) — évident pour le jeu.
- Plage à supporter : **280×653 → 1280×800**, zone de jeu descendant à **450 px de haut**. Le layout actuel (canvas plein écran + registre + header) est à re-vérifier aux extrêmes, notamment 280 px de large (grille 5×5 + registre) et les défis 16×16 au zoom min. La caméra/zoom existants aident ; c'est un travail de QA layout, pas d'architecture.
- `viewport-fit=cover` + safe areas : l'UI Rune se superpose (coins) — vérifier que compteur/header ne tombent pas sous ses contrôles.

## i18n

- Plateforme : en/es/pt/ru via `Rune.t()` (client uniquement, extraction statique `npx rune extract-translations` → script tag dans `index.html`).
- **Le contenu du jeu est français** (mots, dictionnaires) et ne se traduit pas par `Rune.t` — c'est un choix de produit assumé ou un chantier futur (dictionnaires en/es/pt/ru + regénération studio) (→ Q3).
- v1 recommandée : UI (boutons, états, messages de refus — devenus des codes, doc 01) passée à `Rune.t()`, contenu français. Les libellés viennent du client, jamais de logic.
- Règle DESIGN.md « majuscules aux labels » à confronter aux traductions (hors périmètre technique).

## Build et publication

- `vite-plugin-rune` + ESLint `rune-sdk/eslint.js` (doc 01, risque R1).
- Cible d'upload : `npx rune@latest upload` (zip du build). Node ≥ 14.17 (OK).
- **Dev UI** = outil de test principal : multi-instances côte à côte, latence simulée, joins tardifs, restarts, manipulation du persisted, langues. Chaque chantier (doc 09) a un critère de sortie « validé au Dev UI ».
- Playtest partageable après upload (avant review) — bon jalon de fin de chantier 4/5.
- Review humaine ~2-3 jours ouvrés. Image preview PNG **686×960** sans texte (bas 240 px réservés) à produire avant la release publique (pas pour le playtest).
- `npm run check` (tsc workspaces) conserve son rôle ; y ajouter le lint Rune de `src/logic/` et le test qui remplace `assertPavage`.
