import { MAX_UPLOAD_BYTES, validBanner, validPlayerPhoto } from './playerPhoto';

/** Recorta al centro y vuelve a codificar: no conserva metadatos de la foto original. */
export async function preparePlayerPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una imagen JPG, PNG o WebP.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('La imagen supera los 8 MB. Elegí una foto más liviana.');
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = url;
    try { await picture.decode(); } catch { throw new Error('No se pudo abrir la imagen. Probá con otra foto.'); }
    if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 24_000_000) {
      throw new Error('La imagen es demasiado grande. Usá una foto de hasta 24 megapíxeles.');
    }
    const side = Math.min(picture.naturalWidth, picture.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(384, side);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto en este navegador.');
    context.fillStyle = '#fffefa';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, (picture.naturalWidth - side) / 2, (picture.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      if (validPlayerPhoto(photo)) return photo;
    }
    throw new Error('No se pudo reducir la foto. Probá con una imagen más pequeña.');
  } finally { URL.revokeObjectURL(url); }
}

/** El banner conserva su proporción —los afiches suelen ser verticales—; solo se reduce y se vuelve a codificar. */
export async function prepareBanner(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una imagen JPG, PNG o WebP.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('La imagen supera los 8 MB. Elegí una más liviana.');
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = url;
    try { await picture.decode(); } catch { throw new Error('No se pudo abrir la imagen. Probá con otra.'); }
    if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 40_000_000) throw new Error('La imagen es demasiado grande. Usá una de hasta 40 megapíxeles.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen en este navegador.');
    // Primero se baja la calidad; si no alcanza, el tamaño.
    for (const side of [1600, 1280, 1024, 800]) {
      const scale = Math.min(1, side / Math.max(picture.naturalWidth, picture.naturalHeight));
      canvas.width = Math.round(picture.naturalWidth * scale);
      canvas.height = Math.round(picture.naturalHeight * scale);
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6]) {
        const banner = canvas.toDataURL('image/jpeg', quality);
        if (validBanner(banner)) return banner;
      }
    }
    throw new Error('No se pudo reducir la imagen. Probá con otra más simple.');
  } finally { URL.revokeObjectURL(url); }
}
