// Service worker d'Échappée : garde une copie de l'app dans l'iPhone
// pour qu'elle s'ouvre vite et fonctionne hors connexion.
//
// VERSION est remplacée automatiquement par GitHub à chaque publication :
// c'est ce qui déclenche la mise à jour sur l'iPhone. Ne pas y toucher.
const VERSION = 'dev';

const CACHE_APP = `echappee-app-${VERSION}`;   // le code de l'app
const CACHE_DONNEES = 'echappee-donnees';      // actus, calendrier, parcours…
const CACHE_IMAGES = 'echappee-images';        // miniatures des articles
const MAX_IMAGES = 200;

// Sur l'ordinateur (localhost) on ne garde rien en cache : les modifications s'affichent tout de suite
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

// Les fichiers de l'app, mis en mémoire dès l'installation
const FICHIERS_APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/outils.js',
  'js/favoris.js',
  'js/calendrier.js',
  'js/actus.js',
  'js/courses.js',
  'js/parcours.js',
  'js/meteo.js',
  'icones/apple-touch-icon.png',
  'icones/icone-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => Promise.all(FICHIERS_APP.map((f) => cache.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// Nouvelle version active : on efface l'ancienne copie de l'app
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms
        .filter((n) => n.startsWith('echappee-app-') && n !== CACHE_APP)
        .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const chemin = url.pathname.replace(new URL('./', self.location).pathname, '') || './';
    const page = req.mode === 'navigate' && (chemin === './' || chemin === 'index.html');
    // lib/ = bibliothèque de carte (Leaflet) : gardée en mémoire après le premier usage
    if (!DEV && (page || FICHIERS_APP.includes(chemin) || chemin.startsWith('lib/'))) {
      e.respondWith(cacheDAbord(req, CACHE_APP, page ? './' : null));
    } else {
      e.respondWith(reseauDAbord(req));
    }
  } else if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(reseauDAbord(req));     // météo : la dernière connue si pas de réseau
  } else if (url.hostname === 'wsrv.nl') {
    e.respondWith(cacheDAbord(req, CACHE_IMAGES).finally(() => { limiter(CACHE_IMAGES, MAX_IMAGES); }));
  }
  // Le reste (liens vers les articles…) passe normalement par Internet.
});

/** Code de l'app, images : la copie en mémoire si elle existe (rapide), sinon Internet. */
async function cacheDAbord(req, nomCache, cle = null) {
  const cache = await caches.open(nomCache);
  const copie = await cache.match(cle || req, { ignoreSearch: !!cle });
  if (copie) return copie;
  const reponse = await fetch(req);
  if (reponse.ok) cache.put(cle || req, reponse.clone());
  return reponse;
}

/** Données : Internet d'abord (toujours à jour) ; la copie en mémoire si pas de réseau
    ou si le réseau met plus de 6 secondes (campagne, 3G…). */
async function reseauDAbord(req) {
  const cache = await caches.open(CACHE_DONNEES);
  const reseau = fetch(req.url, { cache: 'no-cache' }).then((reponse) => {
    if (reponse.ok) cache.put(req.url, reponse.clone());
    return reponse;
  });
  const copie = await cache.match(req.url);
  if (!copie) return reseau;
  const attente = new Promise((ok) => setTimeout(() => ok(copie), 6000));
  return Promise.race([reseau.catch(() => copie), attente]);
}

/** Supprime les plus anciennes images au-delà d'un certain nombre. */
async function limiter(nomCache, max) {
  const cache = await caches.open(nomCache);
  const cles = await cache.keys();
  for (const cle of cles.slice(0, Math.max(0, cles.length - max))) await cache.delete(cle);
}
