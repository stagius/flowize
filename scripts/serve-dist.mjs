import http from 'node:http';
import path from 'node:path';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const host = process.env.FLOWIZE_HOST || '0.0.0.0';
const port = Number(process.env.PORT || process.env.FLOWIZE_PORT || 3000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

if (!existsSync(distDir)) {
  console.error(`dist directory not found at ${distDir}. Run \"npm run build\" first.`);
  process.exit(1);
}

const sendFile = (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  });
  createReadStream(filePath).pipe(res);
};

const server = http.createServer((req, res) => {
  const requestUrl = req.url || '/';
  const pathname = decodeURIComponent(requestUrl.split('?')[0]);
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const candidatePath = path.join(distDir, normalizedPath.replace(/^\//, ''));
  const safeCandidatePath = path.normalize(candidatePath);

  if (!safeCandidatePath.startsWith(path.normalize(distDir))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const hasRequestedFile = existsSync(safeCandidatePath) && statSync(safeCandidatePath).isFile();
  const filePath = hasRequestedFile ? safeCandidatePath : path.join(distDir, 'index.html');

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log(`Flowize static host listening on http://${host}:${port}`);
  console.log(`Serving dist from ${distDir}`);
});
