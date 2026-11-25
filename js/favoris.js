// Favoris (articles et courses), rangés dans la mémoire de l'iPhone (localStorage).
// Pas de compte : tout reste sur le téléphone.

const CLE = 'echappee-favoris';

function lire() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE));
    return { articles: d?.articles ?? {}, courses: d?.courses ?? [] };
  } catch {
    return { articles: {}, courses: [] };
  }
}

function ecrire(d) {
  localStorage.setItem(CLE, JSON.stringify(d));
}

// --- Articles : on garde l'article entier, pour qu'il reste même quand il sort du fil ---

export function estArticleFavori(lien) {
  return lien in lire().articles;
}

/** Ajoute ou retire un article. Renvoie true s'il est maintenant en favori. */
export function basculerArticle(article) {
  const d = lire();
  const ajoute = !(article.lien in d.articles);
  if (ajoute) d.articles[article.lien] = article;
  else delete d.articles[article.lien];
  ecrire(d);
  return ajoute;
}

/** Les articles favoris d'un fil (« pro » ou « materiel »), du plus récent au plus ancien. */
export function articlesFavoris(fil) {
  return Object.values(lire().articles)
    .filter((a) => a.fil === fil)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// --- Courses : on garde seulement leur identifiant ---

export function estCourseFavorite(id) {
  return lire().courses.includes(id);
}

export function basculerCourse(id) {
  const d = lire();
  const ajoute = !d.courses.includes(id);
  d.courses = ajoute ? [...d.courses, id] : d.courses.filter((x) => x !== id);
  ecrire(d);
  return ajoute;
}
