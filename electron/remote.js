const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** The pairing token, kept in its own file so paired phones keep working across launches. */
function readToken(file) {
  try {
    const { token } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (token) return token;
  } catch {
    // Missing or unreadable: make a new one.
  }
  return resetToken(file);
}

function resetToken(file) {
  const token = crypto.randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token }));
  return token;
}

/**
 * What the phone sees. The phone's clock differs from ours, so instead of updatedAt it gets
 * the position as of the moment we send it, and extrapolates from there while playing.
 */
function remoteState(s) {
  const durationMs = s.durationMs || 0;
  const elapsed = s.playing && s.updatedAt ? Date.now() - s.updatedAt : 0;
  return {
    playing: !!s.playing,
    title: s.title ?? null,
    artist: s.artist ?? '',
    album: s.album ?? '',
    artwork: s.artwork ?? null,
    durationMs,
    positionMs: Math.max(0, Math.min(durationMs, (s.positionMs || 0) + elapsed)),
    volume: s.volume ?? 1,
    shuffle: !!s.shuffle,
    repeat: s.repeat ?? 0,
  };
}

/** Checks a command from the phone; returns the cleaned-up command, or null if it's invalid. */
function parseCommand(body) {
  const { action, value } = body ?? {};
  switch (action) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'next':
    case 'previous':
      return { action };
    case 'seek':
      return Number.isFinite(value) && value >= 0 ? { action, value } : null;
    case 'volume':
      return Number.isFinite(value) ? { action, value: Math.min(1, Math.max(0, value)) } : null;
    case 'shuffle':
      return typeof value === 'boolean' ? { action, value } : null;
    case 'repeat':
      return [0, 1, 2].includes(value) ? { action, value } : null;
    default:
      return null;
  }
}

/**
 * LAN HTTP server for the phone remote (only runs while enabled in Settings):
 *  - GET /v1/info, GET /v1/state
 *  - GET /v1/events streams the state over Server-Sent Events
 *  - POST /v1/command { action, value } is handed to `command`, which returns false if it can't run it
 * Every request needs "Authorization: Bearer <token>".
 */
function startRemote({ port, token, info, state, command }) {
  const expected = Buffer.from(`Bearer ${token}`);
  const clients = new Set();
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const given = Buffer.from(req.headers.authorization ?? '');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return json(res, 401, { error: 'unauthorized' });

    const route = `${req.method} ${new URL(req.url, 'http://localhost').pathname}`;

    if (route === 'GET /v1/info') return json(res, 200, info);
    if (route === 'GET /v1/state') return json(res, 200, remoteState(state));

    if (route === 'GET /v1/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(remoteState(state))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (route === 'POST /v1/command') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4096) req.destroy();
      });
      req.on('end', () => {
        let cmd = null;
        try {
          cmd = parseCommand(JSON.parse(body));
        } catch {
          // Bad JSON.
        }
        if (!cmd) return json(res, 400, { error: 'bad command' });
        if (!command(cmd)) return json(res, 503, { error: 'player unavailable' });
        res.writeHead(204).end();
      });
      return;
    }

    json(res, 404, { error: 'not found' });
  });

  // Keeps idle connections from being dropped by the phone or the network.
  const ping = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n');
  }, 15_000);

  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      clearInterval(ping);
      reject(err);
    });
    server.listen(port, '0.0.0.0', () => {
      server.on('error', (err) => console.error('Phone remote server error:', err));
      resolve({
        publish(next) {
          state = next;
          if (!clients.size) return;
          const message = `data: ${JSON.stringify(remoteState(state))}\n\n`;
          for (const client of clients) client.write(message);
        },
        close() {
          clearInterval(ping);
          for (const client of clients) client.end();
          clients.clear();
          return new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          });
        },
      });
    });
  });
}

module.exports = { readToken, resetToken, startRemote };
