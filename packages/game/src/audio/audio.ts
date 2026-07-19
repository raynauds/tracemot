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
// Deux volumes réglables par le joueur (panneau SONS, src/render/sound.ts) :
// l'interface et la musique, chacun sur son gain maître. Le catalogue garde le
// MIXAGE (l'équilibre relatif des sons entre eux) ; ces volumes-ci sont un
// multiplicateur global 0-1 par-dessus, persisté. À zéro, la voie est coupée —
// il n'y a pas de mute séparé, ce serait une seconde source de vérité.

import {
  MUSIC,
  SOUNDS,
  soundPath,
  soundVolume,
  type SoundId,
} from "./catalog.ts";

const UI_VOLUME_KEY = "tracemot.vol-ui";
const MUSIC_VOLUME_KEY = "tracemot.vol-music";

let ctx: AudioContext | null = null;
const buffers = new Map<SoundId, AudioBuffer>();
let uiVolume = 1;
let musicVolume = 1;
let uiGain: GainNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicGain: GainNode | null = null;
let musicStarted = false;

// Le curseur est linéaire, l'oreille non : un gain de 0,5 s'entend à peine
// plus bas que 1. Le carré redonne au milieu du curseur un « moitié moins
// fort » perçu. La courbe ne vit QUE dans les gains maîtres — le mixage du
// catalogue et les volumes ponctuels de playSound restent linéaires.
function perceived(volume: number): number {
  return volume * volume;
}

function readVolume(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return 1;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    // Stockage indisponible : plein volume, sans persistance.
    return 1;
  }
}

function writeVolume(key: string, volume: number) {
  try {
    localStorage.setItem(key, String(volume));
  } catch {
    // Sans stockage, le réglage vaut pour la session.
  }
}

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
    musicGain.gain.value = MUSIC.volume * perceived(musicVolume);
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
  uiVolume = readVolume(UI_VOLUME_KEY);
  musicVolume = readVolume(MUSIC_VOLUME_KEY);
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  // Gain maître des bruitages : chaque lecture y branche son gain de mixage.
  // Régler le volume de l'interface ne touche donc qu'un nœud, jamais les
  // sources en vol.
  uiGain = ctx.createGain();
  uiGain.gain.value = perceived(uiVolume);
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
        console.warn(`Tracemot : son « ${id} » indisponible`, err);
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
      console.warn("Tracemot : musique de fond indisponible", err);
    });
}

// Joue un son du catalogue. rate : vitesse de lecture (1 = nominale ; 2^(n/12)
// monte de n demi-tons — c'est le levier de la montée de hauteur du tracé).
export function playSound(
  id: SoundId,
  opts: { rate?: number; volume?: number } = {},
) {
  if (uiVolume === 0 || !ctx || ctx.state !== "running" || !uiGain) return;
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

// --- Volumes du joueur ------------------------------------------------------

export function getUiVolume() {
  return uiVolume;
}

export function getMusicVolume() {
  return musicVolume;
}

export function setUiVolume(volume: number) {
  uiVolume = Math.min(1, Math.max(0, volume));
  if (uiGain) uiGain.gain.value = perceived(uiVolume);
  writeVolume(UI_VOLUME_KEY, uiVolume);
}

export function setMusicVolume(volume: number) {
  musicVolume = Math.min(1, Math.max(0, volume));
  if (musicGain) musicGain.gain.value = MUSIC.volume * perceived(musicVolume);
  writeVolume(MUSIC_VOLUME_KEY, musicVolume);
}
