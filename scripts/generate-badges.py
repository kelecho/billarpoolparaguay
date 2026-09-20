# Genera las cuatro insignias con la misma plantilla: pin esmaltado con borde de oro pulido.
import math
OUT = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'public', 'badges', '')
SHIELD = 'M48 3 88 15V56C88 81 69 99 48 109 27 99 8 81 8 56V15Z'
FIELD = 'M48 11.5 80.5 21V56C80.5 75 67 91.5 48 101 29 91.5 15.5 75 15.5 56V21Z'
STAR = 'M0-5 1.5-1.6 5.1-1.5 2.3.8 3.1 4.4 0 2.4-3.1 4.4-2.3.8-5.1-1.5-1.5-1.6Z'

def numeral(n):
    # Números romanos con remates, dibujados como trazos para no depender de una tipografía.
    bar, gap, h = (5.2, 4.2, 21) if n < 3 else (4.1, 3.3, 20)
    width = n * bar + (n - 1) * gap
    x0, y0 = 48 - width / 2, 55 - h / 2
    parts = [f'<rect x="{x0 - 2.6:.1f}" y="{y0:.1f}" width="{width + 5.2:.1f}" height="3.6" rx=".8"/>',
             f'<rect x="{x0 - 2.6:.1f}" y="{y0 + h - 3.6:.1f}" width="{width + 5.2:.1f}" height="3.6" rx=".8"/>']
    parts += [f'<rect x="{x0 + i * (bar + gap):.1f}" y="{y0:.1f}" width="{bar}" height="{h}"/>' for i in range(n)]
    return ''.join(parts)

def laurel(full):
    # Dos ramas que suben desde abajo rodeando el medallón: cada hoja sigue el arco y se abre hacia afuera.
    count = 5 if full else 3
    stems = 'M48 85.5 Q30 82 22.5 62M48 85.5 Q66 82 73.5 62' if full else 'M48 85.5 Q37 84.5 28.5 75M48 85.5 Q59 84.5 67.5 75'
    leaves = [f'<path d="{stems}" fill="none" stroke="url(#oro)" stroke-width="1.3" stroke-linecap="round"/>']
    for side in (-1, 1):
        for i in range(count):
            theta = 258 - i * (62 / (5 - 1)) if side < 0 else 282 + i * (62 / (5 - 1))
            rad = math.radians(theta)
            cx, cy = 48 + 28.2 * math.cos(rad), 55 - 28.2 * math.sin(rad)
            rot = -theta + (38 if side < 0 else -38)
            leaves.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="2" ry="4.6" transform="rotate({rot:.0f} {cx:.1f} {cy:.1f})"/>')
    return ''.join(leaves)

