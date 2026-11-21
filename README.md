# Régulation des techniciens : version iPhone

Une application web qui s'installe sur l'écran d'accueil de l'iPhone. Quand un client appelle, vous choisissez sa commune, la nature de la visite (dépannage ou entretien) et le type d'intervention : les techniciens disponibles sont classés par distance par la route.

- **Régulation** : carte, classement des techniciens, trajets, appel du technicien d'un toucher, position temporaire d'un technicien (bouton « Changer » à côté de sa position, sur sa vignette ; effacée au changement de nature de visite ou de type d'intervention).
- **Gestion** : techniciens, leur point de départ et ce qu'ils font en dépannage et en entretien, absences, types d'intervention et durée d'un entretien, nom de l'entreprise et département, sauvegarde.

## Où sont les données ?

**Uniquement dans le téléphone**, dans le stockage de l'application. Ce dépôt et le site GitHub Pages ne contiennent que le code : aucun nom, aucun numéro de téléphone.

Conséquence : si le téléphone est perdu, remplacé ou réinitialisé, les données partent avec lui. Pensez à **exporter une sauvegarde** régulièrement (Gestion › Sauvegarde), par exemple dans Fichiers › iCloud Drive.

## Mettre l'application en ligne avec GitHub Pages (une seule fois)

1. Sur github.com, créez un dépôt **public** (bouton « New »), par exemple `regulation`.
2. Dans le dépôt, cliquez sur « uploading an existing file » (ou « Add file › Upload files ») et glissez **le contenu** du dossier `version-iphone` (les fichiers et les dossiers `lib`, `polices`, `donnees`), pas le dossier lui-même. Validez avec « Commit changes ».
3. Allez dans **Settings › Pages**. Sous « Build and deployment », choisissez *Source : Deploy from a branch*, puis la branche `main` et le dossier `/ (root)`. Enregistrez.
4. Après une ou deux minutes, l'adresse du site s'affiche en haut de cette page : `https://<votre-identifiant>.github.io/regulation/`.

## Installer sur l'iPhone

1. Ouvrez l'adresse dans **Safari**.
2. Touchez le bouton Partager, puis **« Sur l'écran d'accueil »**, puis « Ajouter ».
3. Ouvrez l'application depuis son icône sur l'écran d'accueil, plus depuis Safari.

C'est important : sur iPhone, les données d'un site seulement ouvert dans Safari peuvent être effacées après quelques jours sans visite. Une fois l'application installée sur l'écran d'accueil, ses données sont conservées.

Au premier lancement, l'application contient les 10 techniciens d'exemple de la version d'origine : remplacez-les depuis Gestion.

## Versions

Le numéro de version s'affiche en haut de l'application, à côté du nom de l'entreprise (par exemple « v0.1.0 »). Il est défini à un seul endroit : le fichier `version.js`. Chaque version publiée porte un tag du même nom sur GitHub (`v0.1.0`…), et ses changements sont décrits dans `CHANGELOG.md`.

Numérotation : `MAJEUR.MINEUR.CORRECTIF`. Une correction augmente le dernier chiffre (0.1.0 → 0.1.1), une nouvelle fonction celui du milieu (0.1.1 → 0.2.0).

## Mettre à jour l'application

1. Changez le numéro dans `version.js` et ajoutez une entrée dans `CHANGELOG.md`.
2. Remplacez les fichiers modifiés dans le dépôt GitHub (glisser-déposer dans « Add file › Upload files », puis « Commit changes »).
3. Créez le tag de la version : sur GitHub, « Releases › Draft a new release », tag `vX.Y.Z` sur la branche `main`, puis « Publish release ».
4. Sur l'iPhone, fermez l'application et rouvrez-la : le numéro affiché en haut doit être le nouveau. Les données ne sont pas touchées.

## Services utilisés

Une connexion internet est nécessaire pour la carte, la recherche des communes hors département et le calcul des trajets.

| Service | Usage |
|---|---|
| [OpenFreeMap](https://openfreemap.org) | Fond de carte (données OpenStreetMap) |
| [IGN Géoplateforme](https://cartes.gouv.fr) | Calcul des trajets, contour du département, recherche d'adresses, Plan IGN si OpenFreeMap ne répond pas |
| [geo.api.gouv.fr](https://geo.api.gouv.fr) | Liste des communes et des départements |

Bibliothèques fournies avec l'application (dossier `lib`) : Leaflet (licence BSD-2), MapLibre GL JS (BSD-3), maplibre-gl-leaflet (ISC). Polices Barlow et Barlow Semi Condensed (licence SIL OFL, dossier `polices`).
