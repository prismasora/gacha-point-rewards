import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('PORT must be an integer between 1 and 65535.\n');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const local = relative(root, file);
    if (local.startsWith('..') || isAbsolute(local)) { response.writeHead(403); response.end('Forbidden'); return; }
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => {
  process.stderr.write(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or choose another PORT.\n` : `${error.message}\n`);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`NEON TICKET\n  Site:    http://localhost:${port}/\n  Preview: http://localhost:${port}/?preview=1\nKeep this terminal running. Ctrl+C stops the website.\n`);
});
