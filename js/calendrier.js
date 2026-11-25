// Lecture du calendrier des courses (donnees/calendrier.json),
// utilisé par l'onglet Courses et par le bandeau « Aujourd'hui à la TV ».

import { chargerJSON, echapper, dateLocale, aujourdhui } from './outils.js';
import { estCourseFavorite } from './favoris.js';

let promesse = null;

/** Charge le calendrier une seule fois (ou à nouveau si recharger = true). */
export function chargerCalendrier(recharger = false) {
  if (!promesse || recharger) {
    promesse = chargerJSON('donnees/calendrier.json').catch((e) => { promesse = null; throw e; });
  }
  return promesse;
}

/** Vrai si la course a lieu ce jour-là (jour au format 2027-04-11). */
export function aLieuLe(course, jour) {
  return course.debut <= jour && jour <= course.fin;
}

/** Les courses du jour, favorites en premier. */
export function coursesDuJour(cal, jour = aujourdhui()) {
  return cal.courses
    .filter((c) => aLieuLe(c, jour))
    .sort((a, b) => estCourseFavorite(b.id) - estCourseFavorite(a.id));
}

/** La prochaine course qui n'a pas encore commencé. */
export function prochaineCourse(cal, jour = aujourdhui()) {
  return cal.courses.filter((c) => c.debut > jour).sort((a, b) => a.debut.localeCompare(b.debut))[0];
}

/** « France 2 / France 3 gratuit · Eurosport (HBO Max) » en HTML. */
export function diffuseursHTML(cal, course) {
  return course.diffuseurs.map((code) => {
    const d = cal.diffuseurs[code];
    if (!d) return echapper(code);
    return echapper(d.nom) + (d.gratuit ? ' <span class="gratuit">gratuit</span>' : '');
  }).join(' · ');
}

/** « dim. 11 avril » ou « du ven. 2 au dim. 25 juillet » */
export function texteDates(course) {
  const options = { weekday: 'short', day: 'numeric', month: 'long' };
  const debut = dateLocale(course.debut).toLocaleDateString('fr-FR', options);
  if (course.debut === course.fin) return debut;
  const fin = dateLocale(course.fin).toLocaleDateString('fr-FR', options);
  return `du ${debut} au ${fin}`;
}

/** Nombre de jours entre deux dates (format 2027-04-11). */
export function nbJours(du, au) {
  return Math.round((dateLocale(au) - dateLocale(du)) / 86400000);
}

/** Drapeau emoji à partir du code pays (FR → 🇫🇷). */
export function drapeau(codePays) {
  return codePays.toUpperCase().replace(/./g, (l) => String.fromCodePoint(127397 + l.charCodeAt(0)));
}

const nomsPays = new Intl.DisplayNames(['fr'], { type: 'region' });
export function nomPays(codePays) {
  try { return nomsPays.of(codePays); } catch { return codePays; }
}
