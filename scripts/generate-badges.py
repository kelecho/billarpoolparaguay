"""Insignias de categoría: el rombo de la baranda, con marco de metal.

El diamante incrustado en la banda de la mesa es la geometría con la que apunta
un jugador que sabe. Cada categoría es ese rombo con un metal distinto —oro,
plata y bronce para las que ya lo ganaron, hueso para Principiante— y el numeral
romano en crema sobre el azul de club. El marco lleva el color saturado: es lo
que separa una categoría de otra de un vistazo, antes de leer la cifra.

El numeral sale de la tipografía de la marca (Changa One) convertido a trazos:
así el archivo no depende de ninguna fuente al mostrarse dentro de un <img>.

Uso: python3 scripts/generate-badges.py  (necesita `pip install fonttools brotli`)
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'badges'
FONT = ROOT / 'node_modules' / '@fontsource' / 'changa-one' / 'files' / 'changa-one-latin-400-normal.woff2'

font = TTFont(FONT)
GLYPHS, CMAP, UPEM = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm


def glyph(char):
    """Contorno del carácter en unidades de la fuente, con su avance."""
    pen = SVGPathPen(GLYPHS)
    GLYPHS[CMAP[ord(char)]].draw(pen)
    return pen.getCommands(), GLYPHS[CMAP[ord(char)]].width


def text_path(text, size, x, y, track, fit):
    """Texto en trazos, centrado en x con la base en y; `fit` lo achica si no entra."""
    width = sum(glyph(c)[1] for c in text) * size / UPEM + track * (len(text) - 1)
    if width > fit:
        size, track = size * fit / width, track * fit / width
    scale = size / UPEM
    widths = [glyph(c)[1] * scale + track for c in text]
    pen_x = x - (sum(widths) - track) / 2
    parts = []
    for char, width in zip(text, widths):
        commands, _ = glyph(char)
        parts.append(f'<g transform="translate({pen_x:.2f} {y:.2f}) scale({scale:.5f} {-scale:.5f})"><path d="{commands}"/></g>')
        pen_x += width
    return ''.join(parts)


# Cada metal lleva su color, no un grisado: ámbar, acero azulado, cobre y hueso.
# Hueso cierra la serie porque Principiante todavía no ganó metal.
TIERS = [
    ('primera', 'Primera', 'I', ('#fff3c0', '#f0b81f', '#8f5d05')),
    ('segunda', 'Segunda', 'II', ('#f4fbff', '#9fbcd6', '#4c6c8a')),
    ('tercera', 'Tercera', 'III', ('#ffcf9e', '#d96f24', '#7d350a')),
    ('principiante', 'Principiante', 'IV', ('#fffdf6', '#e5d7b4', '#9a8760')),
]
NAVY_LIGHT, NAVY_DARK, CREAM = '#1e5189', '#102c49', '#fbf7ef'
ROMBO = 'M64 7 121 64 64 121 7 64Z'
SHEEN = 'M64 12.5 115.5 64 64 115.5 12.5 64Z'
INNER = 'M64 19 109 64 64 109 19 64Z'


def badge(name, title, numeral, metal):
    light, mid, dark = metal
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
<title>Insignia de {title} · BillarPool Guaraní</title>
<defs>
 <linearGradient id="metal" x1="26" y1="12" x2="102" y2="116" gradientUnits="userSpaceOnUse"><stop stop-color="{light}"/><stop offset=".42" stop-color="{mid}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
 <linearGradient id="field" x1="34" y1="16" x2="94" y2="114" gradientUnits="userSpaceOnUse"><stop stop-color="{NAVY_LIGHT}"/><stop offset="1" stop-color="{NAVY_DARK}"/></linearGradient>
</defs>
<path d="{ROMBO}" fill="url(#field)" stroke="url(#metal)" stroke-width="9" stroke-linejoin="round"/>
<path d="{ROMBO}" fill="none" stroke="{dark}" stroke-opacity=".9" stroke-width="1.4" stroke-linejoin="round"/>
<path d="{SHEEN}" fill="none" stroke="{light}" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round"/>
<path d="{INNER}" fill="none" stroke="{CREAM}" stroke-opacity=".28" stroke-width="1.4" stroke-linejoin="round"/>
<g fill="{CREAM}">{text_path(numeral, 46, 64, 80, track=2.5, fit=54)}</g>
</svg>
'''
    (OUT / f'{name}.svg').write_text(svg)


for name, title, numeral, metal in TIERS:
    badge(name, title, numeral, metal)
print('Insignias escritas en', OUT)
