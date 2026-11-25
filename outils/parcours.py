"""
Parcours d'Échappée (utilisé par robot.py, pas besoin de le lancer seul).

  - fabriquer_parcours_demandes : crée les GPX demandés dans parcours/demandes.json
    (villages → coordonnées avec OpenStreetMap/Nominatim, tracé avec BRouter) ;
  - analyser_parcours : lit chaque GPX du dossier parcours/ et calcule distance,
    dénivelé, difficulté, cols traversés et profil → parcours/index.json.

Tous les services utilisés sont gratuits et sans clé.
"""

import hashlib
import html
import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from xml.etree import ElementTree

# Zone de recherche des villages : Haute-Saône, Vosges du Sud, Territoire de Belfort
ZONE_RECHERCHE = "5.3,48.3,7.3,47.2"
_lieux_connus = {}


# ---------------------------------------------------------------------------
# Lecture des GPX
# ---------------------------------------------------------------------------

def balise(e):
    """Nom d'une balise XML sans son espace de noms ({http://...}trkpt → trkpt)."""
    return e.tag.rsplit("}", 1)[-1]


def lire_points_gpx(racine):
    """Tous les points du tracé (trkpt, ou rtept pour les « routes »), avec altitude si présente."""
    points = []
    for nom in ("trkpt", "rtept"):
        for e in racine.iter():
            if balise(e) == nom:
                alt = next((float(c.text) for c in e if balise(c) == "ele" and c.text), None)
                points.append((float(e.get("lat")), float(e.get("lon")), alt))
        if points:
            break
    return points


def distance_m(a, b):
    """Distance en mètres entre deux points (lat, lon)."""
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------------------
# Fabrication des parcours demandés
# ---------------------------------------------------------------------------

def localiser(passage, centre):
    """Renvoie (lat, lon) d'un passage : coordonnées « 47.8, 6.5 » ou nom de lieu.
    Quand plusieurs lieux portent le même nom, on prend le plus proche du centre (Vesoul)."""
    coord = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*", passage)
    if coord:
        return float(coord.group(1)), float(coord.group(2))
    if passage not in _lieux_connus:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
            "q": passage, "format": "jsonv2", "limit": 8, "countrycodes": "fr",
            "viewbox": ZONE_RECHERCHE, "bounded": 1})
        req = urllib.request.Request(url, headers={"User-Agent": "Echappee-PWA/1.0"})
        reponses = json.loads(urllib.request.urlopen(req, timeout=20).read())
        time.sleep(1.1)     # règle d'OpenStreetMap : une recherche par seconde maximum
        lieux = [(float(r["lat"]), float(r["lon"])) for r in reponses]
        _lieux_connus[passage] = min(lieux, key=lambda l: distance_m(l, centre)) if lieux else None
    return _lieux_connus[passage]


def tracer_brouter(robot, points):
    """Demande à BRouter un tracé vélo de route passant par les points. Renvoie [(lat, lon, alt)]."""
    lonlats = "|".join(f"{lon:.5f},{lat:.5f}" for lat, lon in points)
    for profil in ("fastbike-lowtraffic", "fastbike"):
        url = f"https://brouter.de/brouter?lonlats={lonlats}&profile={profil}&alternativeidx=0&format=gpx"
        try:
            trace = lire_points_gpx(ElementTree.fromstring(robot.telecharger(url, delai=120)))
            if trace:
                return trace
        except Exception as e:
            print(f"    (BRouter, profil {profil} : {e})")
    return None


def ecrire_gpx(chemin, nom, description, zone, trace):
    """Écrit un fichier GPX propre et lisible."""
    def x(t):
        return html.escape(t or "", quote=True)
    pts = "\n".join(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}">'
                    + (f"<ele>{alt:.1f}</ele>" if alt is not None else "") + "</trkpt>"
                    for lat, lon, alt in trace)
    chemin.write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Echappee" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>{x(nom)}</name>
    <desc>{x(description)}</desc>
    <keywords>{x(zone)}</keywords>
  </metadata>
  <trk>
    <name>{x(nom)}</name>
    <trkseg>
{pts}
    </trkseg>
  </trk>
