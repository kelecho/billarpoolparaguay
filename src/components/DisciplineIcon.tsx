import type { Discipline } from '../domain';

function Ball({ number }: { number: 8 | 9 | 10 }) {
  return <span className={`discipline-ball discipline-ball-${number}`}><b>{number}</b></span>;
}

export default function DisciplineIcon({ discipline }: { discipline: Discipline | 'General' | 'Todas' }) {
  const number = discipline === 'Bola 8' ? 8 : discipline === 'Bola 9' ? 9 : discipline === 'Bola 10' ? 10 : undefined;
  return (
    <span className={`discipline-icon${number ? '' : ' discipline-icon-group'}`} aria-hidden="true">
      {number ? <Ball number={number} /> : <><Ball number={9} /><Ball number={10} /><Ball number={8} /></>}
    </span>
  );
}