def badge(name, title, light, dark, stars, mark, crown=False, laurels=None):
    star_xs = {0: [], 1: [48], 2: [41, 55], 3: [35, 48, 61]}[stars]
    body = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 112" fill="none">
 <title>Insignia de {title} · Pool Paraguay</title>
 <defs>
  <linearGradient id="oro" x1="10" y1="6" x2="86" y2="106" gradientUnits="userSpaceOnUse"><stop stop-color="#fff4c2"/><stop offset=".22" stop-color="#f3c74d"/><stop offset=".47" stop-color="#a8720f"/><stop offset=".63" stop-color="#ffe694"/><stop offset=".82" stop-color="#d9a02a"/><stop offset="1" stop-color="#8a5a08"/></linearGradient>
  <linearGradient id="oro2" x1="0" y1="40" x2="0" y2="70" gradientUnits="userSpaceOnUse"><stop stop-color="#fff6cf"/><stop offset=".5" stop-color="#f3c74d"/><stop offset="1" stop-color="#b47d14"/></linearGradient>
  <linearGradient id="esmalte" x1="18" y1="14" x2="78" y2="98" gradientUnits="userSpaceOnUse"><stop stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
  <linearGradient id="brillo" x1="30" y1="12" x2="52" y2="62" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="campo"><path d="{FIELD}"/></clipPath>
 </defs>
 <g transform="translate(4.8 11.2) scale(.9)">
  <path d="{SHIELD}" fill="url(#oro)" stroke="#6e4705" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M48 6.4 11.2 17.4V56C11.2 70 17.4 82 27 91" stroke="#fff8d8" stroke-width="1.1" stroke-opacity=".9" stroke-linecap="round"/>
  <path d="{FIELD}" fill="url(#esmalte)" stroke="#5f3c04" stroke-width="1.3" stroke-linejoin="round"/>
  <g clip-path="url(#campo)">
   <path d="M48 8V104H90V8Z" fill="#000" fill-opacity=".2"/>
   <path d="M22 35 74 84M74 35 22 84" stroke="#5f3c04" stroke-width="5.4" stroke-linecap="round" stroke-opacity=".55"/>
   <path d="M22 35 74 84M74 35 22 84" stroke="url(#oro)" stroke-width="3.4" stroke-linecap="round"/>
   <path d="M22 35 27 39.7M74 35 69 39.7" stroke="#fffefa" stroke-width="3.6" stroke-linecap="round"/>
   <path d="M12 8H62L30 66H12Z" fill="url(#brillo)"/>
  </g>
  <path d="M30 17.2H66" stroke="#ce3543" stroke-width="2.6"/><path d="M30 19.8H66" stroke="#fffefa" stroke-width="2.6"/><path d="M30 22.4H66" stroke="#3f7db6" stroke-width="2.6"/>
  <g fill="url(#oro2)" stroke="#5f3c04" stroke-width=".7" stroke-linejoin="round">{''.join(f'<path d="{STAR}" transform="translate({x} 31)"/>' for x in star_xs)}</g>
  {f'<g fill="url(#oro)" stroke="#5f3c04" stroke-width=".5">{laurel(laurels == "full")}</g>' if laurels else ''}
  <circle cx="48" cy="55" r="19.5" fill="{dark}" stroke="#5f3c04" stroke-width="5.2"/>
  <circle cx="48" cy="55" r="19.5" fill="none" stroke="url(#oro)" stroke-width="3.6"/>
  <circle cx="48" cy="55" r="16.6" fill="none" stroke="#fff8d8" stroke-width=".7" stroke-opacity=".7"/>
  <g fill="url(#oro2)" stroke="#5f3c04" stroke-width=".8" stroke-linejoin="round">{mark}</g>
 </g>
 {CROWN if crown else ''}
 <g fill="#fff"><path d="M0-4.2.9-.9 4.2 0 .9.9 0 4.2-.9.9-4.2 0-.9-.9Z" transform="translate(19 30)"/><path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6Z" transform="translate(27.5 22.6)" fill-opacity=".85"/></g>
</svg>
'''
    open(OUT + name + '.svg', 'w').write(body)

CROWN = '''<g stroke="#6e4705" stroke-width="1.2" stroke-linejoin="round"><path d="M31 15.4 28.6 3.6 38.4 9.2 48 1.2 57.6 9.2 67.4 3.6 65 15.4Z" fill="url(#oro)"/><path d="M30.6 15H65.4V19H30.6Z" fill="url(#oro2)"/></g>
 <g fill="#ce3543" stroke="#6e4705" stroke-width=".6"><circle cx="48" cy="1.9" r="1.7"/><circle cx="28.8" cy="3.9" r="1.5"/><circle cx="67.2" cy="3.9" r="1.5"/></g>'''
DIAMOND = '<path d="M48 42.5 58.5 55 48 67.5 37.5 55Z"/><path d="M48 48 53.6 55 48 62 42.4 55Z" fill="#fff8d8" stroke="none" fill-opacity=".55"/>'

badge('primera', 'Primera', '#e8404f', '#8c1222', 3, numeral(1), crown=True, laurels='full')
badge('segunda', 'Segunda', '#3b82d9', '#123c78', 2, numeral(2), laurels='half')
badge('tercera', 'Tercera', '#27a06f', '#0c5135', 1, numeral(3))
badge('principiante', 'Principiante', '#6cc3f2', '#2279b3', 0, DIAMOND)
