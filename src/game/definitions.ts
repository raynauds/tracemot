// Définitions des mots via l'API du Wiktionnaire (fr.wiktionary.org).
// Les mots de la grille sont en majuscules sans accents ; on tente d'abord le
// titre exact en minuscules, puis la recherche plein texte pour retrouver le
// titre accentué (« pre » → « pré »). Résultats mis en cache ; le préchargement
// est lancé à la validation de chaque mot (main.ts) pour que tout soit prêt
// à l'affichage de l'écran de victoire.

export interface WordDefinition {
  /** Titre réel de la page Wiktionnaire (accentué). */
  title: string;
  /** Nature grammaticale abrégée (« n.m. », « adj. »…), vide si inconnue. */
  nature: string;
  /** Première définition, en texte brut. */
  text: string;
  /** URL de la page Wiktionnaire (attribution CC BY-SA). */
  url: string;
}

const API = "https://fr.wiktionary.org/w/api.php";

const NATURES: Record<string, string> = {
  nom: "n.",
  verbe: "v.",
  adjectif: "adj.",
  adverbe: "adv.",
  pronom: "pron.",
  interjection: "interj.",
  onomatopée: "onom.",
  préposition: "prép.",
  conjonction: "conj.",
};

/** Clé : mot majuscule sans accents. null = définition introuvable. */
const cache = new Map<string, WordDefinition | null>();
const pending = new Map<string, Promise<WordDefinition | null>>();

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Retire liens [[a|b]], modèles {{...}} et gras/italique du wikitext. */
function cleanWikitext(s: string): string {
  return s
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikitext(title: string): Promise<string | null> {
  const res = await fetch(
    `${API}?action=parse&prop=wikitext&format=json&formatversion=2&origin=*` +
      `&page=${encodeURIComponent(title)}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.parse?.wikitext ?? null;
}

/** Section française : première définition, nature et genre. */
function parseFrenchEntry(
  wikitext: string,
  title: string,
): WordDefinition | null {
  const fr = wikitext
    .split(/^== \{\{langue\|/m)
    .find((s) => s.startsWith("fr}}"));
  if (!fr) return null;
  const lines = fr.split("\n");
  const defIdx = lines.findIndex((l) => l.startsWith("# "));
  if (defIdx === -1) return null;
  // Nature : dernier titre === {{S|xxx|fr}} === au-dessus de la définition ;
  // genre : {{m}}/{{f}} sur la ligne de forme entre les deux.
  let nature = "";
  let genre = "";
  for (let i = defIdx - 1; i >= 0; i--) {
    const s = lines[i].match(/^=== \{\{S\|([^|}]+)/);
    if (s) {
      nature = NATURES[s[1]] ?? "";
      break;
    }
    const g = lines[i].match(/\{\{(m|f)\}\}/);
    if (g && !genre) genre = g[1];
  }
  if (nature === "n." && genre) nature = `n.${genre}.`;
  return {
    title,
    nature,
    text: cleanWikitext(lines[defIdx].slice(2)),
    url: `https://fr.wiktionary.org/wiki/${encodeURIComponent(title)}`,
  };
}

/** Titres dont la forme sans accents correspond au mot, accentués d'abord. */
async function searchAccentedTitles(word: string): Promise<string[]> {
  const res = await fetch(
    `${API}?action=query&list=search&srlimit=10&format=json&formatversion=2` +
      `&origin=*&srsearch=${encodeURIComponent(word)}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  const results: { title: string }[] = json.query?.search ?? [];
  return results
    .map((r) => r.title)
    .filter((t) => t !== word && stripAccents(t.toLowerCase()) === word)
    .sort(
      (a, b) => Number(stripAccents(b) !== b) - Number(stripAccents(a) !== a),
    );
}

async function resolveDefinition(
  word: string,
): Promise<WordDefinition | null> {
  const lower = word.toLowerCase();
  const exact = await fetchWikitext(lower);
  if (exact) {
    const def = parseFrenchEntry(exact, lower);
    if (def) return def;
  }
  const candidates = (await searchAccentedTitles(lower)).slice(0, 3);
  for (const title of candidates) {
    const wikitext = await fetchWikitext(title);
    const def = wikitext && parseFrenchEntry(wikitext, title);
    if (def) return def;
  }
  return null;
}

/** Charge (ou relit du cache) la définition d'un mot de la grille. */
export function preloadDefinition(
  word: string,
): Promise<WordDefinition | null> {
  const key = word.toUpperCase();
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  let p = pending.get(key);
  if (!p) {
    p = resolveDefinition(word)
      .catch(() => null)
      .then((def) => {
        cache.set(key, def);
        pending.delete(key);
        return def;
      });
    pending.set(key, p);
  }
  return p;
}
