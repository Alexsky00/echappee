"""
Robot d'Échappée — lancé automatiquement par GitHub toutes les heures
(et à chaque fois que tu publies une modification).

Il fait cinq choses :
  1. il VÉRIFIE les fichiers de données (calendrier.json, sources.json…) :
     s'il y a une erreur, il s'arrête et GitHub t'envoie un e-mail,
     l'ancienne version de l'app reste en ligne (rien n'est cassé) ;
  2. il LIT les flux RSS et les rassemble dans
     donnees/actus-pro.json et donnees/actus-materiel.json ;
  3. il CRÉE un fichier calendrier (.ics) par course, dans le dossier ics/,
     pour le bouton « Ajouter à mon calendrier » ;
  4. il FABRIQUE les parcours demandés dans parcours/demandes.json
     (tracé sur de vraies routes grâce au service gratuit BRouter) ;
  5. il ANALYSE tous les fichiers GPX du dossier parcours/ (distance,
     dénivelé, difficulté, cols, profil) et écrit parcours/index.json.
     (Ces deux dernières parties sont dans outils/parcours.py.)

Tu n'as normalement jamais besoin de modifier ce fichier.

Pour le lancer sur ton ordinateur :  python outils/robot.py
(il faut avoir installé feedparser une fois :  pip install feedparser)
"""

import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import feedparser

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "donnees"

# Adresse du site en ligne : sert à récupérer les anciens articles
# (si un site d'actus est en panne une heure, ses articles ne disparaissent pas).
# GitHub la fournit automatiquement ; vide = on part de zéro.
ANCIEN_SITE = os.environ.get("ANCIEN_SITE", "").rstrip("/")

NAVIGATEUR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
MAX_ARTICLES = 120        # par fil (pro / matériel)
MAX_JOURS = 21            # on oublie les articles plus vieux que ça
MAX_PAR_SOURCE = 25       # pour qu'un site très bavard n'écrase pas les autres

erreurs = []              # erreurs bloquantes (données mal remplies)


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------

