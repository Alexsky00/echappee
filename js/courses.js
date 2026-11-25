// Onglet « Courses » : calendrier de la saison (donnees/calendrier.json).

import { echapper, aujourdhui, dateLocale, isoLocal } from './outils.js';
import { estCourseFavorite, basculerCourse } from './favoris.js';
import { chargerCalendrier, aLieuLe, prochaineCourse, diffuseursHTML, texteDates, drapeau, nomPays, nbJours } from './calendrier.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

const NOMS_A_VERIFIER = { dates: 'dates', diffuseurs: 'chaînes TV' };

/** Lundi et dimanche de la semaine en cours. */
function semaineEnCours() {
  const d = new Date();
  const decalage = (d.getDay() + 6) % 7;          // lundi = 0
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - decalage);
  const dimanche = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 6);
  return [isoLocal(lundi), isoLocal(dimanche)];
}

export function init(section) {
  section.innerHTML = `
    <div class="outils">
      <div class="segments" role="group" aria-label="Période">
        <button data-vue="semaine" aria-pressed="true">Cette semaine</button>
        <button data-vue="avenir" aria-pressed="false">À venir</button>
        <button data-vue="mois" aria-pressed="false">Par mois</button>
      </div>
      <select class="champ choix-mois" aria-label="Mois" hidden></select>
      <div class="ligne">
        <select class="champ choix-genre" aria-label="Hommes ou femmes">
          <option value="">Tous</option>
          <option value="H">Hommes</option>
          <option value="F">Femmes</option>
        </select>
        <button class="bouton bascule mes-courses" aria-pressed="false" style="flex:0 0 auto">★ Mes courses</button>
      </div>
    </div>
    <div class="resultat"></div>
    <p class="info">Touchez ☆ pour suivre une course : elle apparaîtra en tête du bandeau
      « Aujourd'hui à la TV », et vous pourrez l'ajouter au Calendrier de l'iPhone avec un rappel le matin.
      <br><br><span class="a-verifier">?</span> = information pas encore confirmée (les chaînes TV changent souvent).</p>`;

  const $ = (sel) => section.querySelector(sel);
  const etat = { vue: 'semaine', mois: new Date().getMonth(), genre: '', mesCourses: false };
  let cal = null;

  // --- Une carte de course ---
  function carte(c) {
    const jour = aujourdhui();
    const favori = estCourseFavorite(c.id);
    const enCours = aLieuLe(c, jour);
    const categorie = c.categorie.toLowerCase().replace(/\s+/g, '-');
    const genre = c.genre === 'F' ? 'Femmes' : c.genre === 'mixte' ? 'Hommes et femmes' : '';
    const verifier = (c.a_verifier || []).map((x) => NOMS_A_VERIFIER[x] || x);
    return `
      <li class="course${enCours ? ' en-cours' : ''}">
        ${dossard(c)}
        <div>
        <div class="course-haut">
          <h3 class="style-course">${echapper(c.nom)}</h3>
          <button class="etoile" data-id="${echapper(c.id)}" aria-pressed="${favori}" aria-label="Suivre cette course">${favori ? '★' : '☆'}</button>
        </div>
        <div class="dates">${texteDates(c)}</div>
        <div class="badges">
          ${enCours ? '<span class="badge en-cours">EN COURS</span>' : ''}
          <span class="badge cat cat-${categorie}">${echapper(c.categorie)}</span>
          <span class="badge">${echapper(c.type)}</span>
          ${genre ? `<span class="badge">${genre}</span>` : ''}
          <span class="badge">${drapeau(c.pays)} ${echapper(nomPays(c.pays))}</span>
        </div>
        <div class="tv">📺 ${diffuseursHTML(cal, c)}</div>
        ${verifier.length ? `<div class="a-verifier">? À confirmer : ${verifier.join(', ')}</div>` : ''}
        ${favori && c.fin >= jour ? `<div class="actions">
          <a class="bouton" href="ics/${encodeURIComponent(c.id)}.ics" target="_blank">📅 Ajouter à mon calendrier</a>
        </div>` : ''}
        </div>
      </li>`;
  }

  // --- Le dossard : jour + mois de départ, et la durée pour les courses à étapes ---
  function dossard(c) {
    const d = dateLocale(c.debut);
    const jours = nbJours(c.debut, c.fin) + 1;
    return `<div class="dossard" aria-hidden="true">
      <span class="jour">${d.getDate()}</span>
      <span class="mois">${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span>
      ${jours > 1 ? `<span class="duree">${jours} jours</span>` : ''}
    </div>`;
  }

  // --- Liste groupée par mois ---
  function listeParMois(courses) {
    let html = '', moisCourant = '';
    for (const c of courses) {
      const d = dateLocale(c.debut);
      const m = `${MOIS[d.getMonth()]} ${d.getFullYear()}`;
      if (m !== moisCourant) {
        if (moisCourant) html += '</ul>';
        html += `<h2 class="mois-titre style-course">${m}</h2><ul class="liste">`;
        moisCourant = m;
      }
      html += carte(c);
    }
    return html ? html + '</ul>' : '';
  }

  function afficher() {
    if (!cal) return;
    const jour = aujourdhui();
    let courses = cal.courses
      .filter((c) => !etat.genre || c.genre === etat.genre || c.genre === 'mixte')
      .filter((c) => !etat.mesCourses || estCourseFavorite(c.id))
      .sort((a, b) => a.debut.localeCompare(b.debut) || a.nom.localeCompare(b.nom));

    let html, vide;
    if (etat.vue === 'semaine') {
      const [lundi, dimanche] = semaineEnCours();
      courses = courses.filter((c) => c.debut <= dimanche && c.fin >= lundi);
      html = courses.length ? `<ul class="liste">${courses.map(carte).join('')}</ul>` : '';
      const p = prochaineCourse({ courses: cal.courses.filter((c) => !etat.mesCourses || estCourseFavorite(c.id)) }, jour);
      vide = 'Aucune course cette semaine.' + (p ? `<br>Prochaine : <b>${echapper(p.nom)}</b>, ${texteDates(p)}.` : '');
    } else if (etat.vue === 'avenir') {
      html = listeParMois(courses.filter((c) => c.fin >= jour));
      vide = etat.mesCourses ? 'Aucune course suivie à venir.<br>Touchez ☆ sur une course pour la suivre.' : 'Aucune course à venir.';
    } else {
      courses = courses.filter((c) => dateLocale(c.debut).getMonth() === etat.mois || dateLocale(c.fin).getMonth() === etat.mois);
      html = courses.length ? `<ul class="liste">${courses.map(carte).join('')}</ul>` : '';
      vide = `Aucune course en ${MOIS[etat.mois]}.`;
    }
    $('.resultat').innerHTML = html || `<p class="vide">${vide}</p>`;
  }

  // --- Gestes ---
  $('.segments').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    etat.vue = b.dataset.vue;
    section.querySelectorAll('.segments button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('.choix-mois').hidden = etat.vue !== 'mois';
    afficher();
  });
  $('.choix-mois').addEventListener('change', (e) => { etat.mois = Number(e.target.value); afficher(); });
  $('.choix-genre').addEventListener('change', (e) => { etat.genre = e.target.value; afficher(); });
  $('.mes-courses').addEventListener('click', (e) => {
    etat.mesCourses = !etat.mesCourses;
    e.currentTarget.setAttribute('aria-pressed', etat.mesCourses);
    afficher();
  });
  $('.resultat').addEventListener('click', (e) => {
    const b = e.target.closest('.etoile');
    if (!b) return;
    basculerCourse(b.dataset.id);
    afficher();
  });

  async function charger(recharger = false) {
    try {
      cal = await chargerCalendrier(recharger);
      // Hors saison (ex. en novembre pour la saison suivante) : « Par mois » commence en janvier
      const annee = new Date().getFullYear();
      if (annee < cal.saison) etat.mois = 0;
      $('.choix-mois').innerHTML = MOIS.map((m, i) =>
        `<option value="${i}"${i === etat.mois ? ' selected' : ''}>${m} ${cal.saison}</option>`).join('');
    } catch {
      $('.resultat').innerHTML = '<p class="vide">Pas de connexion : impossible de charger le calendrier.</p>';
      return;
    }
    afficher();
  }
  charger();

  return {
    afficher,
    rafraichir: () => charger(true),
  };
}
