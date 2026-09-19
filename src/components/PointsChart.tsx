import { useState } from 'react';
import { dateLabel, number, pointsHistory, type RankedPlayer } from '../domain';

const WIDTH = 480;
const HEIGHT = 120;
const PAD = { x: 10, top: 14, bottom: 12 };

/** Evolución del puntaje torneo a torneo. El historial debajo hace de vista de tabla. */
export default function PointsChart({ player }: { player: RankedPlayer }) {
  const values = pointsHistory(player);
  const [active, setActive] = useState(values.length - 1);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const span = Math.max(1, Math.max(...values) - min);
  const x = (i: number) => PAD.x + i * (WIDTH - PAD.x * 2) / (values.length - 1);
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (HEIGHT - PAD.top - PAD.bottom);
  const labels = ['Puntos iniciales', ...player.entries.map(e => `${e.tournament.name} · ${dateLabel(e.tournament.date, true)}`)];
  const step = (WIDTH - PAD.x * 2) / (values.length - 1);

  return (
    <figure className="points-chart">
      <figcaption><span>{labels[active]}</span><strong>{number(values[active])} pts</strong></figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Evolución de puntos: de ${number(values[0])} a ${number(values.at(-1)!)} en ${player.entries.length} torneos`} onMouseLeave={() => setActive(values.length - 1)}>
        <line className="chart-base" x1={PAD.x} x2={WIDTH - PAD.x} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom} />
        <line className="chart-cursor" x1={x(active)} x2={x(active)} y1={PAD.top - 6} y2={HEIGHT - PAD.bottom} />
        <polyline className="chart-line" points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        <circle className="chart-dot" cx={x(active)} cy={y(values[active])} r="5" />
        {values.map((_, i) => <rect key={i} x={x(i) - step / 2} y="0" width={step} height={HEIGHT} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />)}
      </svg>
    </figure>
  );
}
