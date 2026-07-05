# Product

## Register

product

## Users

Grand public francophone, tous âges — des amateurs de mots croisés et de jeux
de lettres, de l'enfant à l'adulte. Le contexte d'usage est une pause courte :
on ouvre Tracemot pour une partie de quelques minutes, sur mobile comme sur
desktop. Les cinq paliers de difficulté (Doux → Brûlant) laissent chacun
choisir son niveau de défi de vocabulaire. Le job à accomplir est simple et
autonome : trouver les cinq mots de cinq lettres qui pavent la grille, sans
tutoriel ni compte, sans dépendance ni installation.

## Product Purpose

Tracemot est un jeu de lettres dans le navigateur : on trace des mots du doigt
ou à la souris sur une grille 5×5 dont chaque grille cache exactement cinq
mots de cinq lettres pavant les 25 cases. La partie est gagnée quand les cinq
sont trouvés. Le produit existe pour offrir un plaisir de mots court, propre et
sans friction — aucune pub, aucun build, aucun compte. Le succès, c'est une
partie qui se lance instantanément, une grille toujours résoluble, et une
envie de rejouer. Le design sert cet acte de jeu : lisibilité de la grille,
clarté du tracé, feedback net sur les mots trouvés et refusés.

## Brand Personality

Éditorial, posé, artisanal. Tracemot a le ton d'un objet imprimé de qualité —
typographie de presse (Source Serif 4) doublée d'un mono technique (IBM Plex
Mono), palette papier / encre / vermillon, sobriété soignée. La voix est
calme et sûre d'elle, jamais bruyante : on récompense sans crier, on guide
sans infantiliser. Émotions visées : satisfaction tranquille, sentiment de
qualité, envie de recommencer.

## Anti-references

- **App gamifiée criarde** (Candy Crush, clones Wordle tape-à-l'œil) :
  dégradés saturés, badges, pop-ups d'engagement, confettis omniprésents,
  boucles de rétention agressives. Le plaisir vient du mot, pas de la
  dopamine artificielle.
- **SaaS générique** : cartes identiques, bleu corporate, esthétique template
  interchangeable.
- **Néon / dark tech gaming** : fond sombre, accents néon, RGB.

## Design Principles

- **Le mot d'abord.** Rien ne doit voler la vedette à la grille et aux
  lettres. Chrome discret, contenu net.
- **Récompenser sans crier.** Le feedback (victoire, mot trouvé, mot refusé)
  est clair et franc mais reste dans le registre posé — vermillon ponctuel,
  pas de fête permanente.
- **Qualité imprimée.** Chaque détail typographique et chaque espacement
  visent la tenue d'une page composée, pas d'un écran d'app.
- **Zéro friction.** Ça se lance seul, ça se comprend sans notice, ça ne
  demande rien (compte, install, réseau lourd).
- **Honnêteté du système.** La grille est toujours pavable et résoluble ;
  l'interface ne ment jamais sur l'état du jeu.

## Accessibility & Inclusion

Cible WCAG 2.1 AA. Le texte courant atteint un contraste ≥ 4.5:1 (attention au
`--muted` sur `--paper`), le texte large ≥ 3:1. Alternative systématique à
`prefers-reduced-motion: reduce` pour le tracé, la victoire et les confettis
(crossfade ou transition instantanée). Cibles tactiles ≥ 44px sur les cases de
la grille et les contrôles. À surveiller : ne pas coder une information par la
seule couleur (un mot refusé s'accompagne déjà d'un motif — conserver ce
principe).
