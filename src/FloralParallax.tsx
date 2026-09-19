import { useEffect, useRef } from 'react';

function Flower({ petals = 12, className = '' }: { petals?: number; className?: string }) {
  return <svg className={`page-flower ${className}`} viewBox="0 0 640 640" fill="none" aria-hidden="true">
    <g className="page-flower-rings"><circle cx="320" cy="320" r="52" /><circle cx="320" cy="320" r="68" /><circle cx="320" cy="320" r="198" /><circle cx="320" cy="320" r="214" /><circle cx="320" cy="320" r="276" /><circle cx="320" cy="320" r="292" /></g>
    {Array.from({ length: petals }, (_, i) => <g key={i} transform={`rotate(${i * 360 / petals} 320 320)`}>
      <path className="page-petal-outline" d="M320 267 C275 232 279 139 320 36 C361 139 365 232 320 267Z" />
      <path className="page-petal-vein" d="M320 251 C300 203 299 135 320 69 C341 135 340 203 320 251Z" />
      <path className="page-petal-stitch" d="M320 247 Q312 174 320 83 Q328 174 320 247Z" />
      <circle className="page-petal-dot" cx="320" cy="47" r="3" />
    </g>)}
    <g className="page-flower-calyx">
      {Array.from({ length: 12 }, (_, i) => <path key={i} transform={`rotate(${i * 30} 320 320)`} d="M320 253 C291 276 291 316 320 339 C349 316 349 276 320 253Z" />)}
    </g>
    <circle className="page-flower-center" cx="320" cy="320" r="15" />
  </svg>;
}

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
    <Flower className="page-flower-one" petals={12} />
    <Flower className="page-flower-two" petals={16} />
    <Flower className="page-flower-three" petals={10} />
  </div>;
}
