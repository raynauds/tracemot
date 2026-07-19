# Points à trancher — portage Rune multijoueur

Mode d'emploi : coche une case par point (ou remplis « Autre »), ajoute un commentaire si besoin. La première option est toujours ma recommandation. Une fois le doc traité, je mets à jour les docs 01-09 en conséquence. Les renvois `(doc N)` pointent vers le doc qui détaille le contexte.

Priorités : **Q1-Q5 bloquent le chantier 1**, Q18-Q19 le chantier 4, Q20 le chantier 5. Le reste a un défaut raisonnable.

---

## A. Périmètre et produit

### Q1. Périmètre des modes en v1 (doc 09)
Les 4 modes (5×5 → 8×8) et leurs défis (grilles jusqu'à 16×16) sont génériques dans le code — le coût technique de tout garder est quasi nul ; le risque est l'ergonomie tactile des très grandes grilles à plusieurs.
- [ ] **Tout garder** (recommandé) — l'architecture est générique ; on valide l'ergonomie 16×16 au Dev UI et on ajuste si ça coince
- [ ] 5×5 complet seulement (défis 10×10 inclus), le reste masqué en v1
- [ ] 5×5 + 6×6
- [ ] Autre : ___

### Q2. Solo et devenir de la version web (doc 01)
Rune permet `minPlayers: 1` et recommande de soutenir le jeu en solo. La migration est faite « en place » dans `packages/game`.
- [ ] **`minPlayers: 1`, version web abandonnée** (recommandé) — le jeu vit sur Rune, le solo y existe naturellement ; l'historique git garde la version web
- [ ] `minPlayers: 1`, et maintenir en parallèle une version web jouable (coût : double cible de build à vie)
- [ ] `minPlayers: 2` — Rune réservé au multi (déconseillé : Rune constate que beaucoup de joueurs essaient seuls)
- [ ] Autre : ___

### Q3. Langue du contenu (doc 08)
La plateforme Rune est internationale (UI traduisible en en/es/pt/ru via `Rune.t`), mais les grilles sont des mots **français** — intraduisibles sans regénérer des niveaux par langue.
- [ ] **UI traduite, contenu français assumé en v1** (recommandé) — dictionnaires multilingues = chantier futur éventuel
- [ ] Tout français, pas de `Rune.t` en v1 (plus simple, moins accueillant à la review)
- [ ] Prévoir dès la v1 des dictionnaires en/fr (gros chantier studio : génération + validation par langue)
- [ ] Autre : ___

### Q4. Progression web existante (doc 03)
Le localStorage du site web n'est pas transférable vers Rune (autre origine, autre appareil).
- [ ] **On repart de zéro sur Rune** (recommandé) — le jeu n'est pas publié, personne ne perd rien d'important
- [ ] Prévoir un code d'import manuel (saisie d'un code généré par le site web) — coût réel pour un gain marginal
- [ ] Autre : ___

### Q5. Coût de la section Corsé — décision déjà ouverte côté review UX (doc 03)
La section 4 coûte 4★ alors que le mode suivant s'ouvre à 3★ (documenté comme volontaire dans `progress.ts`, contesté par la review du 2026-07-19). À figer **avant** le premier upload : les seuils entrent dans la dérivation appliquée à des persisted en circulation.
- [ ] **Garder 4★ et assumer** (recommandé — c'est un choix de design argumenté : offrir une grille plus grande avant une difficulté plus rude) ; étiqueter « bonus » sur la carte si besoin
- [ ] Passer la section 4 à 3★ (avant le mode suivant)
- [ ] Autre : ___

---

## B. Progression partagée

### Q6. Portée de l'union (doc 03)
- [ ] **L'union porte sur les niveaux validés, tout le reste en dérive** (recommandé) — sections, étoiles, modes, teasing calculés sur l'union : un joueur avancé « offre » l'accès complet, exactement l'esprit de la spec
- [ ] L'union n'ouvre que l'accès aux niveaux, les étoiles/modes restent individuels (deux dérivations mélangées sur la carte : complexe et surprenant)
- [ ] Autre : ___

**Q6c — sous-point** : quand un joueur part, l'union rétrécit (des cases peuvent se re-verrouiller sur la carte, une partie en cours n'est pas affectée).
- [ ] **Oui, l'union est celle des présents** (recommandé — cohérent, recalcul automatique)
- [ ] Non, l'union ne fait que croître pendant la session (« high-water mark » de la room)
- [ ] Autre : ___

