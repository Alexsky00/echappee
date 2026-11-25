"""
Fabrique les icônes et l'écran de démarrage d'Échappée (dossier icones/).
À relancer seulement si on veut changer le dessin :  python outils/icones.py
(il faut Pillow :  pip install pillow)
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

JAUNE, NUIT = (255, 209, 0), (19, 35, 63)
VERT, ROUGE, BLANC = (0, 166, 81), (227, 6, 19), (255, 255, 255)
DOSSIER = Path(__file__).resolve().parent.parent / "icones"
DOSSIER.mkdir(exist_ok=True)


def dessin(taille, echelle=1.0):
    """Roue de vélo + traits de vitesse sur fond jaune. echelle < 1 = marge (icône « maskable »)."""
    G = 4 * taille                                   # on dessine en grand puis on réduit (bords lisses)
    img = Image.new("RGB", (G, G), JAUNE)
    d = ImageDraw.Draw(img)
    u = G / 1024 * echelle
    c = G / 2
    cx, cy, r = c + 90 * u, c, 300 * u
    # traits de vitesse (l'échappée !)
    for dy, x0 in ((-130, -430), (0, -470), (130, -400)):
        y = cy + dy * u
        d.rounded_rectangle([c + x0 * u, y - 22 * u, c - 250 * u, y + 22 * u], radius=22 * u, fill=NUIT)
    # rayons
    for k in range(16):
        a = 2 * math.pi * k / 16
        d.line([(cx, cy), (cx + r * math.cos(a), cy + r * math.sin(a))], fill=NUIT, width=int(12 * u))
    # jante et pneu
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=NUIT, width=int(62 * u))
    d.ellipse([cx - r + 74 * u, cy - r + 74 * u, cx + r - 74 * u, cy + r - 74 * u], outline=NUIT, width=int(10 * u))
    # moyeu
    d.ellipse([cx - 58 * u, cy - 58 * u, cx + 58 * u, cy + 58 * u], fill=NUIT)
    d.ellipse([cx - 22 * u, cy - 22 * u, cx + 22 * u, cy + 22 * u], fill=JAUNE)
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
ecran.paste(icone, ((L - 300) // 2, 640), masque)
d = ImageDraw.Draw(ecran)
try:
    police = ImageFont.truetype("C:/Windows/Fonts/arialbi.ttf", 92)
except OSError:
    police = ImageFont.truetype("DejaVuSans-BoldOblique.ttf", 92)
texte = "ÉCHAPPÉE"
largeur = d.textlength(texte, font=police)
d.text(((L - largeur) / 2, 990), texte, font=police, fill=JAUNE)
# bande des maillots sous le nom
x0, y0, w = (L - 420) // 2, 1115, 420
d.rectangle([x0, y0, x0 + w * .4, y0 + 12], fill=JAUNE)
d.rectangle([x0 + w * .4, y0, x0 + w * .6, y0 + 12], fill=VERT)
d.rectangle([x0 + w * .6, y0, x0 + w * .8, y0 + 12], fill=BLANC)
for i in range(6):
    px = x0 + w * .6 + 7 + i * 14
    d.ellipse([px - 4, y0 + 2, px + 4, y0 + 10], fill=ROUGE)
d.rectangle([x0 + w * .8, y0, x0 + w, y0 + 12], fill=BLANC)
ecran.save(DOSSIER / "demarrage-828x1792.png", optimize=True)
print("Icônes créées dans", DOSSIER)
