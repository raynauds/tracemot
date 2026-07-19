// Notification éphémère (doc 04 § UI) : composant NEUF, réutilisable — refus,
// absence de réponse, course de propositions, arrivées/départs de joueurs
// (client.ts), et plus tard « déjà trouvé » (doc 05). Empilé, tokens du
// design system (src/render/snackbar.css). Auto-dismiss ~4 s, balayable
// (swipe horizontal), `prefers-reduced-motion` respecté (la feuille de style
// retire le glissement d'entrée, cette API ne pilote jamais d'animation en
// JS).

const AUTO_DISMISS_MS = 4000;
const SWIPE_DISMISS_PX = 60;
// Doit couvrir la transition CSS (transform/opacity 0.2s, snackbar.css) :
// filet de sécurité si `transitionend` ne se déclenche pas (élément déjà
// retiré, etc.) — retirer un nœud déjà retiré ne fait rien.
const LEAVE_FALLBACK_MS = 260;

const stackEl = document.getElementById("snackbar-stack") as HTMLElement;

export function showSnackbar(message: string): void {
  const toast = document.createElement("div");
  toast.className = "snackbar";
  const text = document.createElement("span");
  text.className = "snackbar-text";
  text.textContent = message;
  toast.appendChild(text);
  stackEl.appendChild(toast);

  let dismissed = false;
  let timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.classList.remove("is-dragging");
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), LEAVE_FALLBACK_MS);
  }

  // Balayage horizontal : relâcher au-delà du seuil ferme le toast tout de
  // suite ; en-deçà, il reprend sa place et le minuteur d'auto-dismiss
  // repart de zéro (déplacer le doigt vaut lecture, il n'a pas à disparaître
  // aussitôt relâché).
  let startX = 0;
  let dx = 0;

  toast.addEventListener("pointerdown", (e) => {
    if (dismissed) return;
    clearTimeout(timer);
    startX = e.clientX;
    dx = 0;
    toast.classList.add("is-dragging");
    toast.setPointerCapture(e.pointerId);
  });
  toast.addEventListener("pointermove", (e) => {
    if (dismissed || !toast.classList.contains("is-dragging")) return;
    dx = e.clientX - startX;
    toast.style.transform = `translateX(${dx}px)`;
    toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
  });
  function endDrag(): void {
    if (dismissed || !toast.classList.contains("is-dragging")) return;
    toast.classList.remove("is-dragging");
    if (Math.abs(dx) > SWIPE_DISMISS_PX) {
      toast.style.transform = `translateX(${dx > 0 ? 400 : -400}px)`;
      dismiss();
      return;
    }
    toast.style.transform = "";
    toast.style.opacity = "";
    timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
  }
  toast.addEventListener("pointerup", endDrag);
  toast.addEventListener("pointercancel", endDrag);
}
