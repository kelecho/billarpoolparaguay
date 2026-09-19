/** Segunda flor ornamental: pétalos acanalados y un cáliz radial más ligero. */
export default function NandutiBackground() {
  return <svg className="nanduti-backdrop" viewBox="0 0 500 500" fill="none" aria-hidden="true">
    <g stroke="#163d67" strokeWidth="1.15">
      {[44, 57, 76, 91, 115, 134, 184, 205, 225, 239].map(r => <circle key={r} cx="250" cy="250" r={r} />)}
      {Array.from({ length: 16 }, (_, i) => <g key={i} transform={`rotate(${i * 22.5} 250 250)`}>
        <path d="M250 224 C218 206 194 151 250 26 C306 151 282 206 250 224Z" />
        <path d="M250 211 C229 183 226 145 250 83 C274 145 271 183 250 211Z" stroke="#ce3543" />
        <path d="M250 211 Q244 151 250 83 Q256 151 250 211Z" />
        <circle cx="250" cy="41" r="2.2" fill="#163d67" />
      </g>)}
    </g>
    <g stroke="#ce3543" strokeWidth="1.25">
      {Array.from({ length: 12 }, (_, i) => <g key={`inside-${i}`} transform={`rotate(${i * 30 + 15} 250 250)`}>
        <path d="M250 112 C229 133 227 158 250 177 C273 158 271 133 250 112Z" />
        <path d="M250 119v48m-8-25 8 14 8-14" stroke="#163d67" strokeWidth=".9" />
      </g>)}
    </g>
    <circle cx="250" cy="250" r="8" fill="#163d67" />
  </svg>;
}
