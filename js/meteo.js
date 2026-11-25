// Onglet « Météo » : prévisions à Vesoul par Open-Meteo (gratuit, sans clé)
// et verdict simple « bon jour pour rouler » ou non.
// Le verdict est aussi affiché en petit sur l'onglet Actus.

import { chargerJSON, echapper, dateRelative } from './outils.js';

// ---------------------------------------------------------------------------
// Règles du verdict : à modifier ici si besoin (heures de sortie : 9 h → 18 h)
// ---------------------------------------------------------------------------
const HEURE_DEBUT = 9;
const HEURE_FIN = 18;
const REGLES = {
  //                      orange si ≥   rouge si ≥
  pluieProba:   { orange: 30, rouge: 60 },   // %
  pluieMm:      { orange: 0.5, rouge: 2 },   // mm sur la journée de sortie
  vent:         { orange: 25, rouge: 40 },   // km/h (vent moyen)
  rafales:      { orange: 40, rouge: 55 },   // km/h
  froid:        { orange: 8, rouge: 3 },     // °C max de la journée (en dessous)
  chaud:        { orange: 30, rouge: 34 },   // °C max de la journée (au-dessus)
};

const VERDICTS = {
  // texte : phrase de la pastille (onglet Actus) ; avant + gros : le grand verdict de l'onglet Météo
  vert:   { texte: 'Bon jour pour rouler !',            avant: 'Oui,',      gros: 'On roule !', couleur: 'vert' },
  orange: { texte: 'Sortie possible, avec précautions', avant: 'Possible,', gros: 'Prudence',   couleur: 'orange' },
  rouge:  { texte: 'Pas un jour pour rouler',           avant: 'Non,',      gros: 'Repos',      couleur: 'rouge' },
};

// Codes météo internationaux (WMO) → emoji + texte
function ciel(code) {
  if (code === 0) return ['☀️', 'Grand soleil'];
  if (code <= 2) return ['🌤️', 'Éclaircies'];
  if (code === 3) return ['☁️', 'Couvert'];
  if (code <= 48) return ['🌫️', 'Brouillard'];
  if (code <= 57) return ['🌦️', 'Bruine'];
  if (code <= 67) return ['🌧️', 'Pluie'];
  if (code <= 77) return ['🌨️', 'Neige'];
  if (code <= 82) return ['🌦️', 'Averses'];
  if (code <= 86) return ['🌨️', 'Averses de neige'];
  return ['⛈️', 'Orages'];
}

const DIRECTIONS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
function nomDirection(degres) {
  return DIRECTIONS[Math.round(degres / 45) % 8];
}

/** Flèche qui montre où va le vent (le vent « du nord » souffle vers le sud). */
function fleche(degres, taille = 22) {
  return `<svg class="fleche" width="${taille}" height="${taille}" viewBox="0 0 24 24" style="transform:rotate(${degres + 180}deg)" aria-hidden="true">
    <path d="M12 2l6 18-6-4-6 4z" fill="currentColor"/></svg>`;
}

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
let promesse = null;

/** Prévisions (rechargées si plus vieilles que 30 min). */
export function chargerMeteo(recharger = false) {
  if (!promesse || recharger || Date.now() - promesse.le > 30 * 60 * 1000) {
    const p = (async () => {
      const reglages = await chargerJSON('donnees/reglages.json');
      const { lat, lon, nom } = reglages.ville;
      const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
        latitude: lat, longitude: lon, timezone: 'Europe/Paris', forecast_days: 4,
        hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
      });
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error('Open-Meteo : erreur ' + reponse.status);
      return { ville: nom, ...(await reponse.json()), recu: new Date().toISOString() };
    })();
    p.catch(() => { promesse = null; });
    p.le = Date.now();
    promesse = p;
  }
  return promesse;
}

/** Les heures d'une journée (« 2027-04-11 »), entre deux heures. */
function heuresDuJour(m, jour, de = 0, a = 23) {
  const h = m.hourly;
  const liste = [];
  h.time.forEach((t, i) => {
    const heure = Number(t.slice(11, 13));
    if (t.startsWith(jour) && heure >= de && heure <= a) {
      liste.push({
        heure, t,
        temp: h.temperature_2m[i],
        proba: h.precipitation_probability[i] ?? 0,
        pluie: h.precipitation[i] ?? 0,
        code: h.weather_code[i],
        vent: h.wind_speed_10m[i],
        dir: h.wind_direction_10m[i],
        rafales: h.wind_gusts_10m[i],
      });
    }
  });
  return liste;
}

