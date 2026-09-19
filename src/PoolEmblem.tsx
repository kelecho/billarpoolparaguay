import NandutiBackground from './NandutiBackground';
import { useEmblemParallax } from './useEmblemParallax';

/** Flor radial ornamental, con la pelota y los tacos flotando delante de los hilos. */
export default function PoolEmblem() {
  const ref = useEmblemParallax();
  return <div ref={ref} className="pool-scene" role="img" aria-label="Bolas ocho, nueve y diez tridimensionales entre flores ornamentales inspiradas en el ñandutí">
    <NandutiBackground />
    <svg className="pool-weave" viewBox="0 0 500 500" fill="none" aria-hidden="true">
      <g className="weave-rays" stroke="#163d67" strokeWidth=".8">
        {Array.from({ length: 24 }, (_, i) => <g key={i} transform={`rotate(${i * 15} 250 250)`}>
          <path d="M250 24v452" />
          <circle cx="250" cy="29" r="2.1" fill="#ce3543" />
        </g>)}
      </g>
      <g className="weave-flowers" stroke="#163d67" strokeWidth="1.2">
        {Array.from({ length: 12 }, (_, i) => <g key={`petal-${i}`} transform={`rotate(${i * 30} 250 250)`}>
          <path d="M250 231 C216 210 190 150 250 31 C310 150 284 210 250 231Z" />
          <path d="M250 218 C230 192 222 153 250 91 C278 153 270 192 250 218Z" stroke="#ce3543" />
          <path d="M250 218 Q242 166 250 91 Q258 166 250 218Z" stroke="#ce3543" strokeWidth=".8" />
          {[0, 1, 2, 3, 4].map(dot => <circle key={dot} cx="250" cy={49 + dot * 12} r="1.35" fill="#ce3543" stroke="none" />)}
        </g>)}
        {[93, 105, 216, 229, 239].map(r => <circle key={r} cx="250" cy="250" r={r} />)}
      </g>
      <g className="weave-knots" stroke="#ce3543" strokeWidth="1.05">
        {Array.from({ length: 12 }, (_, i) => <g key={`calyx-${i}`} transform={`rotate(${i * 30 + 15} 250 250)`}>
          <path d="M250 111 C229 133 227 158 250 177 C273 158 271 133 250 111Z" />
          <path d="M250 119v48m-9-25 9 14 9-14" stroke="#163d67" strokeWidth=".8" />
        </g>)}
        {[73, 82, 91, 169, 178, 187].map(r => <circle key={r} cx="250" cy="250" r={r} />)}
        <circle cx="250" cy="250" r="7" fill="#ce3543" />
      </g>
      <g fill="#ce3543"><circle cx="250" cy="20" r="3.5" /><circle cx="480" cy="250" r="3.5" /><circle cx="250" cy="480" r="3.5" /><circle cx="20" cy="250" r="3.5" /></g>
    </svg>
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
