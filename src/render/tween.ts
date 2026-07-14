// Petit moteur de tweens sur le Ticker de l'app. Chaque tween interpole une
// progression `k` de 0 à 1 sur `duration` ms (après un éventuel `delay`), avec
// un easing, et appelle onUpdate(k) chaque frame puis onComplete à la fin.
// Un `id` optionnel garantit l'unicité : (re)lancer un tween avec le même id
// annule le précédent — indispensable pour ne pas empiler deux animations sur
// la même propriété (ex. deal puis pop sur une même case).

import type { Ticker } from "pixi.js";

/** Easing par défaut : sortie cubique (démarre vite, finit en douceur). */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
/** Easing symétrique (accélère puis décélère). */
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export interface TweenSpec {
  /** Durée en ms. */
  duration: number;
  /** Reçoit la progression easée (0→1). */
  onUpdate: (k: number) => void;
  /** Clé d'unicité (annule le même id). */
  id?: string;
  /** Ms avant démarrage (stagger). */
  delay?: number;
  /** Easing (défaut : linéaire). */
  ease?: (t: number) => number;
  onComplete?: () => void;
}

interface RunningTween {
  id: string | undefined;
  duration: number;
  delay: number;
  ease: (t: number) => number;
  onUpdate: (k: number) => void;
  onComplete: (() => void) | undefined;
  elapsed: number;
}

const tweens: RunningTween[] = [];
let ticker: Ticker | null = null;

/**
 * Branche le moteur sur le Ticker de l'app (à appeler une fois, après app.init).
 */
export function initTweens(t: Ticker): void {
  ticker = t;
  ticker.add(step);
}

/** Avance tous les tweens actifs d'une frame. */
function step(t: Ticker): void {
  const dt = t.deltaMS;
  // Parcours descendant : on retire les tweens terminés sans casser l'index.
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (tw.delay > 0) {
      tw.delay -= dt;
      if (tw.delay > 0) continue;
      // Reporte le trop-plein de la frame dans le temps écoulé.
      tw.elapsed += -tw.delay;
      tw.delay = 0;
    } else {
      tw.elapsed += dt;
    }
    const raw = tw.duration <= 0 ? 1 : Math.min(1, tw.elapsed / tw.duration);
    tw.onUpdate(tw.ease(raw));
    if (raw >= 1) {
      tweens.splice(i, 1);
      tw.onComplete?.();
    }
  }
}

// Annule tous les tweens en cours SANS appeler onComplete : utilisé au
// rebuild de la grille (changement de mode), où les onUpdate/onComplete
// capturés référenceraient des cases détruites.
export function cancelTweens(): void {
  tweens.length = 0;
}

/**
 * Programme un tween. Renvoie sans rien faire si le moteur n'est pas branché.
 */
export function tween(spec: TweenSpec): void {
  if (!ticker) return;
  if (spec.id) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      if (tweens[i].id === spec.id) tweens.splice(i, 1);
    }
  }
  tweens.push({
    id: spec.id,
    duration: spec.duration,
    delay: spec.delay || 0,
    ease: spec.ease || ((t) => t),
    onUpdate: spec.onUpdate,
    onComplete: spec.onComplete,
    elapsed: 0,
  });
}