/** Verdict d'une journée : couleur + raisons. */
export function verdictJour(m, jour) {
  // Pour aujourd'hui, seules les heures à venir comptent (la pluie de ce matin est passée)
  const estAujourdhui = jour === m.daily.time[0];
  const debut = estAujourdhui ? Math.max(HEURE_DEBUT, new Date().getHours()) : HEURE_DEBUT;
  const heures = heuresDuJour(m, jour, debut, HEURE_FIN);
  if (!heures.length) return null;
  const max = (cle) => Math.max(...heures.map((x) => x[cle]));
  const mesures = {
    pluieProba: max('proba'),
    pluieMm: heures.reduce((s, x) => s + x.pluie, 0),
    vent: max('vent'),
    rafales: max('rafales'),
    tempMax: max('temp'),
  };
  let niveau = 0;   // 0 vert, 1 orange, 2 rouge
  const raisons = [];
  const noter = (n, texte) => { niveau = Math.max(niveau, n); raisons.push(texte); };
  const test = (cle, valeur, texte) => {
    const r = REGLES[cle];
    if (valeur >= r.rouge) noter(2, texte);
    else if (valeur >= r.orange) noter(1, texte);
  };
  test('pluieProba', mesures.pluieProba, `🌧️ Risque de pluie : ${mesures.pluieProba} %`);
  test('pluieMm', mesures.pluieMm, `☔ Pluie prévue : ${mesures.pluieMm.toFixed(1).replace('.', ',')} mm`);
  test('vent', mesures.vent, `💨 Vent : ${Math.round(mesures.vent)} km/h`);
  test('rafales', mesures.rafales, `🌬️ Rafales : ${Math.round(mesures.rafales)} km/h`);
  if (mesures.tempMax <= REGLES.froid.rouge) noter(2, `🥶 Très froid : ${Math.round(mesures.tempMax)} °C au mieux`);
  else if (mesures.tempMax <= REGLES.froid.orange) noter(1, `🧤 Froid : ${Math.round(mesures.tempMax)} °C au mieux`);
  if (mesures.tempMax >= REGLES.chaud.rouge) noter(2, `🥵 Canicule : ${Math.round(mesures.tempMax)} °C`);
  else if (mesures.tempMax >= REGLES.chaud.orange) noter(1, `☀️ Chaud : ${Math.round(mesures.tempMax)} °C, pensez à boire`);

  // Meilleur créneau de 3 heures (le moins de pluie, puis le moins de vent)
  let meilleur = null;
  for (let i = 0; i + 2 < heures.length; i++) {
    const bloc = heures.slice(i, i + 3);
    const score = Math.max(...bloc.map((x) => x.proba)) * 2 + Math.max(...bloc.map((x) => x.vent)) - Math.min(...bloc.map((x) => x.temp)) * 0.5;
    if (!meilleur || score < meilleur.score) meilleur = { score, de: bloc[0].heure, a: bloc[2].heure + 1 };
  }

  // Direction du vent dominante pendant la sortie
  const dir = moyenneDirection(heures.map((x) => x.dir));
  return { ...VERDICTS[['vert', 'orange', 'rouge'][niveau]], raisons, mesures, meilleur, dir };
}

function moyenneDirection(degres) {
  const x = degres.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0);
  const y = degres.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Petite pastille météo pour l'onglet Actus. */
export async function pastilleHTML() {
  const m = await chargerMeteo();
  const jour = choisirJour(m);
  const v = verdictJour(m, jour);
  if (!v) return '';
  const quand = jour === m.daily.time[0] ? "Aujourd'hui" : 'Demain';
  return `<a class="pastille-meteo ${v.couleur}" href="#meteo">
    <span class="rond"></span><span><b>${quand} :</b> ${v.texte}</span><span class="aller">›</span></a>`;
}

/** Après 18 h, on s'intéresse plutôt à demain. */
function choisirJour(m) {
  return new Date().getHours() >= HEURE_FIN ? m.daily.time[1] : m.daily.time[0];
}

// ---------------------------------------------------------------------------
// Affichage de l'onglet
// ---------------------------------------------------------------------------
const JOURS = { weekday: 'long', day: 'numeric', month: 'long' };

