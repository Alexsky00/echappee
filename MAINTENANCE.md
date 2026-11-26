# Échappée — guide d'entretien

Ce guide explique comment faire vivre l'app **sans être développeur**.
Tout se fait depuis le site **github.com**, dans le navigateur : pas besoin d'installer quoi que ce soit.

- Le dépôt : https://github.com/Alexsky00/echappee
- L'app en ligne : https://alexsky00.github.io/echappee/

---

## Comment ça marche (en 30 secondes)

```
  Tu modifies un fichier sur github.com
              │
              ▼
  Le « robot » de GitHub se lance tout seul (2 minutes environ) :
   • il vérifie tes fichiers (et t'écrit un e-mail s'il y a une erreur),
   • il récupère les actus, fabrique les parcours demandés,
   • il met l'app en ligne.
              │
              ▼
  À sa prochaine ouverture, l'app de ton père se met à jour toute seule.
```

Le robot tourne aussi **toutes les heures** pour rafraîchir les actualités. Tu n'as rien à faire.

### Le réveil horaire (cron-job.org)
Le passage horaire de GitHub n'est pas fiable (une seule fois dans la nuit du 25 au 26/11/2026).
Depuis le 26/11/2026, le service gratuit **cron-job.org** (tâche « Échappée ») demande à GitHub
de lancer le robot toutes les heures. Dans l'onglet **Actions**, ces passages apparaissent
comme « Manually run by Alexsky00 ».
- Il utilise une clé GitHub `reveil-echappee` (droit « Actions : Read and write » sur le seul
  dépôt echappee) créée sur https://github.com/settings/personal-access-tokens.
- **Quand la clé expire** (GitHub prévient par e-mail) : sur cette page, ouvre `reveil-echappee`
  → **Regenerate token**, copie la nouvelle clé, puis sur cron-job.org modifie la tâche →
  onglet Advanced → en-tête `Authorization` : `Bearer ` + la nouvelle clé.
- Si cron-job.org affiche une erreur **401** : clé expirée ou mal collée (voir ci-dessus).

**Si tu fais une erreur** (une virgule oubliée par exemple), le robot refuse de publier.
L'ancienne version reste en ligne, rien n'est cassé, et GitHub t'envoie un e-mail.
Le message d'erreur (en français) explique quoi corriger : voir « [En cas de problème](#en-cas-de-problème) ».

### Modifier un fichier sur github.com

1. Ouvre https://github.com/Alexsky00/echappee et connecte-toi.
2. Clique sur le dossier puis sur le fichier (par exemple `donnees` → `calendrier.json`).
3. Clique sur le **crayon ✏️** en haut à droite du fichier (« Edit this file »).
4. Fais ta modification.
5. Clique sur le bouton vert **Commit changes…**, puis encore sur **Commit changes**.

C'est tout : c'est publié.

### Les règles d'écriture des fichiers `.json`

Les fichiers de données sont au format JSON. Trois règles suffisent :

- le texte est toujours **entre guillemets droits** : `"Paris-Roubaix"` ;
- les éléments d'une liste sont **séparés par des virgules**, mais **pas de virgule après le dernier** ;
- ne supprime pas les accolades `{ }` ni les crochets `[ ]`.

💡 Le plus simple : **copie une ligne existante**, colle-la juste en dessous, et change les valeurs.

---

## 1. Mettre à jour le calendrier de la saison

