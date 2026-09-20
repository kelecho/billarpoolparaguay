import { useEffect, useRef } from 'react';
import NandutiWeb from './NandutiWeb';

export default function FloralParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      layer.style.setProperty('--page-parallax-y', reduceMotion.matches ? '0px' : `${Math.min(window.scrollY * .12, 150).toFixed(1)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    window.addEventListener('scroll', schedule, { passive: true });
    reduceMotion.addEventListener('change', schedule);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      reduceMotion.removeEventListener('change', schedule);
    };
  }, []);

  return <div className="floral-parallax" ref={ref} aria-hidden="true">
    {/* Tres tejidos con distinta urdimbre: ninguno repite los cruces del otro. */}
    <NandutiWeb className="page-flower page-flower-one" spokes={48} sector={4} lattice={[17, 11, 5]} />
    <NandutiWeb className="page-flower page-flower-two" spokes={60} sector={5} lattice={[23, 14, 7]} />
    <NandutiWeb className="page-flower page-flower-three" spokes={36} sector={3} lattice={[13, 8, 4]} />
  </div>;
}
