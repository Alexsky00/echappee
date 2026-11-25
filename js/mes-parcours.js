// « Mes parcours » : parcours créés directement sur l'iPhone.
// L'utilisateur donne quelques villages ou cols ; on trouve leurs coordonnées
// (OpenStreetMap / Nominatim), on trace la boucle sur de vraies routes (BRouter),
// puis on calcule distance, dénivelé, profil et cols, comme le robot le fait
// pour la bibliothèque. Tout est gratuit et sans compte.
// Les parcours sont gardés dans le téléphone (localStorage).

import { normaliser } from './outils.js';

const CLE = 'echappee-mes-parcours';
const ZONE_RECHERCHE = '5.3,48.3,7.3,47.2';   // Haute-Saône, Vosges du Sud, Territoire de Belfort

// ------------------------------------------------------------ stockage

export function mesParcours() {
  try { return JSON.parse(localStorage.getItem(CLE)) || []; } catch { return []; }
}

function ecrire(liste) {
  localStorage.setItem(CLE, JSON.stringify(liste));
}

/** Enregistre un parcours. Renvoie false si la mémoire du téléphone est pleine. */
export function enregistrer(p) {
  const liste = mesParcours().filter((x) => x.id !== p.id);
  liste.unshift(p);
  try { ecrire(liste); return true; } catch { return false; }
}

export function supprimer(id) {
  ecrire(mesParcours().filter((x) => x.id !== id));
}

// ------------------------------------------------------------ calculs

/** Distance en mètres entre deux points [lat, lon]. */
function distanceM(a, b) {
  const r = Math.PI / 180;
  const p1 = a[0] * r, p2 = b[0] * r, dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Même règle que le robot : altitudes lissées, variations de moins de 4 m ignorées. */
function denivelePositif(alts) {
  const lisse = alts.map((_, i) => {
    const f = alts.slice(Math.max(0, i - 2), i + 3);
    return f.reduce((s, a) => s + a, 0) / f.length;
  });
  let total = 0, ref = lisse[0];
  for (const a of lisse.slice(1)) {
    if (a - ref >= 4) { total += a - ref; ref = a; } else if (a < ref) ref = a;
  }
  return total;
}

/** Même règle que le robot : 1 km = 1 point, 100 m de D+ = 1 point. */
function difficulte(km, dplus) {
  const effort = km + dplus / 100;
  return effort < 80 ? 'facile' : effort < 140 ? 'moyen' : 'difficile';
}

/** Allège le tracé (moins de points, même forme) pour qu'il tienne dans le téléphone. */
function alleger(points, tolerance = 6) {
  // Projection simple en mètres autour du départ
  const lat0 = points[0][0] * Math.PI / 180;
  const xy = points.map(([la, lo]) => [lo * 111320 * Math.cos(lat0), la * 110540]);
  const garder = new Uint8Array(points.length);
  garder[0] = garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const [x1, y1] = xy[a], [x2, y2] = xy[b];
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
    let pire = -1, dMax = 0;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / l2));
      const d = Math.hypot(xy[i][0] - x1 - t * dx, xy[i][1] - y1 - t * dy);
      if (d > dMax) { dMax = d; pire = i; }
    }
    if (dMax > tolerance) { garder[pire] = 1; pile.push([a, pire], [pire, b]); }
  }
  return points.filter((_, i) => garder[i]);
}

/** Analyse un tracé [[lat, lon, alt]] → mêmes infos que parcours/index.json. */
function analyser(points, cols) {
  const cumul = [0];
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1] + distanceM(points[i - 1], points[i]));
  const total = cumul[cumul.length - 1];

  // Profil : 200 intervalles réguliers
  const profil = [];
  for (let k = 0, j = 0; k <= 200; k++) {
    const cible = total * k / 200;
    while (j < cumul.length - 1 && cumul[j + 1] < cible) j++;
    profil.push([Math.round(cible / 10) / 100, Math.round(points[j][2])]);
  }
  const dplus = denivelePositif(points.map((p) => p[2]));

  // Cols et lieux de cols.json proches du tracé
  const pas = Math.max(1, Math.floor(points.length / 3000));
  const reperes = [];
  for (const r of cols?.points ?? []) {
    let meilleur = Infinity, km = 0;
    for (let i = 0; i < points.length; i += pas) {
      const d = distanceM(points[i], [r.lat, r.lon]);
      if (d < meilleur) { meilleur = d; km = cumul[i] / 1000; }
    }
    if (meilleur <= (cols.rayon_m?.[r.type] ?? 500)) {
      reperes.push({ nom: r.nom, type: r.type, alt: r.alt ?? null, km: Math.round(km * 10) / 10 });
    }
  }
  reperes.sort((a, b) => a.km - b.km);

  const km = total / 1000;
  return {
    distance: Math.round(km * 10) / 10,
    denivele: Math.round(dplus / 10) * 10,
    alt_max: Math.max(...profil.map((x) => x[1])),
    difficulte: difficulte(km, dplus),
    reperes,
    profil,
  };
}

