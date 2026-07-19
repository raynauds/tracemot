// Rune.initClient({ onChange }) — SEULE entrée du rendu (doc 02 § Client) :
// plus de main.ts séparé, plus de singleton game/state.ts. `game` (le state
// Rune, synchronisé par predict-rollback) est l'unique source de vérité de la
// partie ; ce fichier ne fait que lire `game` et déclencher `Rune.actions.*`.
//
// Différé jusqu'à ce que tout soit prêt (fontes, sons, scène Pixi) — doc 08 §
// Écran de chargement : « ne pas en créer », donc ne pas appeler initClient
// trop tôt plutôt que de construire un spinner.
//
// Écran local : "map" | "game" (doc 02 § Machine de phase — `phase` est
// globale, l'écran affiché est local). Il suit `game.phase`, SAUF juste après
// une victoire : fermer l'écran de victoire est un geste purement local
// (aucune action réseau), la partie reste en place pour la room tant qu'aucune
// proposition n'est acceptée.
//
// stateSync (isNewGame) reconstruit TOUT depuis `game` seul (doc 01/02) : même
// chemin que le lancement normal d'une manche (enterGameScreen), complété par
// le rejeu silencieux du registre et l'affichage immédiat (sans délai ni son)
// de l'écran de victoire si la manche était déjà gagnée.
//
// Lobby de proposition/vote (doc 04, chantier 3) : render/lobby.ts peint
// l'overlay à chaque onChange (renderLobby, en tête du callback ci-dessous),
// notifyLobbyEvents décide des notifications transitoires (snackbar) à
// partir des diffs purs de client/diff.ts — jamais à la reconstruction.
//
// Présence temps réel et identité joueur (doc 05/06, chantier 4) :
// `syncPresence` (identité + `colorSlots`) tourne à CHAQUE tick, avant tout le
// reste ; `renderRemoteTraces` (scene.ts) peint les tracés distants et le
// registre teinté après chaque `syncFromGame` en phase "playing" ;
// `wordRaceLost` (client/diff.ts, s'appuyant sur `rollbacks` d'onChange)
// détecte une course perdue sur le même mot.

import {
  DEFAULT_MODE,
  MODE_ORDER,
  isDefi,
  type LevelId,
  type ModeId,
} from "@tracemot/core";
import { initAudio, playSound } from "../audio/audio.ts";
import { WIN_DELAY_MS } from "../game/config.ts";
import {
  nextChoices,
  type ModeProgress,
  type ProgressByMode,
} from "../game/progress.ts";
import { wordRejectReason } from "../game/rules.ts";
import {
  attachInputHandlers,
  cancelAllGestures,
  clearPath,
} from "../input/input.ts";
import { bindHelp, showHelpOnFirstPlay } from "../render/help.ts";
import { bindLobby, renderLobby } from "../render/lobby.ts";
import { bindMap, hideMap, showMap } from "../render/map.ts";
import {
  flashPath,
  initScene,
  rebuildGrid,
  renderRemoteTraces,
  renderSceneGrid,
  renderUsedCells,
  shakeGrid,
  stampWord,
} from "../render/scene.ts";
import {
  bindMapReturn,
  bindWinNext,
  buildBoard,
  buzz,
  fillListRow,
  hideWin,
  rejectLabel,
  renderCounter,
  renderLevelHeader,
  renderNewGame,
  renderWin,
  showReject,
} from "../render/render.ts";
import { showSnackbar } from "../render/snackbar.ts";
import {
  bindTracePublisher,
  local,
  syncFromGame,
  syncPresence,
  wordCheckContext,
} from "./local-state.ts";
import {
  isBackgroundTick,
  isRoundEnd,
  isRoundStart,
  justWon,
  proposalRaceLost,
  refusalJustHappened,
  wordRaceLost,
} from "./diff.ts";
import { trackAction } from "./dev.ts";
import type { GameStateWithPersisted } from "../logic/types.ts";

type Game = GameStateWithPersisted;

