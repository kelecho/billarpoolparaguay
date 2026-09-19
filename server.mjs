import { preview } from 'vite';
const portIndex = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portIndex >= 0 && process.argv[portIndex + 1]) || 5173);
const server = await preview({ preview: { port, host: '0.0.0.0' } });
server.printUrls();