// ------------------------------------------------------------ services en ligne

const lieuxConnus = new Map();
let derniereRecherche = 0;

/**
 * Coordonnées d'une étape : « 47.8, 6.5 », un col de cols.json, ou un nom de lieu.
 * Quand plusieurs lieux portent le même nom, on garde le plus proche de Vesoul.
 * Renvoie { lat, lon, trouve } ou null si introuvable.
 */
async function localiser(texte, centre, cols) {
  const coord = texte.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coord) return { lat: +coord[1], lon: +coord[2], trouve: 'coordonnées' };

  const connu = (cols?.points ?? []).find((r) => normaliser(r.nom) === normaliser(texte));
  if (connu) return { lat: connu.lat, lon: connu.lon, trouve: connu.nom };

  const cle = normaliser(texte);
  if (lieuxConnus.has(cle)) return lieuxConnus.get(cle);

  // Règle d'OpenStreetMap : une recherche par seconde au maximum
  const attente = derniereRecherche + 1100 - Date.now();
  if (attente > 0) await new Promise((ok) => setTimeout(ok, attente));
  derniereRecherche = Date.now();

  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: texte, format: 'jsonv2', limit: 8, countrycodes: 'fr',
    viewbox: ZONE_RECHERCHE, bounded: 1, 'accept-language': 'fr',
  });
  const reponses = await (await fetch(url)).json();
  let resultat = null;
  for (const r of reponses) {
    const lieu = { lat: +r.lat, lon: +r.lon, trouve: r.display_name.split(',').slice(0, 2).join(',') };
    if (!resultat || distanceM([lieu.lat, lieu.lon], centre) < distanceM([resultat.lat, resultat.lon], centre)) {
      resultat = lieu;
    }
  }
  lieuxConnus.set(cle, resultat);
  return resultat;
}

/** Tracé vélo de route par BRouter (petites routes d'abord). Renvoie [[lat, lon, alt]]. */
async function tracer(etapes) {
  const lonlats = etapes.map((e) => `${e.lon.toFixed(5)},${e.lat.toFixed(5)}`).join('|');
  for (const profil of ['fastbike-lowtraffic', 'fastbike']) {
    try {
      const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profil}&alternativeidx=0&format=geojson`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const geo = await r.json();
      const coords = geo.features?.[0]?.geometry?.coordinates ?? [];
      if (coords.length > 1) return coords.map(([lon, lat, alt]) => [lat, lon, alt ?? 0]);
    } catch { /* on essaie le profil suivant */ }
  }
  throw new Error('trace');
}

/**
 * Crée un parcours à partir d'une liste d'étapes (textes).
 * progres(message) est appelé à chaque étape pour informer l'utilisateur.
 * En cas de lieu introuvable, l'erreur porte .lieu.
 */
export async function creerParcours({ etapes, retour, ville, cols }, progres) {
  const centre = [ville.lat, ville.lon];
  const points = [{ lat: ville.lat, lon: ville.lon, trouve: ville.nom, texte: ville.nom }];
  for (const texte of etapes) {
    progres(`Recherche de « ${texte} »…`);
    const lieu = await localiser(texte, centre, cols);
    if (!lieu) { const e = new Error('introuvable'); e.lieu = texte; throw e; }
    points.push({ ...lieu, texte });
  }
  if (retour) points.push(points[0]);

  progres('Calcul du tracé sur les routes…');
  const trace = await tracer(points);
  const infos = analyser(trace, cols);
  return {
    id: 'perso-' + Date.now(),
    perso: true,
    nom: `Par ${etapes.slice(0, 2).join(' et ')}${etapes.length > 2 ? '…' : ''}`,
    zone: 'Mon parcours',
    description: '',
    etapes: points.map((p) => ({ texte: p.texte, trouve: p.trouve })),
    ...infos,
    depart: [ville.lat, ville.lon],
    points: alleger(trace).map(([la, lo, al]) => [+la.toFixed(5), +lo.toFixed(5), Math.round(al)]),
    cree_le: new Date().toISOString(),
  };
}

/** Fichier GPX d'un parcours perso (pour le GPS). */
export function gpxDe(p) {
  const x = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const pts = p.points.map(([la, lo, al]) => `      <trkpt lat="${la}" lon="${lo}"><ele>${al}</ele></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Echappee" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${x(p.nom)}</name></metadata>
  <trk>
    <name>${x(p.nom)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