// Joueur local courant (undefined = spectateur, doc 02 § onChange). Mis à
// jour à chaque onChange ; tout ce qui dispatche une action le consulte avant
// d'agir — un spectateur ne joue ni ne vote (doc 02 § fin).
let yourPlayerId: string | undefined;

// Dernier `game` vu, pour les gestes purement LOCAUX déclenchés en dehors
// d'un onChange (fermer l'écran de victoire) : réassigné à chaque appel
// d'onChange, jamais lu entre deux appels comme une valeur « live » — ce qui
// reste valable que `reactive` soit true ou false (doc 01 § R3).
let lastGame: Game | undefined;

// --- Progression : adaptateur Rune (bare) → game/progress.ts (wrapped) -----
// sharedProgress stocke un Record<LevelId, true> NU par mode (doc 02) ; les
// dérivations pures de game/progress.ts attendent le ModeProgress
// ({ validated }) — même principe que logic/progression.ts (toModeProgress),
// réécrit ici pour ne pas faire dépendre le client d'un fichier de src/logic/.
function wrapProgress(shared: Game["sharedProgress"]): ProgressByMode {
  const out = {} as ProgressByMode;
  for (const modeId of MODE_ORDER) out[modeId] = { validated: shared[modeId] };
  return out;
}

function yourPersisted(game: Game) {
  return yourPlayerId ? (game.persisted[yourPlayerId] ?? {}) : {};
}

// Ma progression propre (doc 03) : `game.ownProgress[yourPlayerId]`, vide pour
// un spectateur (`yourPlayerId` indéfini). Sert UNIQUEMENT à la comparaison du
// badge « grâce à la room » de la carte (map.ts § Q9) — jamais à l'accès
// lui-même, qui reste dérivé de l'union (`game.sharedProgress`).
function yourOwnProgress(game: Game): Game["sharedProgress"] {
  const own = yourPlayerId ? game.ownProgress[yourPlayerId] : undefined;
  if (own) return own;
  const empty = {} as Game["sharedProgress"];
  for (const modeId of MODE_ORDER) empty[modeId] = {};
  return empty;
}

// --- Écran carte -------------------------------------------------------------

function enterMapScreen(game: Game): void {
  local.screen = "map";
  local.ready = false;
  cancelAllGestures();
  hideWin();
  const persisted = yourPersisted(game);
  showMap(
    wrapProgress(game.sharedProgress),
    wrapProgress(yourOwnProgress(game)),
    persisted.lastMode ?? DEFAULT_MODE,
    persisted.seenModes ?? [],
  );
}

// --- Écran de partie ---------------------------------------------------------

// Choix proposés par l'écran de victoire + étoile éventuelle. Tout le reste
// (comptes, première validation, palier) est déjà figé côté logic
// (`winSummary`, doc 02/03/07) — seul `choices` est une dérivation pure, non
// stockée dans le state Rune.
function winRenderOpts(game: Game): Parameters<typeof renderWin>[0] {
  const { modeId, levelId, winSummary } = game;
  if (!levelId || !winSummary) return {};
  const progress: ModeProgress = { validated: game.sharedProgress[modeId] };
  const choices = nextChoices(progress, levelId);
  const star =
    isDefi(levelId) && winSummary.firstValidation
      ? { count: winSummary.starCount, unlocked: winSummary.rewardCode }
      : undefined;
  return { star, choices };
}

// Reconstruit l'écran de partie depuis `game` seul : sert À LA FOIS au
// lancement d'une manche (roundStart) ET à un stateSync en pleine partie
// (reconnexion) — dans ce second cas le registre est rejoué SILENCIEUSEMENT
// (pas de tampon ni de son : le joueur n'a pas à revivre des validations
// qu'il a manquées) et l'écran de victoire, si la manche est déjà gagnée,
// apparaît sans délai.
function enterGameScreen(game: Game): void {
  local.screen = "game";
  cancelAllGestures();
  // Un geste en vol référencerait l'ancienne grille (la géométrie change d'un
  // niveau à l'autre, un défi double le côté) : remise à plat explicite, même
  // si cancelAllGestures() les a déjà normalement vidés.
  local.path = [];
  local.pointerId = null;
  syncFromGame(game);
  buildBoard();
  rebuildGrid();
  renderNewGame(); // vide le registre, remet le compteur à zéro, cache la victoire
  renderSceneGrid(); // pose lettres/cases, distribue, cadre la caméra
  for (let i = 0; i < game.found.length; i++) {
    fillListRow(i, game.found[i], false); // rejeu silencieux (pas de tampon)
  }
  renderCounter();
  renderLevelHeader();
  hideMap();
  if (game.won) {
    renderWin(winRenderOpts(game));
  } else {
    showHelpOnFirstPlay(yourPersisted(game).helpSeen ?? false);
  }
}

