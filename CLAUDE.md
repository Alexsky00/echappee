# Échappée — mémoire du projet (pour Claude)

PWA gratuite pour le père de l'utilisateur : cycliste sur route à **Vesoul (70)**, **iPhone XR,
Safari, iOS 18 max**, compteur **Bryton Rider 420**. L'utilisateur (le fils, Alexsky00 sur
GitHub) maintient l'app ; il n'est pas développeur. Langue : **français** (app, code commenté,
réponses, docs).

- En ligne : https://alexsky00.github.io/echappee/  — dépôt : https://github.com/Alexsky00/echappee (public)
- Guide pour l'utilisateur : `MAINTENANCE.md` (à garder à jour à chaque changement visible).

## Contraintes non négociables
- 100 % gratuit : aucune API payante, pas d'App Store, hébergement GitHub Pages.
- Maintenance simple : pas de serveur ni de base de données, pas d'étape de build, peu de
  dépendances, données éditables en JSON/GPX séparées du code ; push sur `main` = mise à jour auto.
- Simple pour le père : gros texte, gros boutons, fort contraste, 5 onglets max, sans compte,
  hors connexion. **Rien à taper si possible** (il a trouvé la saisie de villages trop compliquée).
- Code simple, commenté en français. Reformuler / proposer des options avant les gros changements.

## Architecture
- Vanilla HTML/CSS/ES modules, `import()` par onglet, routage par `#hash`, favoris en localStorage.
- 5 onglets : Actus pro (`js/actus.js` fil `pro` + bandeau TV + pastille météo), Courses
  (`js/courses.js`, calendrier 2027 H/F, rappels via fichiers `.ics`), Matériel (`actus.js` fil
  `materiel`), Parcours (`js/parcours.js` + `js/mes-parcours.js`), Météo (`js/meteo.js`, Open-Meteo).
- `sw.js` : cache app (cache-first), données (network-first 6 s), images wsrv.nl. `VERSION` remplacée
  par le SHA en CI. **Tout nouveau fichier JS/police doit être ajouté à `FICHIERS_APP`.**
- Robot `outils/robot.py` (+ `outils/parcours.py`) lancé par `.github/workflows/publier.yml`
  (push, cron horaire `17 * * * *`, manuel) : valide les JSON, agrège les RSS → `donnees/actus-*.json`
  (contourne le CORS), génère `ics/`, fabrique les GPX de `parcours/demandes.json` (Nominatim +
  BRouter), analyse les GPX → `parcours/index.json`. Workflow en 2 jobs (`publier` puis
  `mettre-en-ligne`) : dans un seul job, deploy-pages ne trouvait pas l'artefact.
- Fichiers générés non versionnés : `donnees/actus-*.json`, `ics/`, `parcours/index.json`.

## Décisions prises (ne pas re-discuter)
- Rappels de courses = Calendrier iPhone via `.ics` (pas de Web Push).
- Saison 2027 hommes + femmes ; sources FR d'abord, EN acceptées.
- Parcours : bibliothèque de 25 boucles (50–158 km) via `parcours/demandes.json`.
- « Créer mon parcours » **directement dans l'app** (pas d'e-mail, pas de GitHub) :
  1. Une boucle (distance 40–150 km + direction N/E/S/O, bouton « Autre idée »),
  2. Aller jusqu'à… (villes de `reglages.json > destinations` + cols/lieux de `cols.json`),
  3. Mode avancé (taper des villages). Aperçu avec carte + bornes km avant d'enregistrer.
  Parcours perso stockés en localStorage (`echappee-mes-parcours`), GPX généré à la volée.
- Envoi au GPS : Web Share → app **Bryton Active** (repli : Fichiers → Partager).
- Identité visuelle « habillage TV de course » : fond nuit `#0B1530`, jaune `#FFD100`, rose
  `#FF2E88`, vert `#00B86B` ; police **Barlow Condensed** embarquée (`polices/`, OFL) ;
  logo = É penché (E = peloton, accent = l'échappée). Icônes : `python outils/icones.py`.
  Maquette : https://claude.ai/artifact/USRb9u7GKeNpd7A7sZL12b
- L'adresse e-mail de l'utilisateur a été retirée des fichiers publics : ne pas la remettre.

## Tester en local
- `python -m http.server 8765` à la racine (le SW ne met rien en cache sur localhost).
- Émulation iPhone XR par Chrome CDP (script `test-iphone.mjs` dans le scratchpad de session).
- Le robot en local : `pip install feedparser pillow` puis `python outils/robot.py`.

## À suivre / non vérifié
- **Cron horaire** : au 25/11/2026 21 h 20 UTC, GitHub n'avait encore lancé aucun passage
  programmé (seulement les push). Vérifier `actions/runs?event=schedule` ; si ça ne démarre pas,
  proposer un déclencheur externe gratuit (cron-job.org + jeton GitHub → workflow_dispatch).
- Pas encore testé sur le vrai iPhone : installation (l'utilisateur n'arrivait pas à « Sur
  l'écran d'accueil » — probablement lien ouvert hors de Safari), Web Share → Bryton Active,
  `.ics` en mode installé, encoche, hors connexion.
- Données à vérifier : chaînes TV 2027, 5 dates estimées (Kuurne, Paris-Roubaix F, Champ. de
  France, Vuelta F, Paris-Tours), tracés (route du fort du Ballon de Servance), limite de points
  éventuelle du Rider 420 pour les GPX longs (jusqu'à 3 600 points).
- Idée proposée, pas faite : encadré « installer l'app » affiché dans Safari quand l'app n'est pas installée.
