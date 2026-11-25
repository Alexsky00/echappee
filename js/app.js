// Point de départ de l'app : navigation entre les 5 onglets,
// chargement de chaque onglet à la demande, et mises à jour automatiques.

const TITRES = {
  actus: 'Échappée',      // l'accueil porte le nom de l'app
  courses: 'Courses',
  materiel: 'Matériel',
  parcours: 'Parcours',
  meteo: 'Météo',
};

// Chaque onglet n'est téléchargé qu'à sa première ouverture (démarrage plus rapide).
const CHARGEURS = {
  actus:    () => import('./actus.js').then((m) => m.init(section('actus'), 'pro')),
  courses:  () => import('./courses.js').then((m) => m.init(section('courses'))),
  materiel: () => import('./actus.js').then((m) => m.init(section('materiel'), 'materiel')),
  parcours: () => import('./parcours.js').then((m) => m.init(section('parcours'))),
  meteo:    () => import('./meteo.js').then((m) => m.init(section('meteo'))),
};

const onglets = {};          // onglets déjà chargés
const defilement = {};       // position de défilement de chaque onglet
let ongletActuel = null;

function section(nom) {
  return document.getElementById(nom);
}

async function ouvrir(nom) {
  if (!TITRES[nom]) nom = 'actus';
  if (ongletActuel) defilement[ongletActuel] = window.scrollY;

  for (const s of document.querySelectorAll('.onglet')) s.hidden = s.id !== nom;
  for (const a of document.querySelectorAll('.barre-onglets a')) {
    a.classList.toggle('actif', a.dataset.onglet === nom);
  }
  document.getElementById('titre-page').textContent = TITRES[nom];
  ongletActuel = nom;
  window.scrollTo(0, defilement[nom] || 0);

  if (!onglets[nom]) {
    onglets[nom] = CHARGEURS[nom]().catch((e) => {
      console.error(e);
      delete onglets[nom];
      section(nom).innerHTML = '<p class="vide">Impossible d\'ouvrir cet onglet. Vérifiez la connexion.</p>';
    });
  } else {
    (await onglets[nom])?.afficher?.();
  }
}

// Navigation par l'adresse (#actus, #courses…) : le bouton « retour » fonctionne aussi
window.addEventListener('hashchange', () => ouvrir(location.hash.slice(1)));
ouvrir(location.hash.slice(1));

// Toucher l'onglet déjà ouvert = remonter en haut de la page
document.querySelector('.barre-onglets').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a && a.dataset.onglet === ongletActuel) window.scrollTo(0, 0);
});

// Quand l'app revient au premier plan après plus de 15 minutes, on recharge les données
let cacheLe = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { cacheLe = Date.now(); return; }
  if (Date.now() - cacheLe > 15 * 60 * 1000) {
    for (const p of Object.values(onglets)) (await p)?.rafraichir?.();
  }
});

// --- Service worker : fonctionnement hors connexion et mises à jour automatiques ---
if ('serviceWorker' in navigator) {
  const dejaInstalle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((inscription) => {
    // À chaque retour dans l'app, on regarde si une nouvelle version a été publiée
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') inscription.update().catch(() => {});
    });
  });
  // Nouvelle version installée : on recharge la page une fois, tout seul
  let recharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaInstalle && !recharge) { recharge = true; location.reload(); }
  });
}
