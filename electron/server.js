const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/**
 * For the app's pages: scripts only from here and Apple's MusicKit CDN. Media, images, fonts and API calls come
 * from many Apple hosts and blob: URLs, so nothing else is restricted. Workers would otherwise fall back to
 * script-src, which would block blob: workers (HLS playback can use them).
 */
const APP_CSP = {
  'content-security-policy': "script-src 'self' https://js-cdn.music.apple.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'",
};

function sendFile(res, file, headers) {
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', ...headers });
    res.end(body);
  });
}

/**
 * Local-only HTTP server that:
 *  - serves the built app UI (MusicKit needs a real http origin, not file://)
 *  - serves the OBS "Now Playing" overlay at /overlay
 *  - streams now-playing updates to the overlay over Server-Sent Events
 *  - exposes /now-playing.json and /now-playing.txt for other tools
 */
function startServer({ port, rendererDir, overlayFile }) {
  let state = { playing: false, title: null };
  const clients = new Set();

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const open = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

    if (pathname === '/overlay') return sendFile(res, overlayFile);

    if (pathname === '/now-playing.json') {
      res.writeHead(200, { ...open, 'content-type': 'application/json' });
      return res.end(JSON.stringify(state));
    }

    if (pathname === '/now-playing.txt') {
      res.writeHead(200, { ...open, 'content-type': 'text/plain; charset=utf-8' });
      return res.end(state.title ? `${state.title} — ${state.artist}` : '');
    }

    if (pathname === '/now-playing/events') {
      res.writeHead(200, { ...open, 'content-type': 'text/event-stream', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Static app files, falling back to index.html.
    let relative;
    try {
      relative = path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
    } catch {
      // Malformed percent-encoding such as "/%zz".
      return res.writeHead(400).end();
    }
    const file = path.join(rendererDir, relative);
    if (!file.startsWith(rendererDir)) return res.writeHead(403).end();
    fs.stat(file, (err, stat) => {
      const target = !err && stat.isFile() ? file : path.join(rendererDir, 'index.html');
      sendFile(res, target, path.extname(target) === '.html' ? APP_CSP : undefined);
    });
  });

  // Keep idle SSE connections (OBS browser sources) from being dropped.
  setInterval(() => {
    for (const client of clients) client.write(': ping\n\n');
  }, 25_000).unref();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        publish(next) {
          state = next;
          const message = `data: ${JSON.stringify(state)}\n\n`;
          for (const client of clients) client.write(message);
        },
      }),
    );
  });
}

module.exports = { startServer };
