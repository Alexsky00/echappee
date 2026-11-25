// Petits outils partagés par tous les onglets.

/** Télécharge un fichier JSON du site (le service worker fournit la copie hors connexion). */
export async function chargerJSON(chemin) {
  const reponse = await fetch(chemin, { cache: 'no-cache' });
  if (!reponse.ok) throw new Error(`${chemin} : erreur ${reponse.status}`);
  return reponse.json();
}

/** Protège un texte avant de l'insérer dans la page (évite les caractères qui cassent le HTML). */
export function echapper(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Texte sans accents ni majuscules, pour que « etape » trouve « Étape ». */
export function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** La date du jour au format 2027-04-11 (heure de l'iPhone, pas l'heure anglaise). */
export function aujourdhui(decalageJours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + decalageJours);
  return isoLocal(d);
}

export function isoLocal(d) {
  const deux = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/** Transforme "2027-04-11" en objet Date, à minuit heure locale. */
export function dateLocale(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}

/** « il y a 5 min », « il y a 3 h », « hier », « 12 nov. » */
export function dateRelative(iso) {
  const d = new Date(iso);
  const minutes = (Date.now() - d.getTime()) / 60000;
  if (minutes < 60) return `il y a ${Math.max(1, Math.round(minutes))} min`;
  if (isoLocal(d) === aujourdhui()) return `il y a ${Math.round(minutes / 60)} h`;
  if (isoLocal(d) === aujourdhui(-1)) return 'hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