**Fichier :** `donnees/calendrier.json`
**Quand :** une fois par an (le calendrier UCI sort en général à l'automne), plus quelques retouches.

Chaque course tient sur une ligne :

```json
{ "id": "paris-roubaix", "nom": "Paris-Roubaix", "genre": "H", "debut": "2027-04-11", "fin": "2027-04-11", "pays": "FR", "categorie": "Monument", "type": "une journée", "diffuseurs": ["france-tv", "eurosport"], "a_verifier": ["diffuseurs"] },
```

| Champ | À quoi ça sert | Valeurs possibles |
|---|---|---|
| `id` | identifiant unique, en minuscules sans accent | `paris-roubaix`, `paris-roubaix-f`… |
| `nom` | le nom affiché | libre |
| `genre` | course hommes, femmes ou les deux | `H`, `F`, `mixte` |
| `debut`, `fin` | dates, **année-mois-jour** | `2027-04-11` (même date si une journée) |
| `pays` | code pays à 2 lettres (pour le drapeau) | `FR`, `BE`, `IT`, `ES`, `CH`… |
| `categorie` | couleur et étiquette | `Grand Tour`, `Monument`, `WorldTour`, `Classique`, `Championnat` |
| `type` | format | `une journée`, `à étapes`, `plusieurs épreuves` |
| `diffuseurs` | chaînes TV en France | codes de la liste `"diffuseurs"` en haut du fichier |
| `a_verifier` | affiche un « ? » dans l'app | `["dates"]`, `["diffuseurs"]`, `["dates", "diffuseurs"]` ou `[]` |

### Les chaînes TV

Elles sont définies **une seule fois** en haut du fichier :

```json
"diffuseurs": {
  "france-tv": { "nom": "France 2 / France 3", "gratuit": true,  "lien": "https://www.france.tv/sport/cyclisme/" },
  "eurosport": { "nom": "Eurosport (HBO Max)", "gratuit": false, "lien": "https://www.hbomax.com/fr/fr/sports" },
  "lequipe":   { "nom": "La Chaîne L'Équipe",  "gratuit": true,  "lien": "https://www.lequipe.fr/tv/" }
}
```

- Si Eurosport change de nom ou d'abonnement, modifie **seulement cette ligne** : toutes les courses suivent.
- Pour une nouvelle chaîne, ajoute une ligne, par exemple `"tf1": { "nom": "TF1", "gratuit": true }`, puis utilise `"tf1"` dans les courses.

### ⚠️ À vérifier pour la saison 2027 (pré-remplie le 25 novembre 2026)

- **Toutes les chaînes TV** : elles sont reprises de 2026. Les droits TV changent souvent.
  Vérifie au fil de la saison (les sites spécialisés publient « où voir la course » quelques jours avant), puis retire `"diffuseurs"` de `a_verifier`.
- **Les dates estimées**, marquées `"dates"` dans `a_verifier` : Kuurne-Bruxelles-Kuurne, Paris-Roubaix Femmes, Championnats de France, Vuelta Femenina (dates non annoncées par l'UCI), Paris-Tours.
- Les autres dates viennent du calendrier officiel de l'UCI.

### Nouvelle saison

1. Change `"saison": 2027` en `"saison": 2028`, et `"verifie_le"` avec la date du jour.
2. Mets à jour les dates de chaque course. Ajoute ou supprime des lignes au besoin.
3. Remets `"a_verifier": ["diffuseurs"]` partout tant que les chaînes ne sont pas confirmées.

Les courses passées ne gênent pas : l'app ne montre que celles à venir (sauf dans la vue « Par mois »).

---

## 2. Ajouter ou retirer une source d'actus

**Fichier :** `donnees/sources.json`

Il y a deux listes : `"pro"` (onglet Actus) et `"materiel"` (onglet Matériel).

```json
{ "nom": "Vélo 101", "rss": "https://www.velo101.com/rss", "actif": true },
```

- **Retirer une source** : mets `"actif": false`. Elle disparaît de l'app, et tu peux la réactiver plus tard.
- **Ajouter une source** : copie une ligne, change le `nom` et l'adresse `rss`.
- **Filtrer une source trop généraliste** (facultatif) : ajoute une liste `"mots_cles"`. Seuls les articles dont le titre contient un de ces mots seront gardés.
  ```json
  { "nom": "Le Cycle", "rss": "https://www.lecycle.fr/feed/", "actif": true, "mots_cles": ["test", "roues", "nouveau"] },
  ```

### Trouver l'adresse RSS d'un site

Essaie dans ton navigateur l'adresse du site suivie de `/feed`, `/rss` ou `/rss.xml`
(par exemple `https://www.3bikes.fr/feed/`). Si tu vois une page de texte pleine de `<item>` et `<title>`, c'est la bonne.

### Pourquoi un « robot » lit les flux, et pas l'iPhone directement ?

La plupart des sites interdisent qu'une autre page web lise leur flux depuis le téléphone
(c'est une protection appelée **CORS**). Le robot GitHub, lui, n'est pas un navigateur :
il lit les flux sans restriction, les rassemble dans un seul petit fichier, et l'iPhone n'a
plus qu'à lire ce fichier. C'est gratuit, et en plus c'est plus rapide pour un vieux téléphone.

Si un site est en panne, ses anciens articles sont conservés jusqu'à son retour.

---

## 3. Ajouter un parcours

Les parcours partent du centre de Vesoul. Il y a deux façons d'en ajouter un.

### A. Le plus simple : faire une « demande » au robot

**Fichier :** `parcours/demandes.json`

Tu donnes une liste de villages de passage, et le robot calcule un vrai tracé vélo de route
avec **BRouter** (service gratuit), puis crée le fichier GPX tout seul.

```json
{
  "fichier": "boucle-de-faucogney",
  "nom": "Boucle de Faucogney",
  "zone": "Plateau des Mille Étangs",
  "description": "Petite incursion dans les Mille Étangs.",
  "passages": ["Vesoul", "Lure", "Faucogney-et-la-Mer", "Saint-Bresson", "Luxeuil-les-Bains", "Vesoul"]
},
```

- `fichier` : en **minuscules, sans accent ni espace** (des tirets à la place).
- `zone` : un titre court de région (« Vallée de la Saône », « Vosges saônoises »…).
- `passages` : des noms de villages, ou des coordonnées `"47.83020, 6.79289"` pour un point précis
  (sommet d'un col…). Pour obtenir des coordonnées : sur https://www.openstreetmap.org, clic droit → « Afficher l'adresse ».
- Plus il y a de passages, plus le tracé suit ton idée (4 à 8, c'est bien).

**Vérifier le résultat :** environ 3 minutes après, ouvre le parcours dans l'app et regarde la carte.
Si le tracé ne te plaît pas : supprime le fichier `.gpx` (voir « Retirer un parcours »), corrige les passages, et le robot recommencera.

> Le robot ne fabrique un parcours **qu'une seule fois** : tant que le fichier `parcours/<fichier>.gpx` existe, la demande est ignorée.

### B. Déposer un fichier GPX tout fait

Tu peux créer un parcours sur Komoot, Strava, Garmin Connect, openrunner…, puis l'exporter en GPX.

1. Renomme le fichier en **minuscules, sans accent ni espace** : `tour-du-lac-de-vaivre.gpx`.
2. Sur GitHub, ouvre le dossier `parcours`, puis **Add file → Upload files**.
3. Glisse le fichier, puis clique sur **Commit changes**.

Le robot calcule tout seul la distance, le dénivelé, la difficulté, les cols et le profil.
Le nom affiché est celui écrit dans le GPX (balise `<name>`). Pour le changer, ouvre le fichier avec le crayon ✏️ et modifie la ligne `<name>…</name>` au début.

### Retirer un parcours

Ouvre le fichier `.gpx` sur GitHub, clique sur **⋯** (en haut à droite), puis **Delete file**, puis **Commit changes**.

### Les parcours créés par ton père (dans l'app)

Dans l'onglet Parcours, le bouton **« ➕ Créer mon parcours »** propose trois façons de faire.
L'iPhone trace tout de suite (BRouter et OpenStreetMap, gratuits), affiche km, D+ et profil,
et le parcours s'enregistre dans « Mes parcours ». Il peut ensuite l'envoyer à son GPS.

1. **🔄 Une boucle** : il touche une distance (40 à 150 km) et une direction (nord, est, sud,
   ouest). L'app invente une boucle ; « 🔁 Autre idée » en propose une autre. Rien à taper.
2. **🎯 Aller jusqu'à…** : il touche un but dans la liste (villes, cols, lieux). L'aller et le
   retour passent par deux routes différentes. La liste = les `destinations` de
   `donnees/reglages.json` + tous les cols et lieux de `donnees/cols.json`.
   Pour ajouter une ville : nom + coordonnées dans `destinations`.
3. **Mode avancé** : il tape les villages ou cols par où passer, dans l'ordre.

- Rien à faire de ton côté : pas d'e-mail, pas de GitHub.
- Ces parcours restent **dans son iPhone** (ils ne sont pas dans la bibliothèque commune).
  S'il en aime un et que tu veux l'ajouter à la bibliothèque : demande-lui les étapes et fais
  une « demande » au robot (méthode A ci-dessus).
- Attention : si Safari efface les données du site (Réglages → Safari → Effacer historique),
  ses parcours perso sont perdus.

### Cols et lieux remarquables

**Fichier :** `donnees/cols.json`. Un col ou un lieu ajouté ici est repéré automatiquement
sur tous les parcours qui passent à moins de 500 m (700 m pour un lieu).

### Comment la difficulté est calculée

Le calcul est simple : effort = kilomètres + (dénivelé ÷ 100).
- moins de 80 : **facile** ;
- de 80 à 140 : **moyen** ;
- 140 et plus : **difficile**.

---

## 4. Publier une mise à jour

Avec github.com, **« Commit changes » = publier**. Ensuite :

1. Ouvre l'onglet **Actions** du dépôt : la ligne du haut montre le robot au travail (🟡), puis ✅ quand c'est en ligne (2 minutes environ).
2. Sur l'iPhone, **ferme complètement l'app** : glisse depuis le bas de l'écran, puis lance-la vers le haut pour la fermer. Rouvre-la : elle se met à jour toute seule.

### Première mise en ligne (une seule fois)

1. Sur GitHub : **Settings → Pages**. Dans « Build and deployment », réglage **Source**, choisis **GitHub Actions**.
2. Va dans l'onglet **Actions**, clique sur « Publier Échappée », puis sur **Run workflow**.
3. Après 2 à 3 minutes, l'app est en ligne : https://alexsky00.github.io/echappee/

### Si tu travailles depuis ton ordinateur avec Git (facultatif)

```
git pull                       # récupérer la dernière version
# … modifications …
git add -A
git commit -m "Calendrier : chaînes TV du Giro"
git push                       # publier
```

---

## 5. Installer l'app sur l'iPhone de ton père

1. Sur l'iPhone, ouvre **Safari** (pas Chrome : seul Safari peut installer l'app).
2. Va sur **https://alexsky00.github.io/echappee/**
3. Touche le bouton **Partager** (le carré avec une flèche vers le haut, en bas de l'écran).
4. Fais défiler et touche **« Sur l'écran d'accueil »**.
5. Laisse le nom « Échappée », puis touche **Ajouter**.

L'icône jaune « É » apparaît sur l'écran d'accueil. **Ouvre toujours l'app depuis cette icône** :
elle s'affiche alors en plein écran, fonctionne hors connexion et garde ses favoris.

### Envoyer un parcours au compteur Bryton Rider 420

À faire une fois : installer l'app gratuite **Bryton Active** (App Store), s'y connecter et
appairer le Rider 420 en Bluetooth (l'app guide pas à pas).

Ensuite, pour chaque parcours :
1. Dans Échappée, ouvre le parcours → **📲 Envoyer vers mon GPS** → choisis **Bryton Active**.
   Si Bryton Active n'est pas dans la liste : **Enregistrer dans Fichiers**, puis ouvre l'app
   **Fichiers**, touche longuement le fichier `.gpx` → **Partager** → **Bryton Active**.
2. Dans Bryton Active, le parcours s'ajoute aux itinéraires : lance la synchronisation avec le
   compteur allumé à côté du téléphone.
3. Sur le Rider 420 : menu de navigation / itinéraires → choisis le parcours → c'est parti.

> Le Rider 420 ne sait pas inverser un parcours : nos boucles se font dans le sens du fichier.

### Les rappels de courses (le jour J)

Dans l'onglet **Courses** :
1. Touche l'étoile **☆** d'une course : elle devient « suivie » (★).
2. Un bouton **📅 Ajouter à mon calendrier** apparaît : touche-le, puis **Ajouter** (ou « Ajouter tout »).

La course est ajoutée au Calendrier de l'iPhone avec une **alerte à 9 h le jour J** et les chaînes TV dans la note.
Vérifie une fois que les alertes du Calendrier sont autorisées :
**Réglages → Notifications → Calendrier → Autoriser les notifications**.

Les courses suivies apparaissent aussi en tête du bandeau **« Aujourd'hui à la TV »**, sur l'onglet Actus.

> Pourquoi le Calendrier plutôt que des notifications de l'app ? Sur iPhone, une web app ne peut pas
> programmer une notification à l'avance : il faudrait un serveur qui l'envoie le jour J.
> Le Calendrier de l'iPhone fait ça parfaitement, gratuitement, sans serveur ni réglage.

---

## 6. Autres réglages

**Fichier :** `donnees/reglages.json`
- `ville` : lieu de la météo et départ des parcours (nom, latitude, longitude).

**Règles de la météo** (« bon jour pour rouler ») : en haut du fichier `js/meteo.js`, bloc `REGLES`
(seuils de pluie, de vent, de froid et de chaleur, heures de sortie de 9 h à 18 h).

---

## En cas de problème

**J'ai reçu un e-mail de GitHub « Run failed ».**
Ouvre l'onglet **Actions** et clique sur la ligne rouge ❌, puis sur « publier » et sur l'étape
« Lancer le robot ». Le message en français indique le fichier et la ligne à corriger, par exemple :
```
❌ ERREURS À CORRIGER (l'app n'a pas été mise à jour) :
   • calendrier.json est mal écrit, ligne 42 : Expecting ',' delimiter. (Souvent : une virgule…)
```
Corrige, refais « Commit changes » : c'est reparti.

**GitHub m'écrit que le workflow a été désactivé.**
GitHub met en pause les tâches automatiques d'un dépôt sans modification pendant 60 jours.
Le robot se « réveille » normalement tout seul, mais si ça arrive : onglet **Actions** →
« Publier Échappée » → bouton **Enable workflow**.

**L'app de mon père ne se met pas à jour.**
Ferme-la complètement et rouvre-la. Si ça ne suffit pas : supprime l'icône
(appui long → Supprimer l'app) et réinstalle-la depuis Safari (étape 5). Les favoris seront perdus.

**Les actus ne bougent plus.**
Onglet **Actions** : le robot tourne-t-il toutes les heures ? Sinon, regarde l'historique de la
tâche sur cron-job.org (clé expirée ? voir « Le réveil horaire »). Un site a peut-être changé l'adresse de son flux :
teste chaque adresse `rss` dans un navigateur.

**Un parcours « illisible ».**
Le fichier n'est pas un vrai GPX (parfois les sites exportent en `.fit` ou `.tcx`). Réexporte en GPX.

---

## Pour les curieux : tester sur son ordinateur

```
pip install feedparser            # une seule fois
python outils/robot.py            # prépare les actus, les parcours, le calendrier
python -m http.server 8000        # puis ouvrir http://localhost:8000
```

## Ce qu'il y a dans le dépôt

| Dossier ou fichier | Contenu | À modifier ? |
|---|---|---|
| `donnees/` | calendrier, sources d'actus, cols, réglages | ✏️ oui |
| `parcours/` | fichiers GPX et demandes de parcours | ✏️ oui |
| `index.html`, `css/`, `js/` | le code de l'app (commenté en français) | rarement |
| `icones/` | icônes et écran de démarrage (`outils/icones.py`) | non |
| `lib/leaflet/` | bibliothèque de carte (Leaflet 1.9.4) | non |
| `outils/` | le robot (`robot.py`, `parcours.py`) | non |
| `.github/workflows/publier.yml` | le planning du robot | non |
| `sw.js` | fonctionnement hors connexion et mises à jour | non |

**Services gratuits utilisés, tous sans clé ni compte :** flux RSS des sites, OpenStreetMap
(carte CyclOSM et recherche de villages), BRouter (tracés), Open-Meteo (météo et altitudes),
wsrv.nl (miniatures des articles), GitHub Pages et GitHub Actions (hébergement et robot).
