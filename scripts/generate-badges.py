"""Insignias de categoría como monedas nacionales: oro, plata, bronce y níquel.

Cada categoría es una moneda de curso legal paraguaya —1000, 500, 100 y 50 guaraníes—
acuñada con la tipografía de la marca (Changa One). Los numerales se convierten a
trazos, así los archivos no dependen de ninguna fuente al mostrarse dentro de un <img>.

Uso: python3 scripts/generate-badges.py  (necesita `pip install fonttools brotli`)
"""
from math import cos, radians, sin
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'badges'
FONT = ROOT / 'node_modules' / '@fontsource' / 'changa-one' / 'files' / 'changa-one-latin-400-normal.woff2'

font = TTFont(FONT)
GLYPHS = font.getGlyphSet()
CMAP = font.getBestCmap()
UPEM = font['head'].unitsPerEm


def glyph(char):
    """Contorno del carácter en unidades de la fuente, con su avance."""
    name = CMAP[ord(char)]
    pen = SVGPathPen(GLYPHS)
    GLYPHS[name].draw(pen)
    return pen.getCommands(), GLYPHS[name].width


def text_path(text, size, x, y, anchor='middle'):
    """Texto convertido a un único trazo, con el origen en la línea de base."""
    scale = size / UPEM
    width = sum(glyph(c)[1] for c in text) * scale
    start = x - width / 2 if anchor == 'middle' else x - width if anchor == 'end' else x
    parts, pen_x = [], 0.0
    for char in text:
        commands, advance = glyph(char)
        if commands:
            parts.append(f'<g transform="translate({start + pen_x:.2f} {y:.2f}) scale({scale:.5f} {-scale:.5f})"><path d="{commands}"/></g>')
        pen_x += advance * scale
    return ''.join(parts)


def arc_text(text, size, radius, center_deg, spacing=1.0, flip=False):
    """Leyenda curvada sobre el anillo, como la de una moneda acuñada.

    Arriba las letras crecen hacia el canto; abajo se giran media vuelta y crecen
    hacia el centro, que es como se lee una acuñación real sin poner la cabeza al revés.
    """
    scale = size / UPEM
    widths = [glyph(c)[1] * scale for c in text]
    # El ancho de cada letra se convierte en el ángulo que ocupa sobre la circunferencia.
    angles = [w / radius * 57.2958 * spacing for w in widths]
    way = -1 if flip else 1
    angle = center_deg - way * sum(angles) / 2
    parts = []
    for char, width, step in zip(text, widths, angles):
        commands, _ = glyph(char)
        angle += way * step / 2
        if commands:
            x, y = 64 + radius * sin(radians(angle)), 64 - radius * cos(radians(angle))
            turn = angle + 180 if flip else angle
            parts.append(f'<g transform="translate({x:.2f} {y:.2f}) rotate({turn:.2f}) translate({-width / 2:.2f} 0) scale({scale:.5f} {-scale:.5f})"><path d="{commands}"/></g>')
        angle += way * step / 2
    return ''.join(parts)


STAR = 'M0-9 2.6-3 9-2.7 4 1.5 5.6 8 0 4.4-5.6 8-4 1.5-9-2.7-2.6-3Z'


def reeding(count=84, r=59.2, length=4.4):
    """Canto estriado: el detalle que hace que un círculo se lea como moneda."""
    ticks = []
    for i in range(count):
        a = radians(i * 360 / count)
        x, y = 64 + sin(a), 64 - cos(a)
        ticks.append(f'M{64 + (r - length) * sin(a):.2f} {64 - (r - length) * cos(a):.2f}L{64 + r * sin(a):.2f} {64 - r * cos(a):.2f}')
    return ' '.join(ticks)


def lace(rings=(19, 28, 37), spokes=24):
    """Ñandutí tejido en el campo de la moneda, al modo del guilloché de las acuñaciones."""
    parts = [f'<circle cx="64" cy="64" r="{r}"/>' for r in rings]
    for i in range(spokes):
        a = radians(i * 360 / spokes)
        parts.append(f'<path d="M{64 + 11 * sin(a):.2f} {64 - 11 * cos(a):.2f}L{64 + 39 * sin(a):.2f} {64 - 39 * cos(a):.2f}"/>')
    return ''.join(parts)


def separators(radius=48, angles=(96, 264)):
    """Estrellitas que abren y cierran la leyenda, como en las acuñaciones."""
    return ''.join(
        f'<path d="{STAR}" transform="translate({64 + radius * sin(radians(a)):.2f} {64 - radius * cos(radians(a)):.2f}) scale(.34)"/>'
        for a in angles)


