# 05 — Présence temps réel

## Contrainte cadre

Rune n'offre **aucun canal dédié** au streaming d'inputs : tout passe par les actions, plafonnées à **10/joueur/seconde**, payload < 25 Ko. Le tracé en cours est aujourd'hui muté à chaque `pointermove` (bien au-delà de 10 Hz) : il faut découpler le tracé **local** (fluide, inchangé) de sa **publication**.

## Publication du tracé (`updateTrace`)

Recommandation (→ Q16) : publier le **tracé partiel complet** (liste d'indices de cases, ≤ 25 nombres en 5×5, ≤ 256 en défi 8×8 — trivialement sous 25 Ko), **sur changement de contenu seulement** (une case accrochée ou retirée, pas les pointermove intermédiaires), throttlé à **~150 ms** (≈ 6-7 actions/s max), avec :

- envoi *trailing* garanti tant que le tracé est **en cours** : le dernier état d'un burst part toujours (un tracé figé n'est jamais montré faux) ; mais **toute soumission (`submitWord`) ou effacement (`updateTrace([])`) annule l'envoi trailing en attente** — sinon le trailing partirait *après* le submit et repeuplerait `traces[playerId]` d'un tracé fantôme que logic venait de vider ;
- doigt levé sans soumission ou tracé < 2 lettres → `updateTrace({ path: [] })` (efface chez les autres) ;
- `submitWord` vide `traces[playerId]` côté logic : pas d'action d'effacement supplémentaire dans le cas nominal ;
- budget : 6-7 `updateTrace`/s + `submitWord` ≤ limite de 10/s avec marge. Le throttle vit dans `client/local-state.ts`.

Le tracé étant publié par cases accrochées (pas par coordonnées de doigt), le rendu distant est naturellement « par crans » : pas d'interpolation nécessaire (`Rune.interpolator` sans objet ici — il lisse des positions continues, pas des chemins discrets). Si le rendu par crans paraît sec, une micro-animation *client* d'extension du trait (tween existant) suffit.

## Rendu des tracés distants

- `traceLayer` (scene.ts) : aujourd'hui `ghostTrace` + `activeTrace`. Ajouter **un `Graphics` par joueur distant**, entre les deux (les tracés distants passent sous le mien : mon geste garde la priorité visuelle). `strokePath` est déjà paramétrée en couleur.
- Style distinct du tracé local (spec : « de manière plus légère ») : même largeur mais **alpha réduit** (~0.45) + teinte du joueur (doc 06). Les cases sous un tracé distant reçoivent un surlignage léger de la teinte (variation de `paintCell` — nouvel état `remote` sous `sel`/`head`, ma sélection gardant toujours le dessus si conflit).
- Tête du tracé distant : pastille avatar du joueur (12-16 px) posée sur la dernière case — identifie *qui* trace sans légende (doc 06, → Q19).
- Redraw sur diff de `traces[p]` uniquement. Coût Pixi négligeable (≤ 3 polylignes de ≤ 256 points).
- **Tracé distant muet** : un joueur déconnecté reste « présent » ~30 s (grâce de reconnexion Rune) avec son `traces[p]` figé — le client **estompe** (alpha réduit progressivement) tout tracé distant sans mise à jour depuis ~5 s, et l'efface au `playerLeft`.
- Hors viewport (caméra locale libre, zoom/pan par joueur) : v1 sans indicateur de bord ; à réévaluer sur les défis 16×16 après test Dev UI.

## Mots validés teintés

- `FoundWord.by` pilote : tracé fantôme du mot dans une **variation de la teinte** du trouveur (alpha fantôme actuel conservé), cases consommées avec un liseré/fond très léger de la teinte, ligne du registre avec pastille avatar + numéro teinté (`.word-num`) (doc 06).
- Mes propres mots gardent la sémantique actuelle (vermillon = acquis) (→ Q18b).
- `fillListRow` reçoit le `FoundWord` complet ; le registre devient une projection de `found` (reconstructible à tout moment — requis par `stateSync`).

## Conflits et courses

Deux joueurs peuvent interagir sur les mêmes cases ; le predict-rollback tranche par l'ordre serveur des actions.

1. **Course sur le même mot** : les deux clients valident localement, les deux soumettent. Le premier à l'ordre serveur gagne ; le second est rollback (`invalidAction` « déjà trouvé »). Chez le perdant : son affichage optimiste (mot à sa couleur) est repris par le diff — le mot réapparaît à la couleur du gagnant, avec snackbar discrète « X l'a trouvé juste avant » (→ Q15). Pas de flash d'erreur agressif : il n'a pas fait de faute.
2. **Cases consommées sous mon tracé en cours** : un mot validé par un autre consomme des cases que mon tracé traverse. Recommandation (→ Q14) : **invalidation immédiate** — le client annule le geste en cours (équivalent `cancelAllGestures`), feedback bref (les cases consommées se tassent déjà via `stampWord`). Justification : logic refuserait la soumission de toute façon (« case déjà consommée ») ; laisser finir un geste condamné est pire.
3. **Tracés distants qui se croisent** : purement visuel, aucun blocage — deux joueurs peuvent survoler les mêmes cases libres ; seule la soumission arbitre.
4. **Rollback d'un `updateTrace`** : sans enjeu (état cosmétique, vite écrasé par le suivant).

## Sons et haptique en multi

- Haptique (`buzz`) : uniquement pour **mes** validations (règle : l'haptique répond à mon geste).
- Sons : `word-stamp` pour tout mot validé (le mien plein volume, distant atténué ou variante discrète — réglage fin au chantier 4) ; `word-reject` uniquement local ; `level-win` inchangé (victoire commune).
- Aucune notification sonore de tracé distant (il bouge en continu, ce serait du bruit).