</gpx>
""", encoding="utf-8")


def fabriquer_parcours_demandes(robot):
    dossier = robot.RACINE / "parcours"
    if not (dossier / "demandes.json").exists():
        return
    demandes = robot.lire_json(dossier / "demandes.json")
    reglages = robot.lire_json(robot.DONNEES / "reglages.json") or {}
    ville = reglages.get("ville", {"lat": 47.6227, "lon": 6.1556})
    centre = (ville["lat"], ville["lon"])
    if not demandes:
        return
    for d in demandes.get("parcours", []):
        fichier = d.get("fichier", "")
        if not re.fullmatch(r"[a-z0-9-]+", fichier):
            robot.erreurs.append(f"demandes.json : « fichier » doit être en minuscules, sans accent ni espace "
                                 f"(ex. boucle-de-lure) : « {fichier} ».")
            continue
        chemin = dossier / f"{fichier}.gpx"
        if chemin.exists():
            continue
        # Déjà fabriqué lors d'un passage précédent du robot ? On le reprend sur le site.
        if robot.ANCIEN_SITE:
            try:
                chemin.write_bytes(robot.telecharger(f"{robot.ANCIEN_SITE}/parcours/{fichier}.gpx"))
                print(f"  ↺ {fichier}.gpx repris du site")
                continue
            except Exception:
                pass
        print(f"  ✎ Fabrication de « {d.get('nom', fichier)} »…")
        points = []
        for passage in d.get("passages", []):
            p = localiser(passage, centre)
            if p:
                print(f"      {passage} → {p[0]:.5f}, {p[1]:.5f}")
            else:
                robot.erreurs.append(f"demandes.json ({fichier}) : lieu « {passage} » introuvable. "
                                     "Vérifie l'orthographe ou mets des coordonnées.")
            points.append(p)
        if None in points or len(points) < 2:
            continue
        trace = tracer_brouter(robot, points)
        if not trace:
            print(f"  ⚠ {fichier} : BRouter n'a pas répondu, nouvel essai au prochain passage du robot")
            continue
        ecrire_gpx(chemin, d.get("nom", fichier), d.get("description", ""), d.get("zone", ""), trace)
        print(f"  ✓ {fichier}.gpx créé ({len(trace)} points)")


# ---------------------------------------------------------------------------
# Analyse des GPX
# ---------------------------------------------------------------------------

def altitudes_open_meteo(robot, points):
    """Altitudes manquantes : demandées à Open-Meteo (gratuit, sans clé), 100 points à la fois."""
    alts = []
    for i in range(0, len(points), 100):
        lot = points[i:i + 100]
        url = ("https://api.open-meteo.com/v1/elevation?latitude=" + ",".join(f"{p[0]:.5f}" for p in lot)
               + "&longitude=" + ",".join(f"{p[1]:.5f}" for p in lot))
        alts += json.loads(robot.telecharger(url))["elevation"]
    return alts


def difficulte(km, denivele):
    """Note d'effort simple : 1 km = 1 point, et 100 m de dénivelé = 1 point de plus."""
    effort = km + denivele / 100
    if effort < 80:
        return "facile"
    if effort < 140:
        return "moyen"
    return "difficile"


def denivele_positif(alts):
    """Altitudes lissées, et on ignore les variations de moins de 4 m (bruit du GPS)."""
    lisse = []
    for i in range(len(alts)):
        fenetre = alts[max(0, i - 2):i + 3]
        lisse.append(sum(fenetre) / len(fenetre))
    total, reference = 0.0, lisse[0]
    for a in lisse[1:]:
        if a - reference >= 4:
            total += a - reference
            reference = a
        elif a < reference:
            reference = a
    return total


