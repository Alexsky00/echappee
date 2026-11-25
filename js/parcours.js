// Onglet « Parcours » : bibliothèque de boucles au départ de Vesoul.
// Les infos (distance, dénivelé, cols, profil) sont calculées par le robot
// dans parcours/index.json. La carte et le fichier GPX complet ne sont
// chargés qu'à l'ouverture d'un parcours (téléphone plus fluide).

import { chargerJSON, echapper } from './outils.js';

const DISTANCES = [
  { valeur: '',        texte: 'Distance',         min: 0,   max: 9999 },
  { valeur: 'court',   texte: 'Moins de 60 km',   min: 0,   max: 60 },
  { valeur: 'moyen',   texte: '60 à 100 km',      min: 60,  max: 100 },
  { valeur: 'long',    texte: '100 à 150 km',     min: 100, max: 150 },
  { valeur: 'tres',    texte: 'Plus de 150 km',   min: 150, max: 9999 },
];
const DIFFICULTES = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

// Couleurs des pentes, comme sur les profils des étapes du Tour
function couleurPente(pourcent) {
  if (pourcent < 3) return '#7BC67B';
  if (pourcent < 6) return '#FFD100';
  if (pourcent < 9) return '#F28C28';
  return '#D7263D';
}

/** Profil altimétrique en SVG. mini = petite version pour la liste. */
function profilSVG(p, mini = false) {
  const L = 400, H = mini ? 60 : 190;
  const marge = mini ? { g: 0, d: 0, h: 4, b: 2 } : { g: 38, d: 6, h: 34, b: 22 };
  const pts = p.profil;
  const kmMax = pts[pts.length - 1][0] || 1;
  const altMin = Math.min(...pts.map((x) => x[1]));
  const altMax = Math.max(...pts.map((x) => x[1]));
  const bas = Math.floor((altMin - 30) / 100) * 100;
  const haut = Math.max(bas + 300, Math.ceil((altMax + 50) / 100) * 100);
  const X = (km) => marge.g + (km / kmMax) * (L - marge.g - marge.d);
  const Y = (alt) => H - marge.b - ((alt - bas) / (haut - bas)) * (H - marge.h - marge.b);
  const sol = H - marge.b;

  let svg = `<svg class="profil${mini ? ' mini' : ''}" viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  if (mini) {
    const ligne = pts.map(([km, alt]) => `${X(km).toFixed(1)},${Y(alt).toFixed(1)}`).join(' ');
    svg += `<polygon points="${X(0)},${sol} ${ligne} ${X(kmMax)},${sol}" fill="#13233F"/>`;
    svg += `<polyline points="${ligne}" fill="none" stroke="#FFD100" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
    return svg + '</svg>';
  }
  // Lignes d'altitude
  for (let a = bas; a <= haut; a += (haut - bas > 600 ? 200 : 100)) {
    svg += `<line x1="${marge.g}" x2="${L - marge.d}" y1="${Y(a)}" y2="${Y(a)}" stroke="#D5DAE1" stroke-width="1"/>`;
    svg += `<text x="${marge.g - 4}" y="${Y(a) + 4}" text-anchor="end" class="axe">${a}</text>`;
  }
  // Une bande colorée par tronçon, selon la pente
  for (let i = 1; i < pts.length; i++) {
    const [k1, a1] = pts[i - 1], [k2, a2] = pts[i];
    const pente = k2 > k1 ? ((a2 - a1) / ((k2 - k1) * 1000)) * 100 : 0;
    svg += `<polygon points="${X(k1).toFixed(1)},${sol} ${X(k1).toFixed(1)},${Y(a1).toFixed(1)} ${X(k2).toFixed(1)},${Y(a2).toFixed(1)} ${X(k2).toFixed(1)},${sol}" fill="${couleurPente(pente)}" stroke="${couleurPente(pente)}" stroke-width=".6"/>`;
  }
  svg += `<polyline points="${pts.map(([k, a]) => `${X(k).toFixed(1)},${Y(a).toFixed(1)}`).join(' ')}" fill="none" stroke="#13233F" stroke-width="2"/>`;
  // Kilomètres
  for (const km of [0, Math.round(kmMax / 2), Math.round(kmMax)]) {
    svg += `<text x="${X(km)}" y="${H - 5}" text-anchor="${km === 0 ? 'start' : km >= kmMax - 1 ? 'end' : 'middle'}" class="axe">${km} km</text>`;
  }
  // Cols : petit drapeau au sommet
  const cols = p.reperes.filter((r) => r.type === 'col');
  cols.forEach((c, i) => {
    const point = pts.reduce((m, x) => (Math.abs(x[0] - c.km) < Math.abs(m[0] - c.km) ? x : m));
    const x = X(c.km), y = Y(point[1]);
    const ancre = x > L * 0.7 ? 'end' : x < L * 0.3 ? 'start' : 'middle';
    const yTexte = 13 + (i % 2) * 14;
    svg += `<line x1="${x}" x2="${x}" y1="${y}" y2="${yTexte + 3}" stroke="#13233F" stroke-width="1" stroke-dasharray="2 2"/>`;
    svg += `<text x="${x}" y="${yTexte}" text-anchor="${ancre}" class="col">${echapper(c.nom)} ${c.alt ? c.alt + ' m' : ''}</text>`;
  });
  return svg + '</svg>';
}

