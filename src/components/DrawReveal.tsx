import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Shuffle } from 'lucide-react';

/** Tiempo de bolillero antes de que frene la primera bola. */
const SHAKE_MS = 1900;
/** Lo que tarda en total la revelación: con pocos inscriptos cada bola se hace esperar, con muchos frenan en ráfaga. */
const REVEAL_MS = 5600;
const ROLL_MS = 75;

type Props = {
  /** Lugares de la primera ronda, de a pares; `null` es un pase libre. Es el sorteo ya guardado: acá solo se lo revela. */
  seeds: (string | null)[];
  name: (playerId: string) => string;
  onDone: () => void;
};

/**
 * El sorteo se resuelve y se guarda antes de abrir esto, con el azar de siempre; la animación no decide nada.
 * Cada lugar del cuadro es una bola numerada del bolillero: gira mientras pasan los nombres y, cuando frena, el cruce queda a la vista.
 */
export default function DrawReveal({ seeds, name, onDone }: Props) {
  const players = useMemo(() => seeds.filter((id): id is string => Boolean(id)).map(name), [seeds, name]);
  const [settled, setSettled] = useState(0);
  const [roll, setRoll] = useState(0);
  const done = settled >= seeds.length;
  const finish = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const pace = Math.max(45, Math.min(420, REVEAL_MS / seeds.length));
    let out = 0;
    let timer = window.setTimeout(function settle() {
      setSettled(++out);
      if (out < seeds.length) timer = window.setTimeout(settle, pace);
    }, SHAKE_MS);
    return () => clearTimeout(timer);
  }, [seeds.length]);

  // En pantallas angostas los cruces quedan en una sola columna: la vista acompaña a la bola que está saliendo.
  useEffect(() => {
    if (settled && !done) list.current?.children[Math.floor((settled - 1) / 2)]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [settled, done]);

  useEffect(() => {
    if (done) { finish.current?.focus(); return; }
    const timer = window.setInterval(() => setRoll(n => n + 1), ROLL_MS);
    return () => clearInterval(timer);
  }, [done]);

  return (
    <section className={`draw-reveal${done ? ' draw-done' : ''}`} aria-label="Sorteo de los cruces">
      <header className="draw-head">
        <Shuffle size={20} aria-hidden="true" />
        {/* Se anuncia el principio y el final; los nombres que pasan no se leen en voz alta. */}
        <h3 role="status">{done ? 'Sorteo listo' : settled ? 'Saliendo los cruces…' : 'Girando el bolillero…'}</h3>
        <span className="draw-count" aria-hidden="true">{Math.min(settled, seeds.length)}/{seeds.length}</span>
      </header>
      <div className="draw-track" aria-hidden="true"><i style={{ width: `${(Math.min(settled, seeds.length) / seeds.length) * 100}%` }} /></div>
      <ol className="draw-matches" ref={list} aria-hidden={!done}>
        {Array.from({ length: seeds.length / 2 }, (_, match) => (
          <li key={match} className={settled >= match * 2 + 2 ? 'draw-paired' : undefined}>
            <span className="draw-match-number">Partido {match + 1}</span>
            {[0, 1].map(side => {
              const slot = match * 2 + side;
              const out = slot < settled;
              const id = seeds[slot];
              return (
                <span key={side} className={`draw-slot${out ? ' draw-out' : ''}${out && !id ? ' draw-bye' : ''}`}>
                  <i className={`draw-ball draw-ball-${(slot % 15) + 1}`}><b>{slot + 1}</b></i>
                  <span className="draw-name">{out ? id ? name(id) : 'Pase libre' : players[(roll * 7 + slot * 3) % players.length]}</span>
                </span>
              );
            })}
          </li>
        ))}
      </ol>
      <div className="modal-actions">
        {done
          ? <button ref={finish} className="button primary" onClick={onDone}>Ver el fixture <ChevronRight size={16} /></button>
          : <button className="button" onClick={onDone}>Saltar la animación</button>}
      </div>
    </section>
  );
}