### Q7. Crédit d'une victoire multi (doc 03)
« Validé pour tout le monde » — jusqu'où ?
- [ ] **Crédité au persisted de tous les joueurs actifs au moment de la victoire** (recommandé) — ils repartent avec en solo ; un joueur parti avant la fin n'est pas crédité (nota : une microcoupure ne compte pas, Rune donne ~30 s de grâce de reconnexion avant de considérer un départ)
- [ ] Crédité aussi aux joueurs qui ont participé puis quitté avant la fin (nécessite de tracer les participants — et Rune n'expose pas le persisted des absents : crédit impossible après départ, donc option illusoire, listée pour mémoire)
- [ ] Validé pour la room seulement, chacun garde sa progression perso (contredit la spec « validé pour tout le monde »)
- [ ] Autre : ___

**Q7b — mots d'un joueur parti, au classement de victoire** (doc 07) : ses mots restent validés pour la grille, mais lui n'est plus là.
- [ ] **Il n'apparaît pas au classement, ses mots ne sont attribués à personne** (recommandé — cohérent avec le non-crédit ; le total de la grille reste juste)
- [ ] Ligne grisée « parti » avec son compte (transparent mais donne une ligne morte à l'écran)
- [ ] Ses mots sont réattribués « à la room » dans une ligne collective
- [ ] Autre : ___

### Q8. Étoiles gagnées en multi (doc 03)
Un défi validé ensemble donne une étoile à chacun (dérivée du persisted crédité).
- [ ] **Oui, étoile pour tous, annonce du palier chez tous** (recommandé — conséquence directe de Q7)
- [ ] Étoile pour tous mais annonce (« ★ n/12, débloque X ») seulement chez ceux pour qui c'est une première
- [ ] Autre : ___

### Q9. Présentation du badge « débloqué via autrui » (docs 03/06)
Techniquement : case active dans l'union mais pas dans ma progression. L'union pouvant venir de plusieurs joueurs, attribuer le badge à UNE personne est souvent impossible.
- [ ] **Badge neutre « grâce à la room »** (recommandé) : coin de case replié + entrée de légende, sans attribution nominative — simple, toujours vrai
- [ ] Badge teinté du contributeur quand il est unique et identifiable, neutre sinon (plus riche, plus de cas)
- [ ] Pastille avatar du/des contributeurs sur la case (dense sur une carte déjà chargée)
- [ ] Autre : ___

---

## C. Lobby « prêt ? »

### Q10. Navigation carte et droit de proposer (doc 04)
- [ ] **Carte locale (chacun navigue librement), n'importe qui propose, une proposition à la fois** (recommandé)
- [ ] Carte partagée (tout le monde voit la même navigation) — beaucoup de synchro pour peu de valeur
- [ ] Seul un « hôte » propose (la notion d'hôte n'existe pas naturellement dans Rune)
- [ ] Autre : ___

### Q11. Règles du vote (doc 04)
- [ ] **Unanimité des joueurs actifs, refus explicite ferme la proposition pour tous** (recommandé — c'est la spec)
- [ ] Majorité suffit (les refusés sont embarqués — contredit l'esprit « prêt ? »)
- [ ] Autre : ___

**Q11b — qui voit la snackbar « X a refusé »** : la spec dit « on a une snackbar » sans préciser chez qui.
- [ ] **Tous sauf le refuseur** (recommandé — tous les votants attendaient, tous doivent savoir pourquoi ça s'arrête)
- [ ] Seulement le proposeur
- [ ] Tout le monde, refuseur compris
- [ ] Autre : ___

**Q11c — joueur qui ne répond pas** :
- [ ] **Timeout doux ~30 s : la proposition expire d'elle-même, snackbar « sans réponse de X »** (recommandé — un AFK ne gèle pas la room)
- [ ] Pas de timeout en v1 : le proposeur peut annuler manuellement, c'est tout
- [ ] Timeout court (~10 s) valant acceptation tacite (risqué : on embarque un absent)
- [ ] Autre : ___

### Q12. Joueur qui rejoint (doc 04)
**En cours de partie** :
- [ ] **Il entre directement dans la grille en cours et peut jouer** (recommandé — c'est un jeu coopératif, zéro friction)
- [ ] Il attend la fin du niveau sur la carte (mode spectateur de fait)
- [ ] Autre : ___

**Q12b — pendant un vote** :
- [ ] **Il est ajouté au vote (unanimité des présents au lancement)** (recommandé — il est concerné par le niveau qui se lance)
- [ ] Le vote continue sans lui (il subit le lancement)
- [ ] Autre : ___

### Q13. Retour carte et enchaînements (docs 04/07)
- [ ] **Après victoire : retour carte et boutons SUIVANT/DÉFI libres (les boutons proposent → vote) ; en cours de partie : quitter le niveau = proposition d'abandon soumise aux autres** (recommandé)
- [ ] Retour carte toujours libre, la partie continue pour les autres même à 1 joueur restant (que faire quand le dernier part ?)
- [ ] Retour carte en cours de partie interdit (dur : un joueur coincé ne peut que quitter la room)
- [ ] Autre : ___

---

## D. En partie

### Q14. Cases consommées sous mon tracé en cours (doc 05)
Un autre joueur valide un mot qui consomme des cases que mon tracé traverse.
- [ ] **Invalidation immédiate de mon tracé** (recommandé — logic refuserait ma soumission de toute façon ; feedback bref, pas de flow d'erreur)
- [ ] Mon tracé est amputé des cases consommées et continue s'il reste contigu (complexe, cas tordus)
- [ ] Autre : ___

### Q15. Course sur le même mot (doc 05)
- [ ] **L'ordre serveur fait foi ; le perdant voit le mot passer à la couleur du gagnant + snackbar discrète** (recommandé — pas de flash d'erreur, il n'a pas fauté)
- [ ] Le perdant reçoit le flow de refus standard (flash/secousse — punitif pour une non-faute)
- [ ] Autre : ___

**Q15b — égalités au classement** (doc 07) :
- [ ] **Ex æquo au même rang** (recommandé — jeu coopératif, pas de départage artificiel)
- [ ] Départage par ordre de validation (le premier arrivé devant)
- [ ] Autre : ___

### Q16. Fréquence de publication du tracé (doc 05)
Plafond Rune : 10 actions/joueur/s, aucun canal dédié au temps réel.
- [ ] **Tracé partiel complet à chaque case accrochée/retirée, throttle ~150 ms (≈ 6-7/s), envoi final garanti** (recommandé — simple, robuste, dans le budget)
- [ ] Fréquence plus basse (~3/s) pour garder de la marge (tracés distants plus saccadés)
- [ ] Pas de tracé temps réel en v1 : on ne voit que les mots validés (ampute la spec, mais divise le chantier 4)
- [ ] Autre : ___

### Q17. Rejouer un niveau déjà validé (doc 04)
- [ ] **Autorisé, même flow de vote** (recommandé — le rejeu est libre en solo ; à plusieurs, les teintes par trouveur lui redonnent un intérêt)
- [ ] Interdit en multi (simplifie rien, frustre)
- [ ] Autre : ___

---

## E. Identité visuelle

### Q18. Dérogation à la direction artistique (doc 06)
DESIGN.md : « le vermillon est la seule couleur d'accent ». Le multi impose d'identifier les autres joueurs. Nota technique : il faut **4 encres en tokens** (l'attribution des couleurs est globale — la teinte de X est la même sur tous les écrans — et une room compte jusqu'à 4 joueurs), mais chaque écran n'en **affiche** que 3 au plus : on ne se voit pas soi-même.
- [ ] **Palette « encres d'autres mains » : 4 encres sourdes (pétrole/violette/olive/ocre) en tokens, affichées uniquement pour les AUTRES joueurs ; le joueur local garde encre + vermillon ; dérogation documentée dans DESIGN.md** (recommandé)
- [ ] Chaque joueur se voit AUSSI de sa couleur (rupture plus profonde : « l'encre » n'est plus la voix du joueur local)
- [ ] Pas de couleurs : identification par pastille avatar seule (fragile en périphérie du regard, tracés distants indistincts entre eux)
- [ ] Autre : ___

**Q18b — le vermillon en multi** :
- [ ] **Mes mots validés restent vermillon, ceux des autres prennent leur teinte** (recommandé — « vermillon = gagné par moi » : la sémantique s'affine sans se briser)
- [ ] Tous les mots validés en vermillon, seule une pastille distingue le trouveur (spec « variation de teinte » affaiblie)
- [ ] Autre : ___

### Q19. Identification au-delà de la couleur (doc 06)
La spec me laisse trancher (« pastille à côté ou quoi, tu décides ») — je propose, tu valides :
- [ ] **Teinte + pastille avatar Rune cerclée de la teinte** (recommandé) : tête du tracé distant, ligne du registre, prompt/snackbar/classement — l'avatar Rune est connu du joueur, le lien couleur↔personne se réapprend à chaque regard
- [ ] Teinte + initiale du prénom dans une pastille (pas d'image à charger, moins reconnaissable)
- [ ] Teinte seule + légende des joueurs quelque part à l'écran (charge un chrome déjà dense)
- [ ] Autre : ___

---

## F. Plateforme

### Q20. `Rune.gameOver` (doc 07)
Le popup standard Rune clôt la partie — incompatible avec l'enchaînement de niveaux dans la room. La doc n'oblige nulle part à l'appeler, mais c'est une zone grise review.
- [ ] **Jamais de `gameOver` par niveau ; écran de victoire maison + enchaînement ; on valide en playtest et on garde les replis documentés (doc 07)** (recommandé)
- [ ] `gameOver({players: scores, delayPopUp}) `à chaque niveau : conforme d'office, mais casse l'enchaînement (nouvelle room à chaque niveau ?) — à n'activer que si la review l'exige
- [ ] `gameOver` sur jalon rare (mode complété) uniquement
- [ ] Autre : ___

### Q21. Suppressions recommandées par les best practices Rune (doc 08)
Précision de statut : la doc Rune classe menus/pause/audio en **best practices** vérifiées à la review humaine (« Avoid UI Like Menu Screens… »), pas en interdictions écrites. S'y conformer d'emblée évite un cycle de review perdu ; mais c'est bien un arbitrage, pas une fatalité.

**Q21a — écran d'accueil** (menu) :
- [ ] **Supprimer, la carte devient le premier écran** (recommandé) ; le bouton REPRENDRE migre en tête de carte
- [ ] Garder l'accueil et tenter la review avec (risque d'aller-retour)
- [ ] Autre : ___

**Q21b — panneau audio** (volumes UI/musique) :
- [ ] **Supprimer : panneau + persistance des volumes (`audio.ts`), les contrôles Rune font foi** (recommandé)
- [ ] Garder un simple mute in-game (doublon avec Rune, risque review résiduel)
- [ ] Autre : ___

**Q21c — écran crédits** — ⚠ les attributions JDSherbert et Nathan Gibson sont **contractuelles** (licences des sons, cf. `index.html:338`) : où qu'on les mette, elles doivent exister.
- [ ] **Retirer l'écran ; migrer TOUTES les attributions requises (JDSherbert, Nathan Gibson, Kenney) dans la description du jeu, après vérification des termes de chaque licence** (recommandé)
- [ ] Garder l'écran crédits sans liens cliquables (satisfait les licences, risque review résiduel faible)
- [ ] Autre : ___

### Q22. Geste retour (`history.ts`) (doc 08)
- [ ] **Retirer la gestion d'historique, laisser le retour système à l'app Rune** (recommandé — hypothèse à confirmer au Dev UI ; si la webview donne un retour utilisable, on avisera)
- [ ] Garder et tester d'abord, retirer si conflit
- [ ] Autre : ___

---

## G. Vrac / vigilances (pas de case à cocher, juste à savoir)

- La notation « 5-5 » de ta demande : je l'ai lue comme « le mode 5×5 » (les ids de niveaux vont de 1-1 à 4-C ; « 5-5 » n'existe pas). Dis-moi si tu voulais autre chose.
- MEMORY.md mentionne une échelle de difficulté « Doux→Brûlant » validée ; le code dit Doux/Équilibré/Relevé/Corsé. Le code fait foi pour ce plan — signale si l'échelle doit changer (ça touchera `Rune.t` et la carte).
- Signatures exactes de `Rune.interpolator`/`interpolatorLatency` non documentées ([TODO côté skill]) — sans impact prévu (le plan n'en a pas besoin), à vérifier seulement si on lisse un jour les tracés.
- Comportement précis du popup gameOver et du départ de joueur sans callback : à tester au Dev UI (chantiers 1 et 5).
- « Points reportés » solo (sauvegarde de partie en cours sur les grands défis, indices) : hors périmètre v1 — le multi atténue le blocage (les autres joueurs servent d'indices vivants). Réouvrable après.
