"""Insignias vectoriales de club: siluetas progresivas y numerales legibles."""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public' / 'badges'
SHIELD = 'M64 22 100 36 96 82Q92 104 64 122 36 104 32 82L28 36Z'
FIELD = 'M64 31 91 42 88 80Q84 98 64 112 44 98 40 80L37 42Z'
STAR = 'M0-6 1.8-2 6.2-1.9 2.8 1 3.7 5.3 0 2.9-3.7 5.3-2.8 1-6.2-1.9-1.8-2Z'


def numeral(n):
    bar, gap = (8, 6) if n < 3 else (6, 5)
    width = n * bar + (n - 1) * gap
    x = 64 - width / 2
    return ''.join([
        f'<path d="M{x-3} 53h{width+6}v5h-{width+6}zM{x-3} 84h{width+6}v5h-{width+6}z"/>',
        *(f'<rect x="{x+i*(bar+gap)}" y="56" width="{bar}" height="30"/>' for i in range(n)),
    ])


def wings(full):
    # Plumas anchas, escalonadas: la silueta comunica el nivel aun en miniatura.
    feathers = [
        'M37 43 5 25 10 47 35 62Z',
        'M35 58 9 45 16 66 37 76Z',
        'M37 73 17 63 24 83 43 91Z',
    ] if full else [
        'M37 48 10 38 17 58 36 68Z',
        'M36 65 17 57 24 77 42 88Z',
    ]
    feather = ''.join(f'<path d="{d}" fill="url(#metal)" stroke="#554020" stroke-width="1.6"/>' for d in feathers)
    lines = '<path d="M12 36 32 49M17 55 32 63M25 73 36 79" stroke="#fff4cc" stroke-width="1.5"/>' if full else '<path d="M17 46 32 53M24 66 36 73" stroke="#fff4cc" stroke-width="1.5"/>'
    return f'<g>{feather}{lines}</g><g transform="translate(128 0) scale(-1 1)">{feather}{lines}</g>'


def laurel():
    branch = '<path d="M48 108Q19 95 21 66" fill="none" stroke="url(#metal)" stroke-width="3"/>'
    for x, y, angle in [(23, 72, -25), (25, 83, -40), (31, 93, -55), (40, 101, -65)]:
        branch += f'<path d="M0 7Q-10 0 0-9 9 0 0 7Z" transform="translate({x} {y}) rotate({angle})" fill="url(#metal)" stroke="#554020" stroke-width="1"/>'
    return f'<g>{branch}</g><g transform="translate(128 0) scale(-1 1)">{branch}</g>'


CROWN = '''<path d="M42 28 36 8 52 16 64 4 76 16 92 8 86 28Z" fill="url(#metal)" stroke="#554020" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M43 24H85V32H43Z" fill="url(#metal)" stroke="#554020" stroke-width="1.5"/>
<path d="m64 13 4 6-4 6-4-6Z" fill="#b32038"/>
<path d="M43 12 46 21M85 12 82 21" stroke="#fff6d3" stroke-width="2"/>'''
DIAMOND = '<path d="m64 49 18 22-18 25-18-25Z"/><path d="m64 56 11 15-11 17-11-17Z" fill="#dcf5ff" stroke="none"/><path d="m64 56 11 15H64Z" fill="#fff" stroke="none"/><path d="M64 71h11L64 88Z" fill="#7ac9e8" stroke="none"/>'


def badge(name, title, light, dark, stars, mark, ornament=''):
    star_xs = {0: [], 1: [64], 2: [56, 72], 3: [48, 64, 80]}[stars]
    decoration = wings(True) + laurel() if ornament == 'crown' else wings(False) if ornament == 'wings' else laurel() if ornament == 'laurel' else ''
    body = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
<title>Insignia de {title} · Pool Paraguay</title>
<defs>
 <linearGradient id="metal" x1="25" y1="15" x2="103" y2="114" gradientUnits="userSpaceOnUse"><stop stop-color="#fff6d3"/><stop offset=".23" stop-color="#ecc565"/><stop offset=".46" stop-color="#a66b16"/><stop offset=".52" stop-color="#ffe6a0"/><stop offset=".76" stop-color="#d7a13b"/><stop offset="1" stop-color="#805010"/></linearGradient>
 <linearGradient id="face" x1="44" y1="49" x2="76" y2="91" gradientUnits="userSpaceOnUse"><stop stop-color="#fff9e4"/><stop offset=".48" stop-color="#ffe4a0"/><stop offset="1" stop-color="#daa747"/></linearGradient>
 <linearGradient id="enamel" x1="40" y1="35" x2="91" y2="111" gradientUnits="userSpaceOnUse"><stop stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
 <clipPath id="field"><path d="{FIELD}"/></clipPath>
</defs>
{decoration}
<path d="{SHIELD}" fill="#392b1d" stroke="#392b1d" stroke-width="3" stroke-linejoin="round"/>
<path d="{SHIELD}" fill="url(#metal)"/>
<path d="M64 25 97 38 93 81Q89 102 64 118 39 102 35 81L31 38Z" stroke="#fff2bf" stroke-opacity=".8" stroke-width="1.5"/>
<path d="{FIELD}" fill="url(#enamel)" stroke="#49301c" stroke-width="2"/>
<g clip-path="url(#field)">
 <path d="M64 30V115H99V30Z" fill="#000" fill-opacity=".16"/>
 <path d="M36 38 87 35 38 87Z" fill="#fff" fill-opacity=".12"/>
 <path d="M43 49 85 99M85 49 43 99" stroke="#000" stroke-opacity=".2" stroke-width="5"/>
 <path d="M43 49 85 99M85 49 43 99" stroke="url(#metal)" stroke-width="2.5"/>
 <path d="M43 49 47 54M85 49 81 54" stroke="#f2f7f7" stroke-width="3"/>
</g>
<g fill="url(#face)" stroke="{dark}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{mark}</g>
<g fill="url(#face)" stroke="#554020" stroke-width=".7">{''.join(f'<path d="{STAR}" transform="translate({x} 41) scale(.8)"/>' for x in star_xs)}</g>
<path d="M53 100H75" stroke="#ce3543" stroke-width="3"/><path d="M53 103H75" stroke="#fffefa" stroke-width="3"/><path d="M53 106H75" stroke="#3f7db6" stroke-width="3"/>
{CROWN if ornament == 'crown' else ''}
<path d="m33 35 1.5 4.5L39 41l-4.5 1.5L33 47l-1.5-4.5L27 41l4.5-1.5Z" fill="#fff8dd"/>
</svg>
'''
    (OUT / f'{name}.svg').write_text(body)


badge('primera', 'Primera', '#e54b5d', '#750e26', 3, numeral(1), 'crown')
badge('segunda', 'Segunda', '#408ddd', '#112f68', 2, numeral(2), 'wings')
badge('tercera', 'Tercera', '#2caf83', '#0b493a', 1, numeral(3), 'laurel')
badge('principiante', 'Principiante', '#58b5df', '#19537e', 0, DIAMOND)