def analyser_gpx(robot, chemin, reperes, rayons):
    racine = ElementTree.parse(chemin).getroot()
    points = lire_points_gpx(racine)
    if len(points) < 2:
        raise ValueError("aucun tracé trouvé dans le fichier")

    def texte(nom, defaut=""):
        for e in racine.iter():           # le premier trouvé (dans <metadata> ou <trk>)
            if balise(e) == nom and e.text and e.text.strip():
                return e.text.strip()
        return defaut

    # Distance cumulée (en mètres) à chaque point
    cumul = [0.0]
    for a, b in zip(points, points[1:]):
        cumul.append(cumul[-1] + distance_m(a, b))
    total = cumul[-1]

    # Profil : 200 intervalles réguliers
    n, echantillon, j = 200, [], 0
    for k in range(n + 1):
        cible = total * k / n
        while j < len(cumul) - 1 and cumul[j + 1] < cible:
            j += 1
        echantillon.append((cible, points[j]))

    alts_profil = [p[2] for _, p in echantillon]
    alts_tous = [p[2] for p in points]
    if any(a is None for a in alts_tous):
        print("    (altitudes absentes du GPX : demandées à Open-Meteo)")
        alts_profil = altitudes_open_meteo(robot, [p for _, p in echantillon])
        alts_tous = alts_profil
    denivele = denivele_positif(alts_tous)

    # Cols et lieux à proximité du tracé, dans l'ordre du parcours
    pas = max(1, len(points) // 3000)     # inutile de tester chaque point
    indices = range(0, len(points), pas)

    def plus_proche(lat, lon):
        i = min(indices, key=lambda i: distance_m(points[i], (lat, lon)))
        return i, distance_m(points[i], (lat, lon))

    trouves = []
    for r in reperes:
        i, d = plus_proche(r["lat"], r["lon"])
        if d <= rayons.get(r["type"], 500):
            trouves.append({"nom": r["nom"], "type": r["type"], "alt": r.get("alt"), "km": round(cumul[i] / 1000, 1)})
    # Points d'intérêt ajoutés dans le GPX lui-même (balises <wpt>)
    for e in racine.iter():
        if balise(e) == "wpt":
            nom = next((c.text for c in e if balise(c) == "name" and c.text), None)
            if nom:
                i, _ = plus_proche(float(e.get("lat")), float(e.get("lon")))
                trouves.append({"nom": nom.strip(), "type": "lieu", "alt": None, "km": round(cumul[i] / 1000, 1)})
    trouves.sort(key=lambda t: t["km"])

    km = total / 1000
    return {
        "id": chemin.stem,
        "fichier": f"parcours/{chemin.name}",
        "nom": texte("name", chemin.stem.replace("-", " ").capitalize()),
        "description": texte("desc"),
        "zone": texte("keywords"),
        "distance": round(km, 1),
        "denivele": int(round(denivele, -1)),
        "alt_max": int(max(alts_profil)),
        "difficulte": difficulte(km, denivele),
        "reperes": trouves,
        "profil": [[round(d / 1000, 2), int(round(a))] for (d, _), a in zip(echantillon, alts_profil)],
        "depart": [round(points[0][0], 5), round(points[0][1], 5)],
    }


def analyser_parcours(robot):
    dossier = robot.RACINE / "parcours"
    reperes = robot.lire_json(robot.DONNEES / "cols.json")
    if reperes is None:
        return
    # Analyses précédentes : réutilisées si ni le GPX ni cols.json n'ont changé (plus rapide)
    anciens = {}
    if robot.ANCIEN_SITE:
        try:
            anciens = {p["empreinte"]: p for p in
                       json.loads(robot.telecharger(f"{robot.ANCIEN_SITE}/parcours/index.json"))["parcours"]}
        except Exception:
            pass
    resultat = []
    for chemin in sorted(dossier.glob("*.gpx")):
        empreinte = hashlib.sha1(chemin.read_bytes() + json.dumps(reperes).encode()).hexdigest()[:16]
        if empreinte in anciens:
            resultat.append(anciens[empreinte])
            continue
        try:
            infos = analyser_gpx(robot, chemin, reperes["points"], reperes.get("rayon_m", {}))
        except Exception as e:
            robot.erreurs.append(f"parcours/{chemin.name} est illisible ({e}). Vérifie que c'est bien un fichier GPX.")
            continue
        infos["empreinte"] = empreinte
        resultat.append(infos)
        print(f"  ✓ {chemin.name} : {infos['distance']} km, {infos['denivele']} m D+, {infos['difficulte']} — "
              f"{', '.join(r['nom'] for r in infos['reperes']) or 'aucun repère'}")
    resultat.sort(key=lambda p: p["distance"])
    robot.ecrire_json(dossier / "index.json", {
        "genere_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "parcours": resultat,
    })
    print(f"  → {len(resultat)} parcours analysés")
