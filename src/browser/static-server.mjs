/**
 * Zero-dependency local HTTP static file server for auditing local HTML files
 * or static build folders (dist/, build/, out/, public/).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export async function startStaticServer(targetPath) {
  const absPath = path.resolve(targetPath);
  const stat = fs.statSync(absPath);
  const rootDir = stat.isDirectory() ? absPath : path.dirname(absPath);
  const entryFile = stat.isDirectory() ? 'index.html' : path.basename(absPath);

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath === '/') relPath = '/' + entryFile;

    const filePath = path.resolve(rootDir, '.' + relPath);
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let resolved = filePath;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = path.join(resolved, 'index.html');
    }

    if (!fs.existsSync(resolved)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/${entryFile === 'index.html' ? '' : encodeURIComponent(entryFile)}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
