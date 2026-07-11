# Spec fonctionnelle : grille plein écran, zoom et pan

Le projet doit accueillir des grilles bien plus grandes que 5×5. L'encart à taille fixe qui contient la grille aujourd'hui ne tiendra pas : la grille devient la scène du jeu, rendue dans un viewport caméra (zoom + pan) qui occupe tout l'écran, et l'UI passe en surimpression au-dessus.

## Caméra

- Vue initiale : *fit*, la grille entière cadrée et centrée dans le viewport.
- Dézoom plafonné à ce fit : on ne peut pas voir « moins » que la grille entière.
- Zoom avant plafonné à quelques cases plein écran.
- Pan borné aux limites de la grille.
- Le zoom est centré sur le pointeur (molette) ou le point de pinch.

## Gestes et commandes

| Action | Mobile | Desktop |
| --- | --- | --- |
| Tracé | 1 doigt partant d'une case | clic gauche partant d'une case |
| Pan | 2 doigts | drag hors case, drag au clic du milieu, flèches et ZQSD/WASD |
| Zoom | pinch | molette, boutons + / − |

Boutons flottants en coin : **+**, **−** et **« tout voir »** qui remet la caméra sur le fit initial.

### Auto-pan pendant le tracé

Si le pointeur approche du bord du viewport en cours de tracé, la caméra suit doucement pour continuer le mot hors de la vue courante. Inclus dès ce chantier : indispensable dès qu'un mot dépassera l'écran.

## UI en surimpression

La grille reste seule en arrière-plan, sur 100 % du viewport. Par-dessus :

- Header (titre, chip de difficulté, chrono) en bandeau flottant en haut.
- Registre « Mots trouvés » en panneau flottant **repliable**, ancré à un bord.
- Consigne discrète, contrôles de zoom en coin.
- Statut de chargement et écran de victoire en overlay également.

## Périmètre

La grille reste 5×5 (génération inchangée), mais rendu, tracé, caméra et UI ne supposent plus 5×5 nulle part : tout est paramétré par les dimensions de la grille, pour accueillir les grandes grilles ensuite.
