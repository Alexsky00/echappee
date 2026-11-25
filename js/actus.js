// Onglets « Actus » (fil pro) et « Matériel » : même code, fichier de données différent.
// Les articles sont préparés par le robot GitHub dans donnees/actus-pro.json
// et donnees/actus-materiel.json (voir outils/robot.py).

import { chargerJSON, echapper, normaliser, dateRelative, aujourdhui } from './outils.js';
import { estArticleFavori, basculerArticle, articlesFavoris, estCourseFavorite } from './favoris.js';
import { chargerCalendrier, coursesDuJour, prochaineCourse, diffuseursHTML, texteDates, nbJours } from './calendrier.js';

const PAR_PAGE = 25;   // articles affichés d'un coup (peu d'éléments = téléphone fluide)

/** Image réduite à la bonne taille par le service gratuit wsrv.nl (bien plus légère). */
function miniature(url) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=208&h=156&fit=cover&output=webp&q=65`;
}

export function init(section, fil) {
  section.innerHTML = `
    ${fil === 'pro' ? '<div class="zone-bandeau"></div><div class="zone-meteo"></div>' : ''}
    <div class="outils">
      <input type="search" class="champ recherche" placeholder="🔍 Rechercher un mot…" enterkeyhint="search" autocomplete="off">
      <div class="ligne">
        <select class="champ choix-source" aria-label="Source"><option value="">Toutes les sources</option></select>
        <button class="bouton bascule voir-favoris" aria-pressed="false" style="flex:0 0 auto">★ Favoris</button>
      </div>
    </div>
    <ul class="liste"></ul>
    <button class="bouton large voir-plus" hidden style="margin-top:14px">Voir plus d'articles</button>
    <p class="discret mise-a-jour"></p>`;

  const $ = (sel) => section.querySelector(sel);
  const etat = { articles: [], affiches: [], nombre: PAR_PAGE, favoris: false };

  // --- Affichage de la liste ---
  function afficher() {
    const mot = normaliser($('.recherche').value.trim());
    const source = $('.choix-source').value;
    const base = etat.favoris ? articlesFavoris(fil) : etat.articles;
    const filtres = base.filter((a) =>
      (!source || a.source === source) &&
      (!mot || normaliser(a.titre + ' ' + (a.resume || '')).includes(mot)));

    etat.affiches = filtres.slice(0, etat.nombre);
    $('.voir-plus').hidden = filtres.length <= etat.nombre;

    if (!etat.affiches.length) {
      $('.liste').innerHTML = `<li class="vide">${etat.favoris
        ? 'Aucun article en favori.<br>Touchez ☆ à côté d\'un article pour le garder ici.'
        : 'Aucun article trouvé.'}</li>`;
      return;
    }
    $('.liste').innerHTML = etat.affiches.map((a, i) => `
      <li class="article">
        <a href="${echapper(a.lien)}" target="_blank" rel="noopener">
          ${a.image ? `<img src="${miniature(a.image)}" data-original="${echapper(a.image)}" alt="" width="104" height="78" loading="lazy" decoding="async" crossorigin="anonymous">` : ''}
          <div>
            <span class="source">${echapper(a.source)}</span>
            <h3>${echapper(a.titre)}</h3>
            <div class="meta">${dateRelative(a.date)}</div>
          </div>
        </a>
        <button class="etoile" data-i="${i}" aria-pressed="${estArticleFavori(a.lien)}"
          aria-label="Favori">${estArticleFavori(a.lien) ? '★' : '☆'}</button>
      </li>`).join('');
  }

  // --- Chargement des articles ---
  async function charger() {
    try {
      const donnees = await chargerJSON(`donnees/actus-${fil}.json`);
      etat.articles = donnees.articles;
      const choix = $('.choix-source');
      const actuelle = choix.value;
      choix.innerHTML = '<option value="">Toutes les sources</option>' +
        donnees.sources.map((s) => `<option${s === actuelle ? ' selected' : ''}>${echapper(s)}</option>`).join('');
      $('.mise-a-jour').textContent = `Actualités rassemblées ${dateRelative(donnees.genere_le)}.`;
    } catch {
      $('.mise-a-jour').textContent = 'Pas de connexion : impossible de charger les actualités.';
    }
    afficher();
  }

  // --- Bandeau « Aujourd'hui à la TV » (seulement sur l'onglet Actus) ---
  async function bandeau() {
    const zone = $('.zone-bandeau');
    if (!zone) return;
    try {
      const cal = await chargerCalendrier();
      const jour = coursesDuJour(cal).slice(0, 3);
      if (jour.length) {
        // Habillage « EN DIRECT » : une ligne par course du jour
        zone.innerHTML = `<a class="bandeau-tv direct" href="#courses">
          <span class="tv-etiquette style-course"><span class="point-direct"></span>Aujourd'hui à la TV</span>
          <div class="tv-corps">${jour.map((c) => {
            const total = nbJours(c.debut, c.fin) + 1;
            const numero = nbJours(c.debut, aujourdhui()) + 1;
            return `<div class="tv-ligne">
              <div class="tv-course style-course">${estCourseFavorite(c.id) ? '★ ' : ''}${echapper(c.nom)}
                ${total > 1 ? `<span class="etape">· jour ${numero}/${total}</span>` : ''}</div>
              <div class="tv-chaine">📺 ${diffuseursHTML(cal, c)}</div>
            </div>`;
          }).join('')}</div>
        </a>`;
      } else {
        // Pas de course : compte à rebours jusqu'à la prochaine
        const p = prochaineCourse(cal);
        zone.innerHTML = p ? `<a class="bandeau-tv" href="#courses">
          <span class="tv-etiquette style-course">Prochaine course</span>
          <div class="tv-corps tv-attente">
            <div class="compte-a-rebours style-course">J-${nbJours(aujourdhui(), p.debut)}</div>
            <div>
              <div class="tv-course style-course">${echapper(p.nom)}</div>
              <div class="tv-chaine">${texteDates(p)}</div>
            </div>
          </div>
        </a>` : '';
      }
    } catch {
      zone.innerHTML = '';
    }
  }

  // --- Pastille « bon jour pour rouler ? » (seulement sur l'onglet Actus) ---
  async function pastilleMeteo() {
    const zone = $('.zone-meteo');
    if (!zone) return;
    try {
      const meteo = await import('./meteo.js');
      zone.innerHTML = await meteo.pastilleHTML();
    } catch {
      zone.innerHTML = '';
    }
  }

  // --- Réactions aux gestes ---
  $('.recherche').addEventListener('input', () => { etat.nombre = PAR_PAGE; afficher(); });
  $('.choix-source').addEventListener('change', () => { etat.nombre = PAR_PAGE; afficher(); });
  $('.voir-favoris').addEventListener('click', (e) => {
    etat.favoris = !etat.favoris;
    e.currentTarget.setAttribute('aria-pressed', etat.favoris);
    etat.nombre = PAR_PAGE;
    afficher();
  });
  $('.voir-plus').addEventListener('click', () => { etat.nombre += PAR_PAGE; afficher(); });
  $('.liste').addEventListener('click', (e) => {
    const bouton = e.target.closest('.etoile');
    if (!bouton) return;
    const article = { ...etat.affiches[bouton.dataset.i], fil };
    const ajoute = basculerArticle(article);
    bouton.setAttribute('aria-pressed', ajoute);
    bouton.textContent = ajoute ? '★' : '☆';
    if (etat.favoris && !ajoute) afficher();   // retiré de la vue Favoris
  });
  // Image introuvable : on essaie l'image d'origine, sinon on l'enlève
  section.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.original && img.src !== img.dataset.original) {
      img.removeAttribute('crossorigin');   // l'image d'origine n'autorise pas toujours CORS
      img.src = img.dataset.original;
    }
    else img.remove();
  }, true);

  charger();
  bandeau();
  pastilleMeteo();

  return {
    // appelé à chaque retour sur l'onglet (le jour ou les favoris ont pu changer)
    afficher() { bandeau(); pastilleMeteo(); if (etat.favoris) afficher(); },
    // appelé quand l'app revient au premier plan après un long moment
    rafraichir() { charger(); chargerCalendrier(true).then(bandeau, () => {}); },
  };
}