export function init(section) {
  async function afficher(recharger = false) {
    let m;
    try {
      m = await chargerMeteo(recharger);
    } catch {
      section.innerHTML = '<p class="vide">Pas de connexion : impossible de charger la météo.</p>';
      return;
    }
    const jour = choisirJour(m);
    const v = verdictJour(m, jour);
    const quand = jour === m.daily.time[0] ? "Aujourd'hui" : 'Demain';
    const dateJour = new Date(jour + 'T12:00').toLocaleDateString('fr-FR', JOURS);

    // Prochaines heures (12 h à partir de maintenant)
    const maintenant = new Date();
    const debut = m.hourly.time.findIndex((t) => new Date(t) >= new Date(maintenant.getTime() - 3600000));
    const prochaines = [];
    for (let i = debut; i < debut + 12 && i < m.hourly.time.length; i++) {
      const [emoji] = ciel(m.hourly.weather_code[i]);
      prochaines.push(`<li>
        <span class="h">${m.hourly.time[i].slice(11, 13)} h</span>
        <span class="e">${emoji}</span>
        <span class="t">${Math.round(m.hourly.temperature_2m[i])}°</span>
        <span class="p">${m.hourly.precipitation_probability[i] ?? 0} %</span>
        <span class="v">${fleche(m.hourly.wind_direction_10m[i], 18)} ${Math.round(m.hourly.wind_speed_10m[i])}</span>
      </li>`);
    }

    // Les 3 jours suivants
    const jours = m.daily.time.slice(1, 4).map((d, k) => {
      const i = k + 1;
      const vj = verdictJour(m, d);
      const [emoji, texte] = ciel(m.daily.weather_code[i]);
      const nom = new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
      return `<li class="jour">
        <span class="rond ${vj?.couleur ?? ''}" title="${echapper(vj?.texte ?? '')}"></span>
        <div class="jour-nom"><b>${nom}</b><span class="discret">${texte}</span></div>
        <span class="jour-ciel">${emoji}</span>
        <div class="jour-chiffres">
          <span><b>${Math.round(m.daily.temperature_2m_max[i])}°</b> / ${Math.round(m.daily.temperature_2m_min[i])}°</span>
          <span class="discret">${vj ? `💧${vj.mesures.pluieProba} % · ${fleche(vj.dir, 14)} ${Math.round(vj.mesures.vent)} km/h` : ''}</span>
        </div>
      </li>`;
    }).join('');

    // Le vent vient de cette direction : partir face à lui, rentrer vent dans le dos
    const dirTexte = v ? nomDirection(v.dir) : '';
    section.innerHTML = `
      ${v ? `<div class="verdict ${v.couleur}">
        <div class="verdict-quand">${quand} · ${dateJour}</div>
        <div class="verdict-avant style-course">${v.avant}</div>
        <div class="verdict-texte style-course">${v.gros}</div>
        ${v.raisons.length ? `<ul class="raisons">${v.raisons.map((r) => `<li>${r}</li>`).join('')}</ul>` : '<p class="raisons">Pas de pluie, peu de vent, température agréable.</p>'}
        ${v.meilleur ? `<p class="creneau">Meilleur moment : <b>${v.meilleur.de} h – ${v.meilleur.a} h</b></p>` : ''}
      </div>
      <div class="conseil-vent">
        ${fleche(v.dir, 40)}
        <p>Vent du <b>${dirTexte}</b>, ${Math.round(v.mesures.vent)} km/h (rafales ${Math.round(v.mesures.rafales)}).
          <br>Partez <b>vers le ${dirTexte}</b>, face au vent : vous rentrerez vent dans le dos.</p>
      </div>` : ''}

      <h3 class="sous-titre style-course">Prochaines heures</h3>
      <ul class="heures">${prochaines.join('')}</ul>
      <p class="discret legende-heures">Température · risque de pluie · vent (km/h)</p>

      <h3 class="sous-titre style-course">Les 3 prochains jours</h3>
      <ul class="jours">${jours}</ul>

      <p class="discret">Météo à ${echapper(m.ville)} · mise à jour ${dateRelative(m.recu)} · source Open-Meteo.</p>`;
  }

  afficher();
  return {
    afficher: () => afficher(),
    rafraichir: () => afficher(true),
  };
}
