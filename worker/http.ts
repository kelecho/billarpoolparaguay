export const MAX_STATE_BYTES = 10 * 1024 * 1024;
export const MAX_ACTION_BYTES = 256 * 1024;
export const MAX_BANNER_BYTES = 450 * 1024;
export const MAX_ACCOUNT_BYTES = 4 * 1024;
export const API_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const raw = (text: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(text, { status, headers: { 'content-type': 'application/json; charset=utf-8', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", ...API_HEADERS, ...headers } });
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => raw(JSON.stringify(body), status, headers);

export const hex = (buffer: ArrayBuffer | Uint8Array) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Lee por partes y corta al pasar el tope: un cuerpo enorme no llega a ocupar la memoria del Worker. */
export async function body(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
  const tooLarge = new HttpError(413, 'El contenido supera el tamaño permitido.');
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw tooLarge;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  for (let size = 0; reader;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((size += value.byteLength) > limit) { await reader.cancel(); throw tooLarge; }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(await new Blob(chunks).text());
    if (value && typeof value === 'object') return value;
  } catch { /* cae en el error de abajo */ }
  throw new HttpError(400, 'El contenido no es JSON válido.');
}
