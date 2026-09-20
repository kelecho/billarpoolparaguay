import NandutiWeb from './NandutiWeb';
import { useEmblemParallax } from './useEmblemParallax';

/** Telaraña de ñandutí, con las bolas y los tacos flotando delante de los hilos. */
export default function PoolEmblem() {
  const ref = useEmblemParallax();
  return <div ref={ref} className="pool-scene" role="img" aria-label="Bolas ocho, nueve y diez tridimensionales sobre una telaraña de hilos inspirada en el ñandutí">
    {/* Dos tejidos superpuestos, con distinta cantidad de rayos: al moverse a distinto ritmo, sus cruces cambian. */}
    <NandutiWeb className="nanduti-backdrop" spokes={64} sector={4} lattice={[27, 19, 6]} />
    <NandutiWeb className="pool-weave" spokes={48} sector={4} lattice={[17, 11, 5]} />
    <span className="scene-orbit scene-orbit-one" aria-hidden="true" />
    <span className="scene-orbit scene-orbit-two" aria-hidden="true" />
    <span className="scene-cue scene-cue-one" aria-hidden="true">
      <i className="cue-tip" /><i className="cue-ferrule" /><i className="cue-collar" />
      <i className="cue-joint" /><i className="cue-wrap" /><i className="cue-buttcap" />
    </span>
    <span className="scene-cue scene-cue-two" aria-hidden="true">
      <i className="cue-tip" /><i className="cue-ferrule" /><i className="cue-collar" />
      <i className="cue-joint" /><i className="cue-wrap" /><i className="cue-buttcap" />
    </span>
    <div className="pool-ball pool-ball-nine" aria-hidden="true">
      <span className="ball-gloss" /><span className="ball-mark"><i>9</i></span><span className="ball-reflection" />
    </div>
    <div className="pool-ball pool-ball-ten" aria-hidden="true">
      <span className="ball-gloss" /><span className="ball-mark"><i>10</i></span><span className="ball-reflection" />
    </div>
    <div className="pool-ball pool-ball-eight" aria-hidden="true">
      <span className="ball-gloss" /><span className="ball-mark"><i>8</i></span><span className="ball-reflection" />
    </div>
  </div>;
}
