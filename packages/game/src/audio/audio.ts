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

import { SOUNDS, soundPath, soundVolume, type SoundId } from "./catalog.ts";

const MUTED_KEY = "tracemot.muted";

let ctx: AudioContext | null = null;
const buffers = new Map<SoundId, AudioBuffer>();
let muted = false;

// Réveille le contexte au premier geste ; les écouteurs se retirent une fois
// le contexte effectivement actif (resume est asynchrone, un premier geste
// peut le laisser encore suspendu sur certains navigateurs — on réessaie).
function unlock() {
  if (!ctx) return;
  void ctx.resume().then(() => {
    if (ctx?.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  });
}

// Précharge et décode tous les sons du catalogue. À appeler une fois au boot ;
// sans Web Audio (ou si tout échoue), le jeu reste simplement silencieux.
export function initAudio() {
  try {
    muted = localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // Stockage indisponible : on part démuté, sans persistance.
  }
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
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
        console.warn(`Tracemot : son « ${id} » indisponible`, err);
      });
  }
}

// Joue un son du catalogue. rate : vitesse de lecture (1 = nominale ; 2^(n/12)
// monte de n demi-tons — c'est le levier de la montée de hauteur du tracé).
export function playSound(
  id: SoundId,
  opts: { rate?: number; volume?: number } = {},
) {
  if (muted || !ctx || ctx.state !== "running") return;
  const buffer = buffers.get(id);
  if (!buffer) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (opts.rate !== undefined) source.playbackRate.value = opts.rate;
    const gain = ctx.createGain();
    gain.gain.value = soundVolume(id) * (opts.volume ?? 1);
    source.connect(gain).connect(ctx.destination);
    source.start();
  } catch {
    // Une lecture ratée est sans conséquence.
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTED_KEY, on ? "1" : "0");
  } catch {
    // Sans stockage, le réglage vaut pour la session.
  }
}
