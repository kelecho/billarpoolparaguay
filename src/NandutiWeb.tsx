import { useMemo } from 'react';

const CENTER = 320;
const HUB = 16;
const RIM = 278;

type Weave = {
  /** Rayos de la urdimbre. Tiene que ser múltiplo de `sector`. */
  spokes: number;
  /** Rayos por paño: entre dos rayos principales se tiende un abanico. */
  sector: number;
  /** Rayos que salta cada hilo de las bandas trenzadas: azul interior, rojo interior y orla. Cuanto más cerca de la mitad de `spokes`, más cerrado el cruce. */
  lattice: [number, number, number];
};

/**
 * Ñandutí quiere decir «tela de araña», y el encaje se teje igual: hilos rectos tensados sobre una urdimbre de rayos.
 * Acá no hay pétalos ni curvas dibujadas; las curvas que se ven son envolventes de hilos rectos que se cruzan.
 * Todo se calcula una vez por tejido y sale en pocos trazos largos.
 */
function weave({ spokes, sector, lattice }: Weave) {
  const turn = (i: number) => (i / spokes) * Math.PI * 2;
  const at = (r: number, i: number) => `${(CENTER + r * Math.sin(turn(i))).toFixed(1)} ${(CENTER - r * Math.cos(turn(i))).toFixed(1)}`;
  const each = (count: number, draw: (i: number) => string) => Array.from({ length: count }, (_, i) => draw(i)).join('');

  // Hilo de captura: entre rayo y rayo se comba hacia el centro, como en una telaraña.
  const ring = (r: number, sag: number, step = 1) => each(spokes / step, i => `M${at(r, i * step)}Q${at(r * (1 - sag), i * step + step / 2)} ${at(r, (i + 1) * step)}`);
  // Banda trenzada: cada hilo une dos rayos separados por `skip`; los cruces arman anillos que nadie dibujó.
  const braid = (r: number, skip: number) => each(spokes, i => `M${at(r, i)}L${at(r, i + skip)}`);
  // Abanico de hilo tendido entre los dos rayos principales de un panel: rectas que juntas forman una curva.
  const fan = (panel: number, from: number, to: number, threads: number) => each(threads + 1, t => {
    const step = ((to - from) * t) / threads;
    return `M${at(from + step, panel * sector)}L${at(to - step, (panel + 1) * sector)}`;
  });
  // Filigrana: un solo hilo que va y viene entre dos rayos mientras se aleja del centro.
  const darn = (panel: number, from: number, to: number, passes: number) => `M${at(from, panel * sector + 1)}` + each(passes, p => `L${at(from + ((to - from) * (p + 1)) / passes, panel * sector + (p % 2 ? 1 : sector - 1))}`);

  const panels = spokes / sector;
  return {
    spokes: each(spokes, i => i % sector ? `M${at(HUB, i)}L${at(RIM, i)}` : ''),
    ribs: each(panels, p => `M${at(HUB, p * sector)}L${at(RIM, p * sector)}`),
    hub: [20, 25, 31].map(r => ring(r, 0)).join(''),
    capture: [[132, .05], [141, .05], [240, .035], [249, .035], [RIM, .02]].map(([r, sag]) => ring(r, sag)).join('') + ring(66, .09, 2) + ring(96, .07, 2),
    braid: braid(124, lattice[0]),
    // La orla va en rojo: es la banda que asoma por fuera de las bolas de la portada.
    braidRed: braid(124, lattice[1]) + braid(268, lattice[2]),
    fans: each(panels, p => fan(p, 150, 232, 9)),
    darning: each(panels, p => p % 2 ? darn(p, 156, 226, 22) : ''),
    scallops: each(spokes / 2, i => `M${at(RIM, i * 2)}Q${at(RIM + 30, i * 2 + 1)} ${at(RIM, i * 2 + 2)}`),
    picots: Array.from({ length: spokes / 2 }, (_, i) => at(RIM + 17, i * 2 + 1).split(' ')),
  };
}

/** Un tejido completo. `className` decide tamaño, lugar y opacidad; los colores salen del tema. */
export default function NandutiWeb({ className, ...shape }: Weave & { className: string }) {
  const { spokes, sector, lattice: [a, b, c] } = shape;
  const paths = useMemo(() => weave({ spokes, sector, lattice: [a, b, c] }), [spokes, sector, a, b, c]);
  return (
    <svg className={`nanduti-web ${className}`} viewBox="0 0 640 640" fill="none" aria-hidden="true">
      <path className="web-spokes" d={paths.spokes} />
      <path className="web-ribs" d={paths.ribs} />
      <path className="web-braid" d={paths.braid} />
      <path className="web-braid web-red" d={paths.braidRed} />
      <path className="web-fans" d={paths.fans} />
      <path className="web-darning web-red" d={paths.darning} />
      <path className="web-capture" d={paths.capture} />
      <path className="web-scallops" d={paths.scallops} />
      <path className="web-hub" d={paths.hub} />
      <g className="web-picots">{paths.picots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.7" />)}</g>
      <circle className="web-center" cx={CENTER} cy={CENTER} r="9" />
    </svg>
  );
}