// --- Mots trouvés / victoire (gameplay normal, hors reconstruction) ---------

function handleFoundGrowth(game: Game, previousFoundLength: number): void {
  // Conflit (doc 05 § Cases consommées) : un mot validé par un AUTRE joueur
  // vient de consommer une case que mon tracé en cours traverse — logic
  // refuserait de toute façon ma soumission (case déjà consommée), autant
  // annuler le geste tout de suite plutôt que de laisser le doigt terminer un
  // tracé condamné. Un seul appel suffit même si plusieurs mots tombent dans
  // le même tick (cancelAllGestures est idempotent, mode déjà remis à null).
  let myTraceInvalidated = false;
  for (let i = previousFoundLength; i < game.found.length; i++) {
    const entry = game.found[i];
    const isMine = entry.by === yourPlayerId;
    if (!isMine && !myTraceInvalidated && local.path.some((c) => entry.path.includes(c))) {
      myTraceInvalidated = true;
      cancelAllGestures();
    }
    fillListRow(i, entry, true);
    renderUsedCells();
    stampWord(entry.path);
    // Le mien plein volume, un mot distant atténué (doc 05 § Sons et haptique).
    playSound("word-stamp", isMine ? undefined : { volume: 0.5 });
    if (isMine) buzz(); // haptique réservé à SA propre trouvaille
  }
  renderCounter();
}

function handleWon(game: Game): void {
  const opts = winRenderOpts(game); // capturé MAINTENANT (primitives, pas de lecture différée de `game`)
  if (local.winTimer !== null) clearTimeout(local.winTimer);
  local.winTimer = window.setTimeout(() => {
    local.winTimer = null;
    playSound("level-win");
    renderWin(opts);
  }, WIN_DELAY_MS);
}

// --- Geste de tracé : validation locale, puis action autoritaire -----------

// Le flux de refus (flash, secousse, son) reste 100% local (doc 01/02) : le
// client ne soumet `submitWord` que si SA validation locale passe — logic.ts
// revérifie de toute façon tout, de façon autoritaire.
function commitWord(): void {
  if (local.path.length < 2) {
    clearPath(); // < 2 lettres : efface aussitôt chez les autres (doc 05)
    return;
  }
  const word = local.path.map((i) => local.letters[i]).join("");
  const traced = local.path.slice();
  const code = wordRejectReason(word, wordCheckContext());
  if (code) {
    clearPath(); // refusé : geste sans soumission, efface aussitôt (doc 05)
    flashPath(traced);
    shakeGrid();
    playSound("word-reject");
    showReject(word, rejectLabel(code));
    return;
  }
  if (!yourPlayerId) {
    clearPath();
    return; // spectateur : jamais de submitWord
  }
  // Accepté : `submitWord` vide `traces[playerId]` côté logic, un effacement
  // en plus n'apporterait rien (doc 05 § « pas d'action supplémentaire »).
  clearPath(false);
  Rune.actions.submitWord({ path: traced });
  trackAction("submitWord");
}

// --- Lancement / abandon / enchaînement -------------------------------------

function proposeLevel(modeId: ModeId, id: LevelId): void {
  if (!yourPlayerId) return;
  Rune.actions.proposeLevel({ modeId, levelId: id });
  trackAction("proposeLevel");
}

function proposeAbandon(): void {
  if (!yourPlayerId) return;
  Rune.actions.proposeAbandon({});
  trackAction("proposeAbandon");
}