/** Charge Leaflet (la carte) seulement quand on en a besoin. */
let promesseLeaflet = null;
function chargerLeaflet() {
  if (!promesseLeaflet) {
    promesseLeaflet = new Promise((ok, erreur) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'lib/leaflet/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'lib/leaflet/leaflet.js';
      js.onload = ok;
      js.onerror = () => { promesseLeaflet = null; erreur(new Error('Leaflet introuvable')); };
      document.head.appendChild(js);
    });
  }
  return promesseLeaflet;
}

/** Lit les points d'un fichier GPX (texte) → [[lat, lon], …] */
function pointsGPX(texte) {
  const doc = new DOMParser().parseFromString(texte, 'application/xml');
  let pts = [...doc.getElementsByTagName('trkpt')];
  if (!pts.length) pts = [...doc.getElementsByTagName('rtept')];
  return pts.map((p) => [Number(p.getAttribute('lat')), Number(p.getAttribute('lon'))]);
}

export function init(section) {
  const etat = { donnees: null, reglages: null, distance: '', difficulte: '', carte: null };
  const $ = (sel) => section.querySelector(sel);

  // =========================================================== LISTE
  function vueListe() {
    nettoyerCarte();
    section.innerHTML = `
      <div class="outils">
        <div class="ligne">
          <select class="champ choix-distance" aria-label="Distance">
            ${DISTANCES.map((d) => `<option value="${d.valeur}"${d.valeur === etat.distance ? ' selected' : ''}>${d.texte}</option>`).join('')}
          </select>
          <select class="champ choix-difficulte" aria-label="Difficulté">
            <option value="">Difficulté</option>
            ${Object.entries(DIFFICULTES).map(([v, t]) => `<option value="${v}"${v === etat.difficulte ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <ul class="liste liste-parcours"></ul>
      <button class="bouton large principal demander" style="margin-top:16px">✉️ Demander un nouveau parcours</button>
      <p class="info">Tous les parcours partent du centre de Vesoul. Ils sont calculés automatiquement
        sur de vraies routes : jetez un œil à la carte avant de partir (travaux, route fermée…).</p>`;

    $('.choix-distance').addEventListener('change', (e) => { etat.distance = e.target.value; remplirListe(); });
    $('.choix-difficulte').addEventListener('change', (e) => { etat.difficulte = e.target.value; remplirListe(); });
    $('.demander').addEventListener('click', vueDemande);
    $('.liste-parcours').addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (li) vueDetail(li.dataset.id);
    });
    remplirListe();
  }

  function remplirListe() {
    const liste = $('.liste-parcours');
    if (!etat.donnees) {
      liste.innerHTML = '<li class="vide">Pas de connexion : impossible de charger les parcours.</li>';
      return;
    }
    const d = DISTANCES.find((x) => x.valeur === etat.distance);
    const parcours = etat.donnees.parcours.filter((p) =>
      p.distance >= d.min && p.distance < d.max && (!etat.difficulte || p.difficulte === etat.difficulte));
    liste.innerHTML = parcours.length ? parcours.map((p) => `
      <li class="parcours" data-id="${echapper(p.id)}" role="button" tabindex="0">
        <div class="parcours-haut">
          <h3 class="style-course">${echapper(p.nom)}</h3>
          <span class="badge diff-${p.difficulte}">${DIFFICULTES[p.difficulte]}</span>
        </div>
        ${p.zone ? `<div class="discret">${echapper(p.zone)}</div>` : ''}
        <div class="chiffres">
          <span><b>${Math.round(p.distance)}</b> km</span>
          <span><b>${p.denivele}</b> m D+</span>
          <span>▲ <b>${p.alt_max}</b> m</span>
        </div>
        ${profilSVG(p, true)}
        ${p.reperes.some((r) => r.type === 'col') ? `<div class="cols">⛰️ ${p.reperes.filter((r) => r.type === 'col').map((r) => echapper(r.nom)).join(' · ')}</div>` : ''}
      </li>`).join('') : '<li class="vide">Aucun parcours ne correspond à ces filtres.</li>';
  }

  // =========================================================== DÉTAIL
  let fichierGPX = null;   // le GPX, préchargé pour que « Envoyer » réagisse tout de suite

  function vueDetail(id) {
    const p = etat.donnees.parcours.find((x) => x.id === id);
    if (!p) return vueListe();
    window.scrollTo(0, 0);
    fichierGPX = null;
    section.innerHTML = `
      <button class="bouton retour">← Tous les parcours</button>
      <h2 class="titre-parcours style-course">${echapper(p.nom)}</h2>
      ${p.zone ? `<div class="discret">${echapper(p.zone)}</div>` : ''}
      ${p.description ? `<p>${echapper(p.description)}</p>` : ''}

      <div class="stats">
        <div><span class="valeur style-course">${p.distance.toLocaleString('fr-FR')}</span><span>km</span></div>
        <div><span class="valeur style-course">${p.denivele}</span><span>m de D+</span></div>
        <div><span class="valeur style-course">${p.alt_max}</span><span>m alt. max</span></div>
        <div class="diff-${p.difficulte}"><span class="valeur style-course">${DIFFICULTES[p.difficulte]}</span><span>difficulté</span></div>
      </div>

      <h3 class="sous-titre style-course">Profil</h3>
      ${profilSVG(p)}
      <div class="legende-pentes">
        <span><i style="background:#7BC67B"></i>&lt; 3 %</span><span><i style="background:#FFD100"></i>3-6 %</span>
        <span><i style="background:#F28C28"></i>6-9 %</span><span><i style="background:#D7263D"></i>&gt; 9 %</span>
      </div>

      <div class="actions-parcours">
        <button class="bouton large principal envoyer">📲 Envoyer vers mon GPS</button>
        <a class="bouton large" href="${echapper(p.fichier)}" download="${echapper(p.id)}.gpx">⬇️ Télécharger le fichier GPX</a>
        <p class="discret">« Envoyer » ouvre le menu de partage de l'iPhone : choisissez
          <b>Garmin Connect</b>, <b>Wahoo</b> ou <b>Enregistrer dans Fichiers</b>.</p>
      </div>

      ${p.reperes.length ? `<h3 class="sous-titre style-course">Cols et lieux</h3>
      <ul class="reperes">${p.reperes.map((r) => `
        <li><span class="km style-course">km ${Math.round(r.km)}</span>
          <span>${r.type === 'col' ? '⛰️' : '📍'} ${echapper(r.nom)}${r.alt ? ` <span class="discret">(${r.alt} m)</span>` : ''}</span></li>`).join('')}
      </ul>` : ''}

      <h3 class="sous-titre style-course">Carte</h3>
      <div class="zone-carte"><button class="bouton large voir-carte">🗺️ Afficher la carte</button></div>`;

    $('.retour').addEventListener('click', vueListe);
    $('.voir-carte').addEventListener('click', () => afficherCarte(p));
    $('.envoyer').addEventListener('click', () => envoyer(p));

    // Préchargement du GPX (Safari exige que le partage parte directement du toucher)
    fetch(p.fichier).then((r) => r.text()).then((texte) => {
      fichierGPX = { texte, file: new File([texte], `${p.id}.gpx`, { type: 'application/gpx+xml' }) };
    }).catch(() => {});
  }

  async function envoyer(p) {
    const fichier = fichierGPX?.file;
    if (fichier && navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;    // menu fermé sans choisir : rien à faire
      }
    }
    // Secours : téléchargement classique
    section.querySelector('a[download]').click();
  }

  async function afficherCarte(p) {
    const zone = $('.zone-carte');
    zone.innerHTML = '<p class="vide">Chargement de la carte…</p>';
    try {
      const [, texte] = await Promise.all([
        chargerLeaflet(),
        fichierGPX ? fichierGPX.texte : fetch(p.fichier).then((r) => r.text()),
      ]);
      const points = pointsGPX(texte);
      zone.innerHTML = '<div class="carte"></div>';
      const L = window.L;
      etat.carte = L.map(zone.firstChild, { preferCanvas: true, tap: false });
      L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · CyclOSM',
      }).addTo(etat.carte);
      // Un point sur deux suffit à l'écran (plus léger)
      const allege = points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
      L.polyline(allege, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(etat.carte);
      const trace = L.polyline(allege, { color: '#E5007E', weight: 5 }).addTo(etat.carte);
      L.circleMarker(points[0], { radius: 10, color: '#13233F', weight: 3, fillColor: '#FFD100', fillOpacity: 1 })
        .bindTooltip('Départ', { permanent: true, direction: 'right' }).addTo(etat.carte);
      etat.carte.fitBounds(trace.getBounds(), { padding: [20, 20] });
    } catch {
      zone.innerHTML = '<p class="vide">Impossible d\'afficher la carte (pas de connexion ?).</p>';
    }
  }

  function nettoyerCarte() {
    if (etat.carte) { etat.carte.remove(); etat.carte = null; }
  }

  // =========================================================== DEMANDE
  function vueDemande() {
    window.scrollTo(0, 0);
    const zones = etat.reglages?.zones ?? [];
    section.innerHTML = `
      <button class="bouton retour">← Tous les parcours</button>
      <h2 class="titre-parcours style-course">Demander un parcours</h2>
      <p>Dites ce qui vous ferait plaisir : la demande part par e-mail, et le nouveau parcours
        apparaîtra ici dans quelques jours.</p>
      <form class="formulaire">
        <label>Où ?
          <select class="champ" name="zone">
            ${zones.map((z) => `<option>${echapper(z)}</option>`).join('')}
            <option>Peu importe</option>
          </select>
        </label>
        <label>Quelle distance ?
          <select class="champ" name="distance">
            <option>Environ 40 km</option><option>Environ 60 km</option><option selected>Environ 80 km</option>
            <option>Environ 100 km</option><option>Environ 120 km</option><option>Environ 150 km</option>
          </select>
        </label>
        <label>Quelle difficulté ?
          <select class="champ" name="difficulte">
            <option>Facile</option><option selected>Moyen</option><option>Difficile</option>
          </select>
        </label>
        <label>Précisions (villages, col, envies…)
          <textarea class="champ" name="precisions" rows="4" placeholder="Ex. : passer par Faucogney et le Saut de l'Ognon"></textarea>
        </label>
        <button class="bouton large principal" type="submit">✉️ Envoyer la demande</button>
      </form>`;

    $('.retour').addEventListener('click', vueListe);
    $('.formulaire').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const corps = [
        'Bonjour,', '',
        'Je voudrais un nouveau parcours dans Échappée :',
        `- Zone : ${f.get('zone')}`,
        `- Distance : ${f.get('distance')}`,
        `- Difficulté : ${f.get('difficulte')}`,
        `- Précisions : ${f.get('precisions') || '(aucune)'}`,
        '', 'Merci !',
      ].join('\n');
      const email = etat.reglages?.email_demandes ?? '';
      location.href = `mailto:${email}?subject=${encodeURIComponent('Échappée : demande de parcours')}&body=${encodeURIComponent(corps)}`;
    });
  }

  // =========================================================== CHARGEMENT
  async function charger() {
    const [donnees, reglages] = await Promise.allSettled([
      chargerJSON('parcours/index.json'),
      chargerJSON('donnees/reglages.json'),
    ]);
    etat.donnees = donnees.status === 'fulfilled' ? donnees.value : null;
    etat.reglages = reglages.status === 'fulfilled' ? reglages.value : null;
  }

  section.innerHTML = '<p class="vide">Chargement des parcours…</p>';
  charger().then(vueListe);

  return {
    rafraichir: () => charger().then(() => { if ($('.liste-parcours')) remplirListe(); }),
  };
}
