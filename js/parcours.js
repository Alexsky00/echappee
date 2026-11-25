// Onglet « Parcours » : bibliothèque de boucles au départ de Vesoul.
// Les infos (distance, dénivelé, cols, profil) sont calculées par le robot
// dans parcours/index.json. La carte et le fichier GPX complet ne sont
// chargés qu'à l'ouverture d'un parcours (téléphone plus fluide).

import { chargerJSON, echapper } from './outils.js';
import {
  mesParcours, enregistrer, supprimer, creerParcours, creerBoucle, creerAllerRetour, estimationAllerRetour, gpxDe,
} from './mes-parcours.js';

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
  if (pourcent < -3) return '#2A3A62';    // vraie descente
  if (pourcent < 3) return '#3FA968';
  if (pourcent < 6) return '#FFD100';
  if (pourcent < 9) return '#FF8A1F';
  return '#FF2E88';
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
    svg += `<polygon points="${X(0)},${sol} ${ligne} ${X(kmMax)},${sol}" fill="#22345E"/>`;
    svg += `<polyline points="${ligne}" fill="none" stroke="#FFD100" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
    return svg + '</svg>';
  }
  // Lignes d'altitude
  for (let a = bas; a <= haut; a += (haut - bas > 600 ? 200 : 100)) {
    svg += `<line x1="${marge.g}" x2="${L - marge.d}" y1="${Y(a)}" y2="${Y(a)}" stroke="#2A3A62" stroke-width="1"/>`;
    svg += `<text x="${marge.g - 4}" y="${Y(a) + 4}" text-anchor="end" class="axe">${a}</text>`;
  }
  // Une bande colorée par tronçon, selon la pente
  for (let i = 1; i < pts.length; i++) {
    const [k1, a1] = pts[i - 1], [k2, a2] = pts[i];
    const pente = k2 > k1 ? ((a2 - a1) / ((k2 - k1) * 1000)) * 100 : 0;
    svg += `<polygon points="${X(k1).toFixed(1)},${sol} ${X(k1).toFixed(1)},${Y(a1).toFixed(1)} ${X(k2).toFixed(1)},${Y(a2).toFixed(1)} ${X(k2).toFixed(1)},${sol}" fill="${couleurPente(pente)}" stroke="${couleurPente(pente)}" stroke-width=".6"/>`;
  }
  svg += `<polyline points="${pts.map(([k, a]) => `${X(k).toFixed(1)},${Y(a).toFixed(1)}`).join(' ')}" fill="none" stroke="#F4F6FA" stroke-width="2"/>`;
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
    svg += `<line x1="${x}" x2="${x}" y1="${y}" y2="${yTexte + 3}" stroke="#FFD100" stroke-width="1.5" stroke-dasharray="3 2"/>`;
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
  const etat = { donnees: null, reglages: null, cols: null, distance: '', difficulte: '', carte: null,
    etapes: ['', '', ''], retour: true, boucle: { distance: 60, cap: null } };
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
      <button class="bouton large principal creer">➕ Créer mon parcours</button>
      <ul class="liste liste-parcours"></ul>
      <p class="info">Tous les parcours partent du centre de Vesoul. Ils sont calculés automatiquement
        sur de vraies routes : jetez un œil à la carte avant de partir (travaux, route fermée…).</p>`;

    $('.choix-distance').addEventListener('change', (e) => { etat.distance = e.target.value; remplirListe(); });
    $('.choix-difficulte').addEventListener('change', (e) => { etat.difficulte = e.target.value; remplirListe(); });
    $('.creer').addEventListener('click', vueCreer);
    $('.liste-parcours').addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (li) vueDetail(li.dataset.id);
    });
    remplirListe();
  }

  /** Tous les parcours : les miens d'abord, puis la bibliothèque. */
  function tousLesParcours() {
    return [...mesParcours(), ...(etat.donnees?.parcours ?? [])];
  }

  function remplirListe() {
    const liste = $('.liste-parcours');
    const d = DISTANCES.find((x) => x.valeur === etat.distance);
    const filtre = (p) =>
      p.distance >= d.min && p.distance < d.max && (!etat.difficulte || p.difficulte === etat.difficulte);
    const miens = mesParcours().filter(filtre);
    const biblio = (etat.donnees?.parcours ?? []).filter(filtre);
    const titre = (t) => `<li class="titre-groupe style-course">${t}</li>`;
    let html = '';
    if (miens.length) html += titre('Mes parcours') + miens.map(carte).join('');
    if (biblio.length) html += (miens.length ? titre('Bibliothèque') : '') + biblio.map(carte).join('');
    if (!etat.donnees) html += '<li class="vide">Pas de connexion : impossible de charger la bibliothèque.</li>';
    else if (!html) html = '<li class="vide">Aucun parcours ne correspond à ces filtres.</li>';
    liste.innerHTML = html;
  }

  function carte(p) {
    return `
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
      </li>`;
  }

  // =========================================================== DÉTAIL
  let fichierGPX = null;   // le GPX, préchargé pour que « Envoyer » réagisse tout de suite

  function vueDetail(id) {
    const p = tousLesParcours().find((x) => x.id === id);
    if (!p) return vueListe();
    window.scrollTo(0, 0);
    fichierGPX = null;
    // Parcours perso : le GPX est fabriqué sur place ; sinon il est sur le site
    const lienGPX = p.perso
      ? URL.createObjectURL(new Blob([gpxDe(p)], { type: 'application/gpx+xml' }))
      : p.fichier;
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
        <span><i style="background:#3FA968"></i>&lt; 3 %</span><span><i style="background:#FFD100"></i>3-6 %</span>
        <span><i style="background:#FF8A1F"></i>6-9 %</span><span><i style="background:#FF2E88"></i>&gt; 9 %</span>
        <span><i style="background:#2A3A62;outline:1px solid #4A5B82"></i>descente</span>
      </div>

      <div class="actions-parcours">
        <button class="bouton large principal envoyer">📲 Envoyer vers mon GPS</button>
        <a class="bouton large" href="${echapper(lienGPX)}" download="${echapper(p.id)}.gpx">⬇️ Télécharger le fichier GPX</a>
        <p class="discret">« Envoyer » ouvre le menu de partage de l'iPhone : choisissez
          <b>Bryton Active</b>, puis synchronisez le compteur.
          S'il n'apparaît pas : <b>Enregistrer dans Fichiers</b>, puis dans l'app Fichiers,
          touchez le fichier → Partager → <b>Bryton Active</b>.</p>
      </div>

      ${p.reperes.length ? `<h3 class="sous-titre style-course">Cols et lieux</h3>
      <ul class="reperes">${p.reperes.map((r) => `
        <li><span class="km style-course">km ${Math.round(r.km)}</span>
          <span>${r.type === 'col' ? '⛰️' : '📍'} ${echapper(r.nom)}${r.alt ? ` <span class="discret">(${r.alt} m)</span>` : ''}</span></li>`).join('')}
      </ul>` : ''}

      <h3 class="sous-titre style-course">Carte</h3>
      <div class="zone-carte"><button class="bouton large voir-carte">🗺️ Afficher la carte</button></div>
      ${p.perso ? '<button class="bouton large supprimer">🗑️ Supprimer ce parcours</button>' : ''}`;

    $('.retour').addEventListener('click', vueListe);
    $('.voir-carte').addEventListener('click', () => afficherCarte(p));
    $('.envoyer').addEventListener('click', () => envoyer(p));
    $('.supprimer')?.addEventListener('click', () => {
      if (confirm(`Supprimer « ${p.nom} » de vos parcours ?`)) { supprimer(p.id); vueListe(); }
    });

    // Préchargement du GPX (Safari exige que le partage parte directement du toucher)
    const nomFichier = `${p.id}.gpx`;
    const prendre = (texte) => {
      fichierGPX = { texte, file: new File([texte], nomFichier, { type: 'application/gpx+xml' }) };
    };
    if (p.perso) prendre(gpxDe(p));
    else fetch(p.fichier).then((r) => r.text()).then(prendre).catch(() => {});
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
      // Parcours perso : les points sont déjà là ; sinon on lit le fichier GPX
      const [, texte] = await Promise.all([
        chargerLeaflet(),
        p.points ? null : fichierGPX ? fichierGPX.texte : fetch(p.fichier).then((r) => r.text()),
      ]);
      const points = p.points ? p.points.map(([la, lo]) => [la, lo]) : pointsGPX(texte);
      nettoyerCarte();
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
      const trace = L.polyline(allege, { color: '#FF2E88', weight: 5 }).addTo(etat.carte);
      L.circleMarker(points[0], { radius: 10, color: '#0B1530', weight: 3, fillColor: '#FFD100', fillOpacity: 1 })
        .bindTooltip('Départ', { permanent: true, direction: 'right' }).addTo(etat.carte);
      // Bornes kilométriques tous les 10 km : on voit le sens et l'avancée de la boucle
      let km = 0, prochaine = 10;
      for (let i = 1; i < points.length; i++) {
        km += window.L.latLng(points[i - 1]).distanceTo(points[i]) / 1000;
        if (km >= prochaine) {
          L.marker(points[i], { interactive: false, icon: L.divIcon({ className: 'borne-km', html: String(prochaine), iconSize: [30, 22] }) })
            .addTo(etat.carte);
          prochaine += 10;
        }
      }
      etat.carte.fitBounds(trace.getBounds(), { padding: [20, 20] });
    } catch {
      zone.innerHTML = '<p class="vide">Impossible d\'afficher la carte (pas de connexion ?).</p>';
    }
  }

  function nettoyerCarte() {
    if (etat.carte) { etat.carte.remove(); etat.carte = null; }
  }

  // =========================================================== CRÉER
  // Trois façons de créer un parcours, de la plus simple à la plus libre :
  //   1. « Une boucle » : on touche une distance et une direction, l'app invente la boucle ;
  //   2. « Aller jusqu'à… » : on touche un but dans une liste, l'app trace l'aller-retour ;
  //   3. « Mode avancé » : on tape soi-même les villages par où passer.
  const villeDepart = () => etat.reglages?.ville ?? { nom: 'Vesoul', lat: 47.6227, lon: 6.1556 };

  function vueCreer() {
    nettoyerCarte();
    window.scrollTo(0, 0);
    section.innerHTML = `
      <button class="bouton retour">← Tous les parcours</button>
      <h2 class="titre-parcours style-course">Créer mon parcours</h2>
      <p>Départ de <b>${echapper(villeDepart().nom)}</b>. Que voulez-vous faire ?</p>
      <div class="choix-creation">
        <button class="choix-grand boucle">
          <span class="choix-titre style-course">🔄 Une boucle</span>
          <span>Choisissez la distance et la direction</span>
        </button>
        <button class="choix-grand destination">
          <span class="choix-titre style-course">🎯 Aller jusqu'à…</span>
          <span>Un village, un col, un lac</span>
        </button>
      </div>
      <button class="bouton large avance">Mode avancé : taper les villages</button>`;
    $('.retour').addEventListener('click', vueListe);
    $('.boucle').addEventListener('click', vueBoucle);
    $('.destination').addEventListener('click', vueDestination);
    $('.avance').addEventListener('click', vueAvance);
  }

  // Lance un calcul de parcours en affichant où on en est ; ouvre l'aperçu à la fin.
  async function lancer(calcul, retour, refaire) {
    const message = $('.etat-creation');
    const boutons = section.querySelectorAll('button');
    if (!navigator.onLine) { message.textContent = 'Pas de connexion internet : impossible de tracer.'; return; }
    boutons.forEach((b) => { b.disabled = true; });
    try {
      const p = await calcul((t) => { message.textContent = t; });
      vueApercu(p, { retour, refaire });
    } catch {
      message.textContent = 'Le calcul n\'a pas abouti. Vérifiez la connexion et réessayez.';
      boutons.forEach((b) => { b.disabled = false; });
    }
  }

  // ---- 1. Une boucle : distance + direction
  function vueBoucle() {
    window.scrollTo(0, 0);
    const b = etat.boucle;
    const bouton = (classe, valeur, texte, choisi) =>
      `<button type="button" class="pastille-choix ${classe}" data-v="${valeur}" aria-pressed="${choisi}">${texte}</button>`;
    section.innerHTML = `
      <button class="bouton retour">← Retour</button>
      <h2 class="titre-parcours style-course">Une boucle</h2>

      <h3 class="sous-titre style-course">Quelle distance ?</h3>
      <div class="grille-choix">
        ${[40, 60, 80, 100, 120, 150].map((km) => bouton('distance', km, `${km}<small> km</small>`, b.distance === km)).join('')}
      </div>

      <h3 class="sous-titre style-course">Vers où ?</h3>
      <div class="boussole">
        ${bouton('cap nord', 0, 'Nord', b.cap === 0)}
        ${bouton('cap ouest', 270, 'Ouest', b.cap === 270)}
        <span class="centre-boussole style-course">${echapper(villeDepart().nom)}</span>
        ${bouton('cap est', 90, 'Est', b.cap === 90)}
        ${bouton('cap sud', 180, 'Sud', b.cap === 180)}
      </div>
      <p class="discret">À l'est et au nord-est : les Vosges, ça grimpe. À l'ouest : la Saône, c'est plus plat.</p>

      <button class="bouton large principal tracer">🚴 Tracer ma boucle</button>
      <p class="etat-creation" role="status" aria-live="polite"></p>`;

    $('.retour').addEventListener('click', vueCreer);
    section.querySelectorAll('.pastille-choix').forEach((el) => el.addEventListener('click', () => {
      const cle = el.classList.contains('distance') ? 'distance' : 'cap';
      b[cle] = Number(el.dataset.v);
      section.querySelectorAll(`.${cle}`).forEach((x) => x.setAttribute('aria-pressed', x === el));
      $('.etat-creation').textContent = '';
    }));
    const tracerBoucle = () => lancer(
      (progres) => creerBoucle({ ...b, ville: villeDepart(), cols: etat.cols }, progres), vueBoucle, tracerBoucle);
    $('.tracer').addEventListener('click', () => {
      if (b.cap === null) { $('.etat-creation').textContent = 'Touchez une direction : nord, est, sud ou ouest.'; return; }
      tracerBoucle();
    });
  }

  // ---- 2. Aller jusqu'à… : une liste de buts, du plus proche au plus loin
  function vueDestination() {
    window.scrollTo(0, 0);
    const ville = villeDepart();
    const buts = [
      ...(etat.reglages?.destinations ?? []).map((d) => ({ ...d, type: 'ville' })),
      ...(etat.cols?.points ?? []).map((d) => ({ nom: d.nom, lat: d.lat, lon: d.lon, type: d.type })),
    ].map((d) => ({ ...d, km: estimationAllerRetour(ville, d) }))
      .filter((d) => d.km >= 25)
      .sort((a, c) => a.km - c.km);
    section.innerHTML = `
      <button class="bouton retour">← Retour</button>
      <h2 class="titre-parcours style-course">Aller jusqu'à…</h2>
      <p>Touchez votre but : l'aller et le retour passent par deux routes différentes.</p>
      <p class="etat-creation" role="status" aria-live="polite"></p>
      <ul class="liste liste-buts">${buts.map((d, i) => `
        <li><button class="but" data-i="${i}">
          <span class="but-nom">${d.type === 'col' ? '⛰️' : d.type === 'lieu' ? '📍' : '🏘️'} ${echapper(d.nom)}</span>
          <span class="but-km style-course">≈ ${d.km} km</span>
        </button></li>`).join('')}
      </ul>`;
    $('.retour').addEventListener('click', vueCreer);
    $('.liste-buts').addEventListener('click', (e) => {
      const el = e.target.closest('.but');
      if (!el) return;
      const destination = buts[Number(el.dataset.i)];
      window.scrollTo(0, 0);
      const tracerBut = () => lancer(
        (progres) => creerAllerRetour({ destination, ville, cols: etat.cols }, progres), vueDestination, tracerBut);
      tracerBut();
    });
  }

  // ---- 3. Mode avancé : on tape les villages ou cols par où passer
  function vueAvance() {
    nettoyerCarte();
    window.scrollTo(0, 0);
    const ville = etat.reglages?.ville ?? { nom: 'Vesoul', lat: 47.6227, lon: 6.1556 };
    const suggestions = (etat.cols?.points ?? []).map((r) => `<option value="${echapper(r.nom)}"></option>`).join('');
    section.innerHTML = `
      <button class="bouton retour">← Retour</button>
      <h2 class="titre-parcours style-course">Mode avancé</h2>
      <p>Départ de <b>${echapper(ville.nom)}</b>. Indiquez les villages ou les cols par où passer,
        <b>dans l'ordre</b>. L'app trace la route tout de suite.</p>
      <form class="formulaire creation">
        <div class="etapes"></div>
        <button class="bouton large ajouter-etape" type="button">＋ Ajouter une étape</button>
        <label class="case"><input type="checkbox" name="retour"${etat.retour ? ' checked' : ''}>
          Revenir à ${echapper(ville.nom)} à la fin</label>
        <button class="bouton large principal" type="submit">🚴 Tracer le parcours</button>
        <p class="etat-creation" role="status" aria-live="polite"></p>
      </form>
      <datalist id="liste-cols">${suggestions}</datalist>
      <p class="info">Exemples d'étapes : « Faucogney-et-la-Mer », « Col du Mont de Fourche »,
        « Planche des Belles Filles ». Il faut une connexion internet pour tracer.</p>`;

    const zone = $('.etapes');
    const dessinerEtapes = () => {
      zone.innerHTML = etat.etapes.map((v, i) => `
        <div class="etape">
          <label>Étape ${i + 1}
            <input class="champ" name="etape" value="${echapper(v)}" list="liste-cols" autocomplete="off"
                   autocapitalize="words" placeholder="Village ou col">
          </label>
          ${etat.etapes.length > 1 ? `<button class="bouton enlever" type="button" data-i="${i}" aria-label="Enlever l'étape ${i + 1}">✕</button>` : ''}
        </div>`).join('');
    };
    const lireEtapes = () => { etat.etapes = [...zone.querySelectorAll('input')].map((x) => x.value); };
    dessinerEtapes();

    $('.retour').addEventListener('click', vueCreer);
    $('.ajouter-etape').addEventListener('click', () => {
      lireEtapes();
      if (etat.etapes.length < 8) etat.etapes.push('');
      dessinerEtapes();
      zone.querySelector('.etape:last-child input').focus();
    });
    zone.addEventListener('click', (e) => {
      const b = e.target.closest('.enlever');
      if (!b) return;
      lireEtapes();
      etat.etapes.splice(Number(b.dataset.i), 1);
      dessinerEtapes();
    });

    $('.creation').addEventListener('submit', async (e) => {
      e.preventDefault();
      lireEtapes();
      etat.retour = e.target.retour.checked;
      const etapes = etat.etapes.map((x) => x.trim()).filter(Boolean);
      const message = $('.etat-creation');
      const bouton = e.target.querySelector('[type=submit]');
      if (!etapes.length) { message.textContent = 'Indiquez au moins une étape.'; return; }
      if (!navigator.onLine) { message.textContent = 'Pas de connexion internet : impossible de tracer.'; return; }
      bouton.disabled = true;
      try {
        const p = await creerParcours({ etapes, retour: etat.retour, ville, cols: etat.cols },
          (t) => { message.textContent = t; });
        vueApercu(p, { retour: vueAvance });
      } catch (err) {
        message.textContent = err.lieu
          ? `Lieu « ${err.lieu} » introuvable. Vérifiez l'orthographe (avec les tirets, ex. « Saint-Loup-sur-Semouse »).`
          : 'Le calcul du tracé n\'a pas abouti. Vérifiez la connexion et réessayez.';
        bouton.disabled = false;
      }
    });
  }

  // Aperçu du parcours tracé, avant de l'enregistrer
  function vueApercu(p, { retour, refaire } = {}) {
    nettoyerCarte();
    window.scrollTo(0, 0);
    section.innerHTML = `
      <button class="bouton retour">← Changer</button>
      <h2 class="titre-parcours style-course">Votre parcours</h2>

      <div class="stats">
        <div><span class="valeur style-course">${p.distance.toLocaleString('fr-FR')}</span><span>km</span></div>
        <div><span class="valeur style-course">${p.denivele}</span><span>m de D+</span></div>
        <div><span class="valeur style-course">${p.alt_max}</span><span>m alt. max</span></div>
        <div class="diff-${p.difficulte}"><span class="valeur style-course">${DIFFICULTES[p.difficulte]}</span><span>difficulté</span></div>
      </div>
      ${profilSVG(p)}

      ${p.reperes.length ? `<p class="cols">⛰️ ${p.reperes.map((r) => echapper(r.nom)).join(' · ')}</p>` : ''}
      <h3 class="sous-titre style-course">La route</h3>
      <div class="zone-carte"></div>
      <p class="discret">Les petits chiffres sont les kilomètres : ils montrent le sens de la boucle.
        Pincez la carte avec deux doigts pour zoomer.</p>
      ${refaire ? '<button class="bouton large refaire">🔁 Autre idée</button>' : ''}

      ${p.etapes.length ? `<h3 class="sous-titre style-course">Étapes trouvées</h3>
      <ul class="reperes">${p.etapes.map((e, i) => `
        <li><span class="km style-course">${i === 0 ? 'Départ' : i === p.etapes.length - 1 && i > etat.etapes.filter((x) => x.trim()).length ? 'Arrivée' : i}</span>
          <span>${echapper(e.texte)} <span class="discret">→ ${echapper(e.trouve)}</span></span></li>`).join('')}
      </ul>
      <p class="discret">Si une étape a été trouvée au mauvais endroit, revenez en arrière et précisez son nom.</p>` : ''}

      <form class="formulaire enregistrement">
        <label>Nom du parcours
          <input class="champ" name="nom" value="${echapper(p.nom)}" maxlength="80">
        </label>
        <button class="bouton large principal" type="submit">💾 Enregistrer dans mes parcours</button>
        <p class="etat-creation" role="status" aria-live="polite"></p>
      </form>`;

    $('.retour').addEventListener('click', retour ?? vueCreer);
    $('.refaire')?.addEventListener('click', refaire);
    afficherCarte(p);          // la carte s'affiche tout de suite, pour juger la route
    $('.enregistrement').addEventListener('submit', (e) => {
      e.preventDefault();
      p.nom = e.target.nom.value.trim() || p.nom;
      if (!enregistrer(p)) {
        $('.etat-creation').textContent = 'Mémoire pleine : supprimez un ancien parcours perso puis réessayez.';
        return;
      }
      etat.etapes = ['', '', ''];
      vueDetail(p.id);
    });
  }

  // =========================================================== CHARGEMENT
  async function charger() {
    const [donnees, reglages, cols] = await Promise.allSettled([
      chargerJSON('parcours/index.json'),
      chargerJSON('donnees/reglages.json'),
      chargerJSON('donnees/cols.json'),
    ]);
    etat.cols = cols.status === 'fulfilled' ? cols.value : null;
    etat.donnees = donnees.status === 'fulfilled' ? donnees.value : null;
    etat.reglages = reglages.status === 'fulfilled' ? reglages.value : null;
  }

  section.innerHTML = '<p class="vide">Chargement des parcours…</p>';
  charger().then(vueListe);

  return {
    rafraichir: () => charger().then(() => { if ($('.liste-parcours')) remplirListe(); }),
  };
}
