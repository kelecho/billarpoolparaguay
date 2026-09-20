// Servidor local del modo compartido: sirve `dist-remote/` y ejecuta el mismo Worker de producción sobre SQLite.
// Uso: npm run dev:remote  (contraseña en .dev.vars, datos en .data/local.sqlite, fotos en .data/photos)
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createD1 } from './scripts/d1-node.mjs';
import { createR2 } from './scripts/r2-node.mjs';
import worker from './worker/index.ts';

const portIndex = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portIndex >= 0 && process.argv[portIndex + 1]) || 8787);
const dist = join(import.meta.dirname, 'dist-remote');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const vars = existsSync('.dev.vars') ? Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
mkdirSync('.data', { recursive: true });

const env = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? vars.ADMIN_PASSWORD,
  DB: createD1(process.env.DB_PATH ?? '.data/local.sqlite'),
  PHOTOS: createR2(process.env.DB_PATH === ':memory:' ? undefined : '.data/photos'),
  ASSETS: {
    async fetch(request) {
      const path = normalize(decodeURIComponent(new URL(request.url).pathname));
      const file = join(dist, path);
      const target = file.startsWith(dist) && extname(file) && existsSync(file) ? file : join(dist, 'index.html');
      return new Response(readFileSync(target), { headers: { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' } });
    },
  },
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '0.0.0.0', () => console.log(`Pool Paraguay (modo compartido) en http://localhost:${port}`));
