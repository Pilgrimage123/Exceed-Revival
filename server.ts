import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const htmlPath = path.resolve(__dirname, 'exceed_poc.html');
const publicDir = path.resolve(__dirname, 'public');
const gameDir = path.resolve(__dirname, 'game');
const buildScriptPath = path.resolve(__dirname, 'scripts', 'build-game.mjs');

function ensureFreshGameBundle() {
  if (!fs.existsSync(gameDir) || !fs.existsSync(buildScriptPath)) return;
  execFileSync(process.execPath, [buildScriptPath], { stdio: 'inherit' });
}

ensureFreshGameBundle();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(filePath: string, method: string | undefined, res: http.ServerResponse) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end();
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const pathname = decodeURIComponent(rawUrl.split('?')[0] || '/');

  if (pathname === '/' || pathname === '/exceed_poc.html') {
    sendFile(htmlPath, req.method, res);
    return;
  }

  const candidatePath = path.resolve(publicDir, '.' + pathname);
  if (candidatePath.startsWith(publicDir + path.sep)) {
    sendFile(candidatePath, req.method, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

