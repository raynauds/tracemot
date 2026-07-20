import type { Difficulty } from "@traceword/core";

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

// Libellés des difficultés : le nom est un RANG (échelle de médailles
// Bronze→Platine, comprise partout, traduction triviale) ; la description,
// elle, décrit la grille. Présentation pure, donc ici et pas dans core :
// logic et state ne transportent que le code (Section), jamais un libellé.
// Chaînes littérales obligatoires — `npx rune extract-translations`
// (index.html) ne repère que les appels Rune.t écrits en dur — et switch
// exhaustif : ajouter une difficulté casse la compilation ici même.

export function difficultyName(s: Difficulty): string {
  switch (s) {
    case 1:
      return Rune.t("Bronze");
    case 2:
      return Rune.t("Argent");
    case 3:
      return Rune.t("Or");
    case 4:
      return Rune.t("Platine");
  }
}

export function difficultyDesc(s: Difficulty): string {
  switch (s) {
    case 1:
      return Rune.t("Que des mots très courants");
    case 2:
      return Rune.t("Un ou deux mots moins courants");
    case 3:
      return Rune.t("Une bonne pincée de mots moins courants");
    case 4:
      return Rune.t("Quelques mots recherchés dans le lot");
  }
}
