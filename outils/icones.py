"""
Fabrique les icônes et l'écran de démarrage d'Échappée (dossier icones/).
À relancer seulement si on veut changer le dessin :  python outils/icones.py
(il faut Pillow :  pip install pillow)

Le logo : un « É » penché. Le E (trois barres) = le peloton ;
l'accent qui part devant en biais, avec ses traits de vitesse = l'échappée.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

JAUNE, NUIT, ROSE = (255, 209, 0), (11, 21, 48), (255, 46, 136)
VERT, BLANC = (0, 184, 107), (244, 246, 250)
RACINE = Path(__file__).resolve().parent.parent
DOSSIER = RACINE / "icones"
DOSSIER.mkdir(exist_ok=True)

PENTE = math.tan(math.radians(12))     # inclinaison du logo (comme un coureur en danseuse)


def dessin(taille, echelle=1.0):
    """Le logo sur fond jaune (carré : iOS arrondit les coins lui-même).
    echelle < 1 = marge autour (icône « maskable » pour Android)."""
    G = 4 * taille                         # on dessine en grand puis on réduit (bords lisses)
    img = Image.new("RGB", (G, G), JAUNE)
    d = ImageDraw.Draw(img)
    u = G / 120 * echelle                  # le dessin est pensé sur une grille de 120
    o = G / 2 - 60 * u                     # décalage pour centrer quand echelle < 1

    def P(x, y):
        """Point de la grille 120 → pixels, avec l'inclinaison et le recentrage."""
        return (o + (x + 18 - PENTE * y) * u, o + y * u)

    def rect(x, y, w, h, couleur, angle=0, centre=None):
        coins = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        if angle:
            cx, cy = centre
            a = math.radians(angle)
            coins = [(cx + (px - cx) * math.cos(a) - (py - cy) * math.sin(a),
                      cy + (px - cx) * math.sin(a) + (py - cy) * math.cos(a)) for px, py in coins]
        d.polygon([P(px, py) for px, py in coins], fill=couleur)

    # Le E : une barre verticale et trois barres horizontales
    rect(30, 44, 14, 52, NUIT)
    rect(30, 44, 50, 12, NUIT)
    rect(30, 64, 38, 12, NUIT)
    rect(30, 84, 50, 12, NUIT)
    # L'accent qui s'échappe, et ses traits de vitesse (plus pâles)
    pale = tuple(int(c * .7 + j * .3) for c, j in zip(ROSE, JAUNE))
    tres_pale = tuple(int(c * .45 + j * .55) for c, j in zip(ROSE, JAUNE))
    rect(52, 22, 34, 11, ROSE, -18, (67, 27))
    rect(34, 22, 12, 4, pale, -18, (67, 27))
    rect(38, 29, 8, 4, tres_pale, -18, (67, 27))
    return img.resize((taille, taille), Image.LANCZOS)


dessin(180).save(DOSSIER / "apple-touch-icon.png")
dessin(192).save(DOSSIER / "icone-192.png")
dessin(512, echelle=0.82).save(DOSSIER / "icone-512.png")      # marge de sécurité pour Android
dessin(32).save(DOSSIER / "favicon-32.png")

# Écran de démarrage de l'iPhone XR (828 × 1792 pixels)
L, H = 828, 1792
ecran = Image.new("RGB", (L, H), NUIT)
icone = dessin(300)
masque = Image.new("L", (300, 300), 0)
ImageDraw.Draw(masque).rounded_rectangle([0, 0, 299, 299], radius=66, fill=255)
ecran.paste(icone, ((L - 300) // 2, 600), masque)
d = ImageDraw.Draw(ecran)
police_fichier = RACINE / "outils" / "BarlowCondensed-BlackItalic.ttf"
try:
    police = ImageFont.truetype(str(police_fichier), 150)
except OSError:
    police = ImageFont.truetype("C:/Windows/Fonts/arialbi.ttf", 100)
texte = "ÉCHAPPÉE"
largeur = d.textlength(texte, font=police)
d.text(((L - largeur) / 2, 950), texte, font=police, fill=BLANC)
# bande des 4 maillots tout en bas
for i, c in enumerate((JAUNE, VERT, ROSE, BLANC)):
    d.rectangle([i * L / 4, H - 28, (i + 1) * L / 4, H], fill=c)
ecran.save(DOSSIER / "demarrage-828x1792.png", optimize=True)
print("Icônes créées dans", DOSSIER)
