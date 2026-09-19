import { ArrowDown, ArrowUpRight } from 'lucide-react';
import PoolEmblem from '../PoolEmblem';
import { pageHref } from '../useHashRoute';

export default function Hero() {
  const scrollToRanking = () => document.getElementById('ranking-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="eyebrow"><span className="mini-star">✳</span> EL PUNTO DE ENCUENTRO DEL POOL PARAGUAYO</span>
        <h1 id="hero-title">El pool tiene<br /><em>bandera.</em></h1>
        <p>De la mesa de tu club al primer puesto.<br />Nuestro juego, nuestra gente, nuestro ranking.</p>
        <div className="hero-actions">
          <button className="button primary" onClick={scrollToRanking}>Ver el ranking <ArrowDown size={17} /></button>
          <a className="text-button" href={pageHref('Torneos')}>Encontrá tu próximo torneo <ArrowUpRight size={17} /></a>
        </div>
        <div className="hero-note"><span className="note-line" />DE CLUB EN CLUB. DE PUNTA A PUNTA.</div>
      </div>
      <div className="hero-art">
        <span className="art-topline">PASIÓN QUE NOS UNE <span>PY</span></span>
        <PoolEmblem />
        <span className="art-bottomline">UNA MESA. MIL HISTORIAS.</span>
      </div>
    </section>
  );
}
