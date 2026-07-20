// Moteur sonore : un AudioContext unique, les fichiers du catalogue décodés
// une fois au boot en AudioBuffers, et une source jetable par lecture — deux
// ticks rapprochés se superposent donc naturellement, sans coupure.
//
// Le contexte naît suspendu (politique navigateur) : le décodage fonctionne
// quand même, et le premier geste du joueur — n'importe lequel — le réveille
// via des écouteurs globaux posés ici. Les appelants n'ont rien à savoir :
// playSound est fire-and-forget et ne jette JAMAIS (contexte verrouillé,
// fichier manquant, décodage raté → il ne se passe rien, le jeu ne casse pas
// pour une histoire de son).
//
// Pas de réglage de volume ici (doc 08 § Q21b) : Rune fournit ses propres
// contrôles audio in-app, le panneau maison (render/sound.ts) et sa
// persistance localStorage (traceword.vol-ui/traceword.vol-music) ont disparu
// avec lui. Ce module ne fait plus que précharger, jouer, débloquer.

import {
  MUSIC,
  SOUNDS,
  soundPath,
  soundVolume,
  type SoundId,
} from "./catalog.ts";

let ctx: AudioContext | null = null;
const buffers = new Map<SoundId, AudioBuffer>();
let uiGain: GainNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicGain: GainNode | null = null;
let musicStarted = false;

// Réveille le contexte au premier geste ; les écouteurs se retirent une fois
// le contexte effectivement actif (resume est asynchrone, un premier geste
// peut le laisser encore suspendu sur certains navigateurs — on réessaie).
function unlock() {
  if (!ctx) return;
  void ctx.resume().then(() => {
    if (ctx?.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      tryStartMusic();
    }
  });
}

// Lance la boucle de fond dès que contexte actif ET fichier décodé — les deux
// arrivent dans un ordre quelconque, chacun rappelle donc cette fonction. La
// source boucle sans fin ; baisser ou couper le volume joue sur son gain (la
// piste continue en sourdine, pas de reprise à zéro au retour du son).
function tryStartMusic() {
  if (musicStarted || !ctx || ctx.state !== "running" || !musicBuffer) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = musicBuffer;
    source.loop = true;
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC.volume;
    source.connect(musicGain).connect(ctx.destination);
    source.start();
    musicStarted = true;
  } catch {
    // Sans musique, le jeu continue.
  }
}

// Précharge et décode tous les sons du catalogue. À appeler une fois au boot ;
// sans Web Audio (ou si tout échoue), le jeu reste simplement silencieux.
export function initAudio() {
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  // Gain maître des bruitages : chaque lecture y branche son gain de mixage
  // (le catalogue). Sans réglage joueur par-dessus (doc 08 § Q21b) : c'est un
  // nœud de passage, pas un potentiomètre.
  uiGain = ctx.createGain();
  uiGain.connect(ctx.destination);
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  for (const id of Object.keys(SOUNDS) as SoundId[]) {
    void fetch(`sounds/${soundPath(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx!.decodeAudioData(data))
      .then((buffer) => buffers.set(id, buffer))
      .catch((err) => {
        console.warn(`Traceword : son « ${id} » indisponible`, err);
      });
  }

  void fetch(`sounds/${MUSIC.path}`)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => ctx!.decodeAudioData(data))
    .then((buffer) => {
      musicBuffer = buffer;
      tryStartMusic();
    })
    .catch((err) => {
      console.warn("Traceword : musique de fond indisponible", err);
    });
}

// Joue un son du catalogue. rate : vitesse de lecture (1 = nominale ; 2^(n/12)
// monte de n demi-tons — c'est le levier de la montée de hauteur du tracé).
export function playSound(
  id: SoundId,
  opts: { rate?: number; volume?: number } = {},
) {
  if (!ctx || ctx.state !== "running" || !uiGain) return;
  const buffer = buffers.get(id);
  if (!buffer) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (opts.rate !== undefined) source.playbackRate.value = opts.rate;
    const gain = ctx.createGain();
    gain.gain.value = soundVolume(id) * (opts.volume ?? 1);
    source.connect(gain).connect(uiGain);
    source.start();
  } catch {
    // Une lecture ratée est sans conséquence.
  }
}
