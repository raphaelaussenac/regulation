# Changements

## v0.2.3 · 21 novembre 2026

- Régulation : le panneau commence directement par « Commune du client » (titre « Qui appeler ? » et texte d'explication retirés).
- Changement de position : la liste des adresses proposées est lisible sur toutes les vignettes (texte foncé sur fond blanc, plus grand, sur toute la largeur de la vignette) ; sur téléphone, la vignette remonte en haut de l'écran pour que la liste reste au-dessus du clavier.

## v0.2.2 · 21 novembre 2026

- Le bouton « Changer » est placé juste à côté de la position du technicien ; il se transforme sur place en champ de recherche d'adresse (plus de fenêtre). Choisir une adresse dans la liste l'enregistre.
- Les techniciens en position temporaire se repèrent d'un coup d'œil : vignette à cadre et fond ambre, étiquette « Position temporaire », repère ambre sur la carte. Le bouton « Revenir à … » les remet à leur position habituelle.
- Changer la nature de la visite ou le type d'intervention efface toutes les positions temporaires.

## v0.2.1 · 21 novembre 2026

- Position temporaire sans date : elle reste valable jusqu'au retour à la position habituelle.
- Bouton « Revenir à la position habituelle » sur la vignette du technicien concerné (et sur sa fiche dans Gestion).
- Une position temporaire de la v0.2.0 dont la date est passée est retirée ; les autres restent en place, sans date.

## v0.2.0 · 21 novembre 2026

- Position temporaire : un bouton « Changer de position » sur chaque vignette de la Régulation indique où se trouve un technicien aujourd'hui ou jusqu'à une date. Le classement, les trajets et la carte partent de cette position ; passé la date, le technicien repart de son point de départ habituel, sans rien faire.
- Gestion : la position temporaire en cours s'affiche sur la fiche, avec un bouton pour y mettre fin.
- Les sauvegardes gardent les positions temporaires encore valables.

## v0.1.0 · 21 novembre 2026

Première version pour iPhone, sans serveur : les données restent dans le téléphone.

- Régulation : commune du client, nature de la visite (dépannage ou entretien), type d'intervention ; techniciens disponibles classés par distance par la route (IGN), carte et trajets.
- Gestion : techniciens (point de départ, compétences en dépannage et en entretien), absences, types d'intervention et durée d'un entretien, nom de l'entreprise et département.
- Sauvegarde : export et restauration d'un fichier, y compris le `donnees.json` de la version en ligne.
- Installation sur l'écran d'accueil, fonctionnement avec un réseau faible.
- Barre du haut dégagée de l'heure et de la batterie, numéro de version affiché.
