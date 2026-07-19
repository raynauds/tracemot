// Overlay de vote (doc 02/04 § Lobby « prêt ? ») : un SEUL état visible à la
// fois, dérivé de `game.proposal` et de `yourPlayerId` — l'auteur de la
// proposition (et tout joueur qui a déjà répondu, `proposal.accepted` en
// atteste) voit l'attente des autres ; ceux qui n'ont pas encore répondu (y
// compris un joueur qui vient de rejoindre en pleine proposition, doc 04 §
// Q12b) voient le prompt accepter/refuser. Posable par-dessus n'importe
// quel écran local (carte, partie, victoire) : le voile couvre tout
// (src/render/lobby.css, z-index au-dessus de map/win).
//
// Rendu à CHAQUE onChange (y compris stateSync/reconstruction) : ce module
// est purement une PEINTURE de l'état courant, jamais une source de
// notification transitoire — les snackbars (refus, timeout, course de
// propositions) restent décidées par client.ts à partir des diffs de
// src/client/diff.ts, précisément pour ne jamais rejouer sur un stateSync.

import { levelLabel } from "@tracemot/core";
import { playSound } from "../audio/audio.ts";
import type { PlayerId, Proposal, RuneGameState } from "../logic/types.ts";

const veilEl = document.getElementById("lobby-veil") as HTMLElement;
const cardEl = document.getElementById("lobby-card") as HTMLElement;

let onAccept: (() => void) | null = null;
let onRefuse: (() => void) | null = null;
let onCancel: (() => void) | null = null;

// État courant pour Échap (le seul raccourci clavier de ce composant) : quoi
// faire dépend de ce qui est affiché — refuser le prompt, ou annuler
// l'attente si JE suis le proposeur (un simple votant en attente n'a rien à
// annuler, seul son auteur le peut, doc 04 § Annulation).
let shown: "prompt" | "waiting" | null = null;
let shownIsProposer = false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function playerName(id: PlayerId): string {
  return Rune.getPlayerInfo(id).displayName;
}

// Pastille ronde : exception `border-radius` déjà prévue par DESIGN.md pour
// les pastilles de notification, étendue à l'avatar joueur (doc 06).
function avatar(id: PlayerId): HTMLElement {
  const img = el("img", "lobby-avatar");
  img.src = Rune.getPlayerInfo(id).avatarUrl;
  img.alt = "";
  return img;
}

// « 5×5 · 1-12 » (levelLabel, @tracemot/core) — vide pour un abandon (pas de
// niveau à nommer).
function levelDescription(proposal: Proposal): string {
  return proposal.modeId && proposal.levelId
    ? levelLabel(proposal.modeId, proposal.levelId)
    : "";
}

// Wordings et hiérarchie par cas (doc 04 § UI) : le bouton qui ACCEPTE la
// proposition énonce l'action déclenchée (jamais une question) et se place à
// droite en primaire — vermillon pour un démarrage (action attendue,
// positive), encre pour un abandon (destructif : surtout pas le vermillon,
// qui dit un mérite partout ailleurs). Le refus reste à gauche en bouton
// neutre ; pour l'abandon il nomme la voie sûre (« CONTINUER LA PARTIE »).
function buildPrompt(proposal: Proposal): void {
  cardEl.textContent = "";
  const isAbandon = proposal.kind === "abandon";
  cardEl.setAttribute(
    "aria-label",
    isAbandon ? Rune.t("Proposition de départ") : Rune.t("Proposition de niveau"),
  );
  cardEl.appendChild(
    el(
      "span",
      "lobby-title",
      isAbandon ? Rune.t("QUITTER LA PARTIE") : Rune.t("PROPOSITION"),
    ),
  );

  const line = el("p", "lobby-line");
  line.appendChild(avatar(proposal.proposedBy));
  const who = playerName(proposal.proposedBy);
  if (isAbandon) {
    line.append(Rune.t("{{who}} propose de quitter la partie", { who }));
  } else {
    line.append(Rune.t("{{who}} propose ", { who }));
    line.appendChild(el("strong", undefined, levelDescription(proposal)));
  }
  cardEl.appendChild(line);

  const actions = el("div", "lobby-actions");
  const refuse = el(
    "button",
    "lobby-btn",
    isAbandon ? Rune.t("CONTINUER LA PARTIE") : Rune.t("PAS MAINTENANT"),
  );
  refuse.type = "button";
  refuse.addEventListener("click", () => {
    playSound("ui-close");
    onRefuse?.();
  });
  const accept = el(
    "button",
    `lobby-btn is-primary${isAbandon ? "" : " is-start"}`,
    isAbandon ? Rune.t("QUITTER") : Rune.t("PRÊT !"),
  );
  accept.type = "button";
  accept.addEventListener("click", () => {
    playSound("ui-primary");
    onAccept?.();
  });
  actions.append(refuse, accept);
  cardEl.appendChild(actions);
}

function buildWaiting(
  game: RuneGameState,
  proposal: Proposal,
  isProposer: boolean,
): void {
  cardEl.textContent = "";
  cardEl.setAttribute("aria-label", Rune.t("En attente des autres joueurs"));
  cardEl.appendChild(el("span", "lobby-title", Rune.t("EN ATTENTE DES AUTRES")));

  const line = el("p", "lobby-line");
  if (proposal.kind === "abandon") {
    line.append(Rune.t("Départ proposé"));
  } else {
    line.append(Rune.t("Niveau proposé : "));
    line.appendChild(el("strong", undefined, levelDescription(proposal)));
  }
  cardEl.appendChild(line);

  const list = el("ul", "lobby-roster");
  for (const id of game.playerIds) {
    const row = el("li", "lobby-roster-row");
    row.appendChild(avatar(id));
    row.appendChild(el("span", "lobby-roster-name", playerName(id)));
    const ready = proposal.accepted.includes(id);
    row.appendChild(
      el(
        "span",
        `lobby-roster-status${ready ? " is-ready" : ""}`,
        ready ? Rune.t("PRÊT") : Rune.t("EN ATTENTE"),
      ),
    );
    list.appendChild(row);
  }
  cardEl.appendChild(list);

  if (isProposer) {
    const cancel = el("button", "lobby-btn", Rune.t("ANNULER"));
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      playSound("ui-close");
      onCancel?.();
    });
    cardEl.appendChild(cancel);
  }
}

// Spectateur (yourPlayerId indéfini, doc 02 § fin) : aucune UI d'action —
// même le voile reste caché, il n'a ni prompt à répondre ni proposition à
// annuler.
export function renderLobby(
  game: RuneGameState,
  yourPlayerId: PlayerId | undefined,
): void {
  const proposal = game.proposal;
  if (!proposal || !yourPlayerId) {
    veilEl.hidden = true;
    shown = null;
    return;
  }
  const answered = proposal.accepted.includes(yourPlayerId);
  if (answered) {
    shown = "waiting";
    shownIsProposer = proposal.proposedBy === yourPlayerId;
    buildWaiting(game, proposal, shownIsProposer);
  } else {
    shown = "prompt";
    buildPrompt(proposal);
  }
  veilEl.hidden = false;
}

export function bindLobby(handlers: {
  onAccept: () => void;
  onRefuse: () => void;
  onCancel: () => void;
}): void {
  onAccept = handlers.onAccept;
  onRefuse = handlers.onRefuse;
  onCancel = handlers.onCancel;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || veilEl.hidden) return;
    if (shown === "prompt") {
      playSound("ui-close");
      onRefuse?.();
    } else if (shown === "waiting" && shownIsProposer) {
      playSound("ui-close");
      onCancel?.();
    }
  });
}
