/** Las fotos se guardan como JPEG pequeños, también dentro de los respaldos. */
export const MAX_PHOTO_LENGTH = 64 * 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function validPlayerPhoto(photo: unknown): photo is string {
  if (typeof photo !== 'string' || photo.length > MAX_PHOTO_LENGTH) return false;
  const prefix = 'data:image/jpeg;base64,';
  if (!photo.startsWith(prefix)) return false;
  const encoded = photo.slice(prefix.length);
  if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  try {
    const bytes = atob(encoded);
    return bytes.length > 4 && bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216
      && bytes.charCodeAt(2) === 255 && bytes.charCodeAt(bytes.length - 2) === 255 && bytes.charCodeAt(bytes.length - 1) === 217;
  } catch { return false; }
}

/** En el modo compartido la ficha guarda la dirección del archivo, nombrado por el SHA-256 de su contenido. */
export const PHOTO_PATH = '/api/photos/';
export const isPhotoRef = (photo: unknown): photo is string => typeof photo === 'string' && /^\/api\/photos\/[0-9a-f]{64}\.jpg$/.test(photo);
