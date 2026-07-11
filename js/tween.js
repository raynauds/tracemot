// @ts-check
// Petit moteur de tweens sur le Ticker de l'app. Chaque tween interpole une
// progression `k` de 0 à 1 sur `duration` ms (après un éventuel `delay`), avec
// un easing, et appelle onUpdate(k) chaque frame puis onComplete à la fin.
// Un `id` optionnel garantit l'unicité : (re)lancer un tween avec le même id
// annule le précédent — indispensable pour ne pas empiler deux animations sur
// la même propriété (ex. deal puis pop sur une même case).

/** @typedef {import("pixi.js").Ticker} Ticker */

/** Easing par défaut : sortie cubique (démarre vite, finit en douceur). */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/** Easing symétrique (accélère puis décélère). */
export const easeInOutQuad = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * @typedef {Object} TweenSpec
 * @property {number} duration               durée en ms
 * @property {(k: number) => void} onUpdate  reçoit la progression easée (0→1)
 * @property {string} [id]                    clé d'unicité (annule le même id)
 * @property {number} [delay]                 ms avant démarrage (stagger)
 * @property {(t: number) => number} [ease]   easing (défaut : linéaire)
 * @property {() => void} [onComplete]
 */

/**
 * @typedef {Object} RunningTween
 * @property {string|undefined} id
 * @property {number} duration
 * @property {number} delay
 * @property {(t: number) => number} ease
 * @property {(k: number) => void} onUpdate
 * @property {(() => void)|undefined} onComplete
 * @property {number} elapsed
 */

/** @type {RunningTween[]} */
const tweens = [];
/** @type {Ticker|null} */
let ticker = null;

/**
 * Branche le moteur sur le Ticker de l'app (à appeler une fois, après app.init).
 * @param {Ticker} t
 */
export function initTweens(t) {
  ticker = t;
  ticker.add(step);
}

/** Avance tous les tweens actifs d'une frame. @param {Ticker} t */
function step(t) {
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

/**
 * Programme un tween. Renvoie sans rien faire si le moteur n'est pas branché.
 * @param {TweenSpec} spec
 */
export function tween(spec) {
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