// --- Lobby : notifications éphémères (doc 04 § chantier 3) ------------------
// Diffs purs (client/diff.ts) → texte + son ici, jamais l'inverse : ce module
// est le seul à connaître Rune.getPlayerInfo et le français. Appelé APRÈS le
// retour anticipé du stateSync/isNewGame (onChange, plus bas) : jamais de
// snackbar rejouée à la reconstruction (doc 02 § onChange).
function notifyLobbyEvents(
  game: Game,
  previousGame: Game,
  // Forme large plutôt qu'importer OnChangeEvent (non exporté par rune-sdk,
  // cf. multiplayer.d.ts) : seuls playerJoined/playerLeft nous intéressent
  // ici, narrowés ci-dessous par `name` — les autres membres de l'union
  // (aiPromptResponse…) portent un `params` de forme différente, d'où `any`.
  event: { name: string; params?: any } | undefined,
): void {
  if (event?.name === "playerJoined" && event.params) {
    const playerId = event.params.playerId as string;
    if (playerId !== yourPlayerId) {
      showSnackbar(`${Rune.getPlayerInfo(playerId).displayName} a rejoint la partie`);
    }
  } else if (event?.name === "playerLeft" && event.params) {
    const playerId = event.params.playerId as string;
    showSnackbar(`${Rune.getPlayerInfo(playerId).displayName} a quitté la partie`);
  }

  if (refusalJustHappened(game, previousGame)) {
    const { by, reason } = game.lastRefusal!;
    // Refuseur exclu (doc 04 § Q11b) ; « sans réponse » est une variante du
    // refus (même filet), doc 04 § Timeout.
    if (by !== yourPlayerId) {
      const name = Rune.getPlayerInfo(by).displayName;
      showSnackbar(reason === "timeout" ? `Sans réponse de ${name}` : `${name} a refusé`);
    }
  }
  if (proposalRaceLost(game, previousGame, yourPlayerId)) {
    const name = Rune.getPlayerInfo(game.proposal!.proposedBy).displayName;
    showSnackbar(`${name} a proposé en premier`);
  }
}

// --- Boot --------------------------------------------------------------------