COINS = {
    # tono claro, medio, oscuro del metal y color del relieve grabado
    'primera': dict(
        title='Primera', value='1000', ring='#f6e6b0',
        stops=[('#fffaea', 0), ('#f2d68a', .18), ('#c8931f', .44), ('#fff0bd', .53), ('#dfae44', .74), ('#8f5c11', 1)],
        core=[('#ffeec4', 0), ('#e8bd5c', .45), ('#b8842a', 1)], line='#7a4d0c', shade='#5c390a', shine='#fffbe9'),
    'segunda': dict(
        title='Segunda', value='500', ring='#eef3f7',
        stops=[('#ffffff', 0), ('#e4ebf1', .18), ('#98a7b5', .44), ('#fbfdff', .53), ('#c2cdd9', .74), ('#68778a', 1)],
        core=[('#f8fbfe', 0), ('#d2dce6', .45), ('#9aa8b7', 1)], line='#5d6c7d', shade='#44505f', shine='#ffffff'),
    'tercera': dict(
        title='Tercera', value='100', ring='#f3cfae',
        stops=[('#ffe8d0', 0), ('#e0a76c', .18), ('#9d5522', .44), ('#ffd5ac', .53), ('#c2793f', .74), ('#6d3a14', 1)],
        core=[('#ffdcb8', 0), ('#cd8a4f', .45), ('#8e5223', 1)], line='#63330f', shade='#4a2609', shine='#fff0de'),
    'principiante': dict(
        title='Principiante', value='50', ring='#dde5ec',
        stops=[('#dde5ec', 0), ('#a9b6c2', .18), ('#5b6875', .44), ('#cbd5de', .53), ('#828f9d', .74), ('#39434d', 1)],
        core=[('#c9d3dc', 0), ('#93a0ad', .45), ('#5d6975', 1)], line='#39434d', shade='#242b33', shine='#eaf0f5'),
}


def coin(name, spec):
    stops = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for c, o in spec['stops'])
    core = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for c, o in spec['core'])
    value, line, shade, shine = spec['value'], spec['line'], spec['shade'], spec['shine']
    # El numeral manda: ocupa casi todo el campo y es lo único legible a 48 px.
    size = 48 if len(value) == 2 else 41 if len(value) == 3 else 35
    numeral = text_path(value, size, 64, 82)
    legend = arc_text('GUARANÍES', 9.5, 51.5, 180, spacing=1.1, flip=True)
    country = arc_text('PARAGUAY', 9.5, 43, 0, spacing=1.12)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
<title>Moneda de {value} guaraníes · insignia de {spec['title']} · BillarPool Paraguay</title>
<defs>
 <linearGradient id="metal" x1="20" y1="12" x2="108" y2="116" gradientUnits="userSpaceOnUse">{stops}</linearGradient>
 <linearGradient id="core" x1="30" y1="26" x2="98" y2="104" gradientUnits="userSpaceOnUse">{core}</linearGradient>
 <linearGradient id="relief" x1="64" y1="48" x2="64" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="{shine}"/><stop offset=".34" stop-color="{spec['ring']}"/><stop offset=".72" stop-color="{spec['core'][1][0]}"/><stop offset="1" stop-color="{line}"/></linearGradient>
 <radialGradient id="hollow" cx="64" cy="58" r="46" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".22"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="{shade}" stop-opacity=".35"/></radialGradient>
 <clipPath id="field"><circle cx="64" cy="64" r="41"/></clipPath>
 <path id="reed" d="{reeding()}"/>
</defs>
<circle cx="64" cy="64" r="60.5" fill="{shade}" fill-opacity=".55"/>
<use href="#reed" stroke="url(#metal)" stroke-width="2.1"/>
<use href="#reed" stroke="{shade}" stroke-opacity=".45" stroke-width=".9"/>
<circle cx="64" cy="64" r="55" fill="url(#metal)" stroke="{line}" stroke-width="1.6"/>
<circle cx="64" cy="64" r="51" fill="none" stroke="{shine}" stroke-opacity=".55" stroke-width="1.6"/>
<circle cx="64" cy="64" r="41.5" fill="url(#core)" stroke="{line}" stroke-width="1.5"/>
<g clip-path="url(#field)" stroke="{line}" stroke-opacity=".17" stroke-width=".7" fill="none">{lace()}</g>
<g fill="url(#relief)" stroke="{line}" stroke-width="1.1" stroke-linejoin="round" paint-order="stroke">
 <path d="{STAR}" transform="translate(64 38) scale(.82)"/>
</g>
<circle cx="64" cy="64" r="55" fill="url(#hollow)"/>
<path d="M27 34A47 47 0 0 1 96 27 55 55 0 0 0 27 34Z" fill="{shine}" fill-opacity=".38"/>
<g fill="{shade}" fill-opacity=".45" transform="translate(1.6 1.8)">{numeral}</g>
<g fill="url(#relief)" stroke="{line}" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke">{numeral}</g>
<g fill="{line}" fill-opacity=".85">{legend}{country}{separators()}</g>
</svg>
'''
    (OUT / f'{name}.svg').write_text(svg)


for name, spec in COINS.items():
    coin(name, spec)
print('Monedas escritas en', OUT)
