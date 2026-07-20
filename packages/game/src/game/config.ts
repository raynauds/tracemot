// Présentation du jeu : timings d'interface, géométrie du monde Pixi et
// palette numérique. Dérive du thème (src/theme/tokens.ts). Le domaine
// (dimensions des modes, barèmes, solveur) vit dans @traceword/core.

import { hex } from "../theme/tokens.ts";

// Durée d'affichage d'un mot refusé (rouge + motif) avant que la ligne
// du registre ne redevienne libre.
export const REJECT_DISPLAY_MS = 2000;

// Durée du tampon d'un mot validé dans le registre, au-delà de laquelle la
// classe déclencheuse est retirée. Doit couvrir l'animation `word-stamp`
// (src/render/ledger.css) : la classe laissée en place se rejouerait à chaque
// réapparition de la ligne (repli du registre, retour en partie).
export const WORD_STAMP_MS = 300;

// Délai entre le dernier mot validé et l'affichage de l'écran de victoire :
// laisse le tampon du mot (STAMP_MS, scene.ts) et le fondu de son tracé
// fantôme (GHOST_FADE_MS, scene.ts) se jouer sans être aussitôt recouverts
// par l'overlay .win.
export const WIN_DELAY_MS = 320;

// --- Géométrie du monde Pixi (unités « monde », échelle 1) -----------------
// Taille d'une case et espace inter-cases. La grille est rendue à cette
// échelle puis cadrée par la caméra ; aucune valeur écran n'est figée ici.
export const CELL_SIZE = 100;
export const CELL_GAP = 10;
// Marge de vue autour de la grille, en fraction du petit côté de l'écran.
// Règle « à quel point on peut dézoomer et écarter la grille » : au dézoom max,
// la grille laisse VIEW_MARGIN de vide de chaque côté (donc on dézoome plus), et
// cette même marge sert de débattement de pan supplémentaire pour pousser la
// grille hors de l'interface (registre, en-tête…). Monter la valeur = plus de
// marge et de dézoom.
export const VIEW_MARGIN = 0.2;
// Marge (px écran) visée au cadrage d'ouverture « tout voir ». Indépendante de
// VIEW_MARGIN : celle-ci fixe jusqu'où on peut dézoomer, FIT_MARGIN_PX fixe le
// zoom par défaut affiché au chargement (grille cadrée avec ce vide sur le côté
// contraignant, mots trouvés supposé fermé). Le résultat reste borné dans
// [fitScale, maxScale]. Baisser = grille plus grande à l'ouverture.
export const FIT_MARGIN_PX = 24;
// Zoom maximum : on ne voit jamais moins que ZOOM_MAX_CELLS cases de côté.
export const ZOOM_MAX_CELLS = 3;
// Facteur des boutons + / − (zoom discret).
export const ZOOM_STEP = 1.25;
// Pan clavier (flèches / ZQSD-WASD), en px/s.
export const KEY_PAN_SPEED = 900;

// --- Palette numérique (0xRRGGBB) pour Pixi -------------------------------
// DÉRIVÉE de src/theme/tokens.ts, la source unique de la palette : Pixi attend
// des nombres, le DOM des variables CSS (tokens.css, généré depuis le même
// module). Aucune couleur n'est recopiée, changer un token suffit.
export const PAPER = hex("paper");
export const CARD = hex("card");
export const CARD_HOVER = hex("card-hover");
export const INK = hex("ink");
export const VERMILION = hex("vermilion");
export const MUTED = hex("muted");
export const LINE = hex("line");
export const GHOST = hex("ghost");

// Encres d'autres mains (doc 06) : indexées par ColorSlot (0..3, logic/types.ts
// `colorSlots`) — jamais liées à un joueur nommé, seulement à son slot. Le
// joueur local n'y pioche jamais pour lui-même (il reste ink/vermillon) : ce
// tableau ne sert qu'à peindre CE QUE FONT LES AUTRES.
export const PLAYER_COLORS: readonly number[] = [
  hex("player-1"),
  hex("player-2"),
  hex("player-3"),
  hex("player-4"),
];
