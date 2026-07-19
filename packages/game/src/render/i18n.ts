// Rune.t embarque i18next : la résolution des variantes de pluriel
// (`_one`/`_other`…, générées par `npx rune extract-translations` dans
// index.html) ne s'active que si le paramètre `count` est un NOMBRE — avec
// une string, i18next cherche la clé de base, absente du tag (seules les
// variantes suffixées y sont), et retombe sur le français. La signature TS
// de Rune.t (rune-sdk/multiplayer.d.ts) ne déclarant que des strings, ce
// cast contrôlé est l'unique point où l'écart type/runtime est franchi.
export function countParam(n: number): string {
  return n as unknown as string;
}
