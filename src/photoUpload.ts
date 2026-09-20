import { MAX_UPLOAD_BYTES, validPlayerPhoto } from './playerPhoto';

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