def lire_json(chemin):
    """Lit un fichier JSON et explique clairement l'erreur s'il est mal écrit."""
    try:
        return json.loads(Path(chemin).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        erreurs.append(f"{Path(chemin).name} est mal écrit, ligne {e.lineno} : {e.msg}. "
                       "(Souvent : une virgule en trop ou oubliée, ou un guillemet manquant.)")
        return None


def ecrire_json(chemin, donnees):
    Path(chemin).write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def telecharger(url, delai=20):
    req = urllib.request.Request(url, headers={"User-Agent": NAVIGATEUR})
    with urllib.request.urlopen(req, timeout=delai) as r:
        return r.read()


def texte_propre(s, longueur=None):
    """Enlève les balises HTML et les codes du type &amp;."""
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(html.unescape(s))          # certains flux encodent deux fois
    s = re.sub(r"\s+", " ", s).strip()
    if longueur and len(s) > longueur:
        s = s[:longueur].rsplit(" ", 1)[0] + "…"
    return s


# ---------------------------------------------------------------------------
# 1. Vérification des données
# ---------------------------------------------------------------------------

CATEGORIES = {"Grand Tour", "Monument", "WorldTour", "Classique", "Championnat"}
TYPES = {"une journée", "à étapes", "plusieurs épreuves"}
GENRES = {"H", "F", "mixte"}


def verifier_calendrier(cal):
    if cal is None:
        return
    diffuseurs = cal.get("diffuseurs", {})
    ids = set()
    for n, c in enumerate(cal.get("courses", []), start=1):
        nom = c.get("nom", f"course n°{n}")
        for champ in ("id", "nom", "genre", "debut", "fin", "pays", "categorie", "type", "diffuseurs"):
            if champ not in c:
                erreurs.append(f"calendrier.json : il manque « {champ} » pour {nom}.")
        if c.get("id") in ids:
            erreurs.append(f"calendrier.json : l'id « {c.get('id')} » est utilisé deux fois.")
        ids.add(c.get("id"))
        for champ in ("debut", "fin"):
            try:
                date.fromisoformat(c.get(champ, ""))
            except ValueError:
                erreurs.append(f"calendrier.json : date « {c.get(champ)} » invalide pour {nom} (format attendu : 2027-04-11).")
        if c.get("debut", "") > c.get("fin", ""):
            erreurs.append(f"calendrier.json : pour {nom}, la date de fin est avant la date de début.")
        if c.get("categorie") not in CATEGORIES:
            erreurs.append(f"calendrier.json : catégorie « {c.get('categorie')} » inconnue pour {nom}. Possibles : {', '.join(sorted(CATEGORIES))}.")
        if c.get("type") not in TYPES:
            erreurs.append(f"calendrier.json : type « {c.get('type')} » inconnu pour {nom}. Possibles : {', '.join(sorted(TYPES))}.")
        if c.get("genre") not in GENRES:
            erreurs.append(f"calendrier.json : genre « {c.get('genre')} » inconnu pour {nom}. Possibles : H, F, mixte.")
        for d in c.get("diffuseurs", []):
            if d not in diffuseurs:
                erreurs.append(f"calendrier.json : diffuseur « {d} » (pour {nom}) absent de la liste \"diffuseurs\".")


def verifier_sources(sources):
    if sources is None:
        return
    for fil in ("pro", "materiel"):
        if fil not in sources:
            erreurs.append(f"sources.json : il manque la liste « {fil} ».")
        for s in sources.get(fil, []):
            if not s.get("nom") or not s.get("rss", "").startswith("http"):
                erreurs.append(f"sources.json : une source de « {fil} » n'a pas de nom ou d'adresse rss valide : {s}")


# ---------------------------------------------------------------------------
# 2. Flux RSS
# ---------------------------------------------------------------------------

def trouver_image(e):
    """Cherche l'image d'un article, où qu'elle soit rangée dans le flux."""
    for m in e.get("media_content", []) + e.get("media_thumbnail", []):
        if m.get("url") and m.get("medium", "image") == "image" and "video" not in m.get("type", ""):
            return m["url"]
    for lien in e.get("links", []):
        if lien.get("rel") == "enclosure" and lien.get("type", "").startswith("image"):
            return lien.get("href")
    contenu = " ".join([e.get("summary", "")] + [c.get("value", "") for c in e.get("content", [])])
    trouve = re.search(r"<img[^>]+src=[\"']([^\"']+)", contenu)
    return trouve.group(1) if trouve else None


def lire_flux(source):
    """Télécharge un flux et renvoie la liste de ses articles (vide en cas de panne)."""
    try:
        flux = feedparser.parse(telecharger(source["rss"]))
    except Exception as e:
        print(f"  ⚠ {source['nom']} : injoignable ({e})")
        return None
    mots = [m.lower() for m in source.get("mots_cles", [])]
    articles = []
    for e in flux.entries:
        titre = texte_propre(e.get("title"))
        lien = e.get("link")
        if not titre or not lien or "$content" in titre:
            continue
        if mots and not any(re.search(r"\b" + re.escape(m) + r"\b", titre.lower()) for m in mots):
            continue
        quand = e.get("published_parsed") or e.get("updated_parsed")
        quand = datetime(*quand[:6], tzinfo=timezone.utc) if quand else datetime.now(timezone.utc)
        articles.append({
            "titre": titre,
            "lien": lien,
            "source": source["nom"],
            "date": quand.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "image": trouver_image(e),
            "resume": texte_propre(e.get("summary"), 180),
        })
    print(f"  ✓ {source['nom']} : {len(articles)} articles")
    return articles


def mettre_a_jour_fil(fil, sources):
    print(f"Fil « {fil} » :")
    actives = [s for s in sources.get(fil, []) if s.get("actif", True)]
    noms_actifs = {s["nom"] for s in actives}

    # Anciens articles (du site en ligne), gardés pour les sources en panne
    anciens = []
    if ANCIEN_SITE:
        try:
            anciens = json.loads(telecharger(f"{ANCIEN_SITE}/donnees/actus-{fil}.json")).get("articles", [])
        except Exception:
            print("  (pas d'anciens articles récupérés)")

    tous = []
    for s in actives:
        nouveaux = lire_flux(s)
        if nouveaux is None:   # source en panne : on garde ses anciens articles
            nouveaux = [a for a in anciens if a["source"] == s["nom"]]
        tous += nouveaux
    tous += [a for a in anciens if a["source"] in noms_actifs]

    # Sans doublon, du plus récent au plus ancien, pas trop vieux
    limite = (datetime.now(timezone.utc) - timedelta(days=MAX_JOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    vus, par_source, resultat = set(), {}, []
    for a in sorted(tous, key=lambda a: a["date"], reverse=True):
        if a["lien"] in vus or a["date"] < limite or par_source.get(a["source"], 0) >= MAX_PAR_SOURCE:
            continue
        vus.add(a["lien"])
        par_source[a["source"]] = par_source.get(a["source"], 0) + 1
        resultat.append(a)
    resultat = resultat[:MAX_ARTICLES]

    ecrire_json(DONNEES / f"actus-{fil}.json", {
        "genere_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": sorted(noms_actifs),
        "articles": resultat,
    })
    print(f"  → {len(resultat)} articles enregistrés")


# ---------------------------------------------------------------------------
# 3. Fichiers calendrier (.ics) pour « Ajouter à mon calendrier »
# ---------------------------------------------------------------------------

def ics_texte(s):
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_plier(ligne):
    """Les lignes .ics ne doivent pas dépasser 75 octets : on les coupe proprement."""
    morceaux, courant = [], ""
    for car in ligne:
        if len((courant + car).encode("utf-8")) > 73:
            morceaux.append(courant)
            courant = " "
        courant += car
    return "\r\n".join(morceaux + [courant])


def creer_ics(cal):
    dossier = RACINE / "ics"
    dossier.mkdir(exist_ok=True)
    for f in dossier.glob("*.ics"):
        f.unlink()
    maintenant = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for c in cal["courses"]:
        debut = date.fromisoformat(c["debut"])
        fin = date.fromisoformat(c["fin"]) + timedelta(days=1)    # .ics : fin exclue
        tele = ", ".join(cal["diffuseurs"][d]["nom"] + (" (gratuit)" if cal["diffuseurs"][d].get("gratuit") else "")
                         for d in c["diffuseurs"])
        description = f"{c['categorie']} · {c['type']}\nÀ la TV : {tele}"
        if c.get("a_verifier"):
            description += "\n(à confirmer : " + ", ".join(c["a_verifier"]) + ")"
        lignes = [
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Echappee//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:{c['id']}-{cal['saison']}@echappee",
            f"DTSTAMP:{maintenant}",
            f"DTSTART;VALUE=DATE:{debut:%Y%m%d}",
            f"DTEND;VALUE=DATE:{fin:%Y%m%d}",
            f"SUMMARY:{ics_texte('🚴 ' + c['nom'])}",
            f"DESCRIPTION:{ics_texte(description)}",
            "BEGIN:VALARM", "ACTION:DISPLAY",
            f"DESCRIPTION:{ics_texte(c['nom'] + ' aujourd’hui – ' + tele)}",
            "TRIGGER:PT9H",          # le jour même à 9 h
            "END:VALARM",
            "END:VEVENT", "END:VCALENDAR",
        ]
        (dossier / f"{c['id']}.ics").write_bytes(("\r\n".join(ics_plier(l) for l in lignes) + "\r\n").encode("utf-8"))
    print(f"Calendrier : {len(cal['courses'])} fichiers .ics créés")


# ---------------------------------------------------------------------------

import parcours  # noqa: E402  (fichier outils/parcours.py, qui utilise les outils ci-dessus)


def main():
    cal = lire_json(DONNEES / "calendrier.json")
    sources = lire_json(DONNEES / "sources.json")
    lire_json(DONNEES / "reglages.json")
    verifier_calendrier(cal)
    verifier_sources(sources)

    print("Parcours :")
    robot = sys.modules[__name__]     # on prête nos outils (lire_json, erreurs…) à parcours.py
    parcours.fabriquer_parcours_demandes(robot)
    parcours.analyser_parcours(robot)

    if erreurs:
        print("\n❌ ERREURS À CORRIGER (l'app n'a pas été mise à jour) :")
        for e in erreurs:
            print("   •", e)
        sys.exit(1)
    print("✓ Données vérifiées\n")

    creer_ics(cal)
    for fil in ("pro", "materiel"):
        mettre_a_jour_fil(fil, sources)


if __name__ == "__main__":
    main()