async function boot(): Promise<void> {
  initAudio(); // précharge les bruitages ; le 1er geste du joueur les débloque
  buildBoard();
  renderCounter();
  await initScene(); // Application Pixi + graphe de scène (assets prêts, doc 08)
  attachInputHandlers({ onCommit: commitWord });
  // Publication throttlée du tracé (doc 05) : le throttle vit dans
  // client/local-state.ts, mais seul ce fichier dispatche vers Rune.
  bindTracePublisher((path) => {
    if (!yourPlayerId) return;
    Rune.actions.updateTrace({ path });
    trackAction("updateTrace");
  });

  bindMap(proposeLevel, {
    onModeSeen: (modeId) => {
      if (!yourPlayerId) return;
      Rune.actions.markModeSeen({ modeId });
      trackAction("markModeSeen");
    },
    onModeChange: (modeId) => {
      if (!yourPlayerId) return;
      Rune.actions.setLastMode({ modeId });
      trackAction("setLastMode");
    },
  });
  bindMapReturn({
    onAbandon: proposeAbandon,
    onCloseWin: () => {
      // Après victoire, le retour carte est LOCAL (doc 02 § Machine de
      // phase) : aucune action, la partie reste en place pour la room tant
      // qu'aucune proposition n'est acceptée.
      if (lastGame) enterMapScreen(lastGame);
    },
  });
  // Lobby de proposition/vote (doc 04 § chantier 3) : les trois réponses
  // possibles à une proposition en cours — accepter, refuser, ou l'annuler
  // (réservé au proposeur, cf. render/lobby.ts qui n'affiche ANNULER qu'à
  // lui).
  bindLobby({
    onAccept: () => {
      if (!yourPlayerId) return;
      Rune.actions.answerProposal({ accept: true });
      trackAction("answerProposal");
    },
    onRefuse: () => {
      if (!yourPlayerId) return;
      Rune.actions.answerProposal({ accept: false });
      trackAction("answerProposal");
    },
    onCancel: () => {
      if (!yourPlayerId) return;
      Rune.actions.cancelProposal({});
      trackAction("cancelProposal");
    },
  });
  bindHelp({
    onSeen: () => {
      if (!yourPlayerId) return;
      Rune.actions.setHelpSeen({});
      trackAction("setHelpSeen");
    },
  });
  // Enchaînement depuis l'écran de victoire : toujours dans le mode courant —
  // une étoile peut ouvrir le mode suivant, mais on ne l'y téléporte pas.
  bindWinNext((id) => proposeLevel(local.modeId, id));

  Rune.initClient({
    onChange: ({ game, previousGame, yourPlayerId: player, event, rollbacks }) => {
      yourPlayerId = player;
      lastGame = game;
      // Présence (doc 05/06) : identité + slots de couleur, à jour à CHAQUE
      // tick, indépendamment de l'écran affiché — avant tout le reste, pour
      // que le rendu de ce même tick (registre, grille, lobby) les voie déjà
      // à jour.
      syncPresence(yourPlayerId, game.colorSlots);
      // Peinture de l'overlay de vote (doc 04) : dérivée de `game.proposal`
      // seul, à CHAQUE onChange (y compris la reconstruction ci-dessous) —
      // contrairement aux notifications transitoires plus bas, elle n'a rien
      // d'un événement ponctuel à manquer.
      renderLobby(game, yourPlayerId);

      if (event?.name === "stateSync" && event.isNewGame) {
        if (game.phase === "playing") enterGameScreen(game);
        else enterMapScreen(game);
        // Rien n'est affiché tant que .booting est là (style.css) : on ne la
        // retire qu'une fois le tout premier écran effectivement peint —
        // avant ce point, `Rune.initClient` n'a encore rien rendu (doc 08 §
        // Écran de chargement : pas de spinner, juste ne rien montrer).
        document.body.classList.remove("booting");
        return;
      }

      // Notifications éphémères (doc 04) : jamais avant ce point (le early
      // return ci-dessus couvre la reconstruction) — une snackbar déjà connue
      // au moment d'un stateSync ne peut donc jamais rejouer.
      notifyLobbyEvents(game, previousGame, event);

      if (isRoundStart(game, previousGame)) {
        enterGameScreen(game);
        return;
      }
      if (isRoundEnd(game, previousGame)) {
        enterMapScreen(game);
        return;
      }

      if (game.phase === "playing") {
        const foundGrew = game.found.length > previousGame.found.length;
        const wonNow = justWon(game, previousGame);
        // Course sur le même mot (doc 05 § Conflits) : rollbacks de onChange
        // en premier (mon submitWord a été invalidé), diff de found en filet
        // (retrouver qui a gagné parmi les entrées fraîchement confirmées).
        const race = wordRaceLost(game, previousGame, yourPlayerId, rollbacks);
        syncFromGame(game); // won/ready/found/traces à jour, même sans mot trouvé
        renderRemoteTraces(); // redessine tracés distants + fond des cases (doc 05)
        if (race) {
          showSnackbar(
            `${Rune.getPlayerInfo(race.winner).displayName} a trouvé « ${race.word} » juste avant`,
          );
        }
        if (foundGrew) handleFoundGrowth(game, previousGame.found.length);
        if (wonNow) handleWon(game);
      } else if (local.screen === "map" && !isBackgroundTick(event?.name)) {
        enterMapScreen(game);
      }
    },
  });
}

// .booting est retirée depuis l'intérieur d'onChange (premier stateSync) : le
// tout premier rendu (carte ou grille) doit être en place avant de révéler
// quoi que ce soit. Filet de sécurité seulement : un échec avant même d'y
// arriver (assets, Pixi) ne doit pas laisser le joueur devant un écran vide à
// jamais — mieux vaut révéler un chrome incomplet qu'un mur de papier.
boot().catch((err) => {
  console.error("Tracemot : échec du démarrage", err);
  document.body.classList.remove("booting");
});
