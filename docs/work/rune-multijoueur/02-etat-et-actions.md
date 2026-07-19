# 02 — État Rune et actions

## Machine de phase : globale, découplée des écrans locaux

Leçon de conception (issue de la passe de vérification) : `phase` est **globale**, les écrans sont **locaux** — les deux ne doivent jamais être confondus.

- `phase: "map"` — aucun niveau en cours. Chacun navigue localement (carte, aide…).
- `phase: "playing"` — un niveau est en cours pour la room. `won: true` marque la grille complétée : la partie est finie mais l'état du niveau (grille, `found`, `winSummary`) **reste en place** jusqu'au lancement suivant — c'est ce qui permet à chaque client (y compris un rejoignant, via `stateSync`) de reconstruire l'écran de victoire.
- **Après victoire, le retour carte est local** (fermer l'overlay de victoire) : aucune action, aucun effet sur les autres.
- **Proposer un niveau** est permis si `phase === "map"` **ou** `won === true` (c'est ainsi que SUIVANT/DÉFI depuis l'écran de victoire fonctionnent sans étape intermédiaire).
- **Abandonner en cours de partie** (`phase === "playing" && !won`) n'est pas une action directe : c'est une **proposition d'abandon** soumise au même vote que les niveaux (`proposal.kind = "abandon"`) (→ Q13). Il n'y a donc **pas** d'action `backToMap` immédiate.

## `game` state (synchronisé, JSON pur, < 1 Mo — ici : quelques Ko)

```ts
interface RuneGameState {
  // --- Room -----------------------------------------------------------------
  phase: "map" | "playing";
  playerIds: string[];                  // joueurs actifs, ordre d'arrivée
  // Slot de couleur GLOBAL par joueur (0..3) : la teinte de X est la même sur
  // tous les écrans ; chaque client n'affiche jamais son propre slot (il est
  // « l'encre »). Maintenu par playerJoined/playerLeft (premier slot libre) —
  // stocké, car il doit rester stable aux départs/arrivées. (doc 06)
  colorSlots: Record<PlayerId, 0 | 1 | 2 | 3>;

  // --- Progression partagée (doc 03) ---------------------------------------
  // Record<LevelId, true> : lookup direct (`id in rec`) — les fonctions de
  // dérivation sont re-signaturées pour le consommer (doc 01, conformité n°6).
  sharedProgress: Record<ModeId, Record<LevelId, true>>;   // union
  ownProgress: Record<PlayerId, Record<ModeId, Record<LevelId, true>>>;

  // --- Lobby (doc 04) -------------------------------------------------------
  proposal: {
    kind: "level" | "abandon";
    modeId: ModeId | null;             // null pour un abandon
    levelId: LevelId | null;
    proposedBy: PlayerId;
    accepted: PlayerId[];              // proposedBy y figure d'office
    openedAt: number;                  // Rune.gameTime() — timeout via update()
  } | null;
  lastRefusal: { by: PlayerId; kind: "level" | "abandon"; seq: number } | null;

  // --- Partie en cours (phase === "playing") --------------------------------
  modeId: ModeId;
  levelId: LevelId | null;             // lettres/solution résolues depuis le bundle
  // Ordre de validation conservé pour le registre et la reconstruction
  // stateSync — le classement, lui, est un comptage par `by` (ex æquo, doc 07).
  found: FoundWord[];
  won: boolean;
  // Posé par le submitWord vainqueur, remis à null au lancement suivant :
  // l'écran de victoire (classement, bloc étoile) est une projection pure de
  // game, reconstructible après stateSync — le « avant/après » de la première
  // validation n'est pas recalculable a posteriori, donc on le fige ici.
  winSummary: {
    counts: Record<PlayerId, number>;  // joueurs actifs à la victoire (classement)
    firstValidation: boolean;          // au sens de l'union (bloc étoile)
    starCount: number;                 // après crédit
    rewardCode: string | null;         // palier débloqué (code, libellé côté client)
  } | null;

  // --- Présence temps réel (doc 05) -----------------------------------------
  traces: Record<PlayerId, number[]>;  // vidé à la victoire et au lancement
}

interface FoundWord { word: string; path: number[]; by: PlayerId }
```

Dérivés (jamais stockés) : cases consommées = union des `found[].path` ; compteur ; états de carte via la dérivation sur `sharedProgress` ; badge « via autrui » en comparant à `ownProgress[moi]` (doc 03).

## `game.persisted` (par joueur, ≤ 100 Ko — ici < 2 Ko)

```ts
interface Persisted {
  schema?: number;                          // versioning, remplace tracemot.schema
  progress?: Record<ModeId, LevelId[]>;     // niveaux validés
  lastMode?: ModeId;                        // préférences (ex-localStorage)
  seenModes?: ModeId[];
  helpSeen?: boolean;
}
```

Toute clé peut être `undefined` (anciennes versions, premier lancement) — contrat Rune. Les préférences y migrent aussi (Rune déconseille localStorage) ; recommandation unique pour tout le plan (docs 01/03/08 alignés).

## Actions

| Action | Payload | Garde (throw `Rune.invalidAction()`) | Effet |
|---|---|---|---|
| `proposeLevel` | `{ modeId, levelId }` | ni `phase === "map"` ni `won` ; proposition déjà ouverte ; **mode verrouillé** (`!isModeUnlocked(union, modeId)`, un onglet fermé n'est jouable pour personne, sans quoi la case 1-1 — toujours `active` par construction — contournerait le verrou) ; `cellState(union, id)` ∉ {active, validated} (le **rejeu d'un niveau validé est permis**, → Q17 — même prédicat « jouable » que la carte) | crée `proposal` kind "level" (auto-accepté par le proposeur, `openedAt = Rune.gameTime()`) ; seul en room → lancement immédiat |
| `proposeAbandon` | `{}` | `phase !== "playing"` ou `won` ; proposition ouverte | crée `proposal` kind "abandon" ; seul en room → abandon immédiat |
| `answerProposal` | `{ accept: boolean }` | pas de proposition ; déjà répondu ; `playerId === proposedBy` | accept : `accepted += playerId`, unanimité → lancement (kind level : phase=playing, reset `found`/`traces`/`winSummary`, `lastRefusal = null`) ou retour carte (kind abandon : phase=map, reset) ; refus : `proposal = null`, écrit `lastRefusal` |
| `cancelProposal` | `{}` | `playerId !== proposedBy` ; pas de proposition | `proposal = null`, **sans** écrire `lastRefusal` (pas de snackbar « a refusé » pour une annulation) |
| `updateTrace` | `{ path: number[] }` | `phase !== "playing"` ou `won` | `traces[playerId] = path` (validation légère : indices dans la grille ; `[]` = doigt levé) |
| `submitWord` | `{ path: number[] }` | `phase !== "playing"` ; `won` ; tracé invalide (longueur, contiguïté via `geometry.neighbors`, case déjà consommée) ; mot ∉ solution ; « déjà trouvé » (comptage d'occurrences — logique de `rules.ts`, re-signaturée en fonction pure, doc 01) | push `FoundWord`, `traces[playerId] = []` ; si grille complète : `won = true`, crédit de tous (doc 03), calcul et pose de `winSummary`, `traces = {}` |

Le client ne soumet `submitWord` que si sa validation **locale** passe (il a la solution) : le flow de refus (flash, secousse, son) reste 100 % local, sans action réseau. `invalidAction` ne sert que pour les courses (doc 05) et les clients hors protocole.

Budget actions : `updateTrace` throttlé ≤ 6-7/s + `submitWord` occasionnel → sous la limite de 10/joueur/s avec marge (doc 05).

## `update()` : timeout de proposition

`initLogic` déclare `update` (cadence par défaut 1/s, suffisante — pas besoin d'`updatesPerSecond`) uniquement pour faire expirer une proposition sans réponse (→ Q11c) : si `proposal && Rune.gameTime() - proposal.openedAt > 30_000`, la proposition expire (`proposal = null`, `lastRefusal = { by: <non-répondant ou proposedBy ?>, … }` — variante « sans réponse » à afficher différemment de « a refusé » ; détail au chantier 3). Une proposition ne peut pas « expirer d'elle-même » par une action : seul `update()` (tick logic synchronisé) peut le faire — c'est le pattern documenté par Rune (`Rune.gameTime()` + `update`).

## Events logic

```ts
events: {
  playerJoined: (playerId, { game }) => {
    // roster + premier slot de couleur libre + persisted→ownProgress + union ;
    // pendant un vote : ajouté au décompte requis (→ Q12b) ;
    // en phase playing : il entre directement dans la grille (→ Q12).
  },
  playerLeft: (playerId, { game }) => {
    // OBLIGATOIRE (sans callback, la partie se termine au premier départ).
    // Retire : roster, colorSlots (slot libéré), traces[playerId], ownProgress
    // → union recalculée (→ Q6c).
    // Proposition en cours : s'il est le PROPOSEUR → proposal = null sans
    // lastRefusal (même sémantique qu'une annulation) ; sinon retrait des
    // accepted + réévaluation (l'unanimité peut être atteinte par ce départ).
    // Ses FoundWord restent (mots validés pour la grille).
  },
}
```

**Grâce de reconnexion — 30 s (sémantique Rune)** : une connexion coupée ne déclenche `playerLeft` qu'au bout de ~30 s (ou quand le joueur quitte la room). Pendant ce laps : le joueur compte comme présent (vote, union, crédit de victoire) et son `traces[p]` reste figé. Conséquences assumées : le timeout de proposition (30 s) borne le blocage d'un vote ; côté rendu, un tracé distant sans mise à jour depuis ~5 s est estompé par le client (doc 05).

`setup(allPlayerIds, { game })` initialise roster, slots, progressions depuis les persisted (`persistPlayerData: true`).

## Client : `onChange` et détection d'événements

`onChange({ game, previousGame, yourPlayerId, allPlayerIds, action, event, rollbacks })` est la seule entrée (liste complète — `futureGame` existe aussi, disponible puisque `update` est déclaré). Le rendu actuel est impératif et événementiel : un module `diff.ts` compare `game`/`previousGame` et émet les événements de présentation :

- `found` a crû → tampon du mot, ligne du registre, son ; haptique/`buzz` seulement si `by === yourPlayerId` ;
- `won` passe à true → séquence de victoire différée de `WIN_DELAY_MS` (timer client), écran construit sur `winSummary` ;
- `traces[p]` a changé → redraw du tracé distant de `p` ;
- `proposal`/`lastRefusal` ont changé → overlay de vote / snackbar — **jamais sur `stateSync`** (à la reconstruction, mémoriser `lastRefusal.seq` courant sans l'afficher : une snackbar périmée ne doit pas rejouer) ;
- si **ma** proposition optimiste est remplacée par celle d'un autre (course de `proposeLevel`, rollback) → snackbar discrète « X a proposé en premier » ;
- `phase` a changé → transitions d'écrans ;
- event `stateSync` avec `isNewGame` → réinitialisation complète de la scène : **tout** l'affichage (grille, fantômes depuis `found[].path`, registre, écran de victoire via `winSummary`) doit être reconstructible depuis `game` seul.

**Rollback d'un `submitWord` optimiste** (course perdue) : le SDK notifie le client concerné via le paramètre `rollbacks` de `onChange` — s'appuyer dessus en premier (forme exacte à vérifier au Dev UI, la doc ne la détaille pas), avec le diff de `found` (mot disparu ou `by` changé) comme filet : reprendre l'affichage serveur + retour « X l'a trouvé juste avant » (doc 05).

Spectateurs (`yourPlayerId === undefined`) : rendu complet, aucune UI d'action — carte en lecture seule, ni tracé, ni vote.
