import { useState } from 'react';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('');

export default function Avatar({ name, tone = 0, photo }: { name: string; tone?: number; photo?: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  return <span className={`avatar avatar-${tone % 4}`}>
    {photo && photo !== failedPhoto
      ? <img src={photo} alt={`Foto de ${name || 'jugador'}`} onError={() => setFailedPhoto(photo)} />
      : <span aria-hidden="true">{initials(name) || 'PY'}</span>}
  </span>;
}
