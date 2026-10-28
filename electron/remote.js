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
    queueRevision: s.queueRevision ?? 0,
    favorite: s.favorite ?? null,
  };
}

const CONTAINER_TYPES = ['albums', 'library-albums', 'playlists', 'library-playlists', 'stations'];
const SONG_TYPES = ['songs', 'library-songs'];
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isIndex = (v) => Number.isInteger(v) && v >= 0;

/** The optional startWith/shuffle of the play commands, or null if either is invalid. */
function playOptions(value) {
  const startWith = value.startWith ?? 0;
  const shuffle = value.shuffle ?? undefined;
  return isIndex(startWith) && [undefined, true, false].includes(shuffle) ? { startWith, shuffle } : null;
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
    case 'playItem': {
      const options = playOptions(value ?? {});
      if (!options || !isId(value?.id) || ![...CONTAINER_TYPES, ...SONG_TYPES].includes(value.type)) return null;
      return { action, value: { type: value.type, id: value.id, ...options } };
    }
    case 'playSongs': {
      const options = playOptions(value ?? {});
      const ids = value?.ids;
      if (!options || !Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(isId)) return null;
      return { action, value: { ids, ...options, startWith: Math.min(options.startWith, ids.length - 1) } };
    }
    case 'playNext':
      return isId(value?.id) && SONG_TYPES.includes(value.type) ? { action, value: { id: value.id, type: value.type } } : null;
    case 'jumpTo':
    case 'removeFromQueue':
      return isIndex(value) ? { action, value } : null;
    case 'moveInQueue':
      return isIndex(value?.from) && isIndex(value?.to) ? { action, value: { from: value.from, to: value.to } } : null;
    case 'favorite':
      return typeof value === 'boolean' ? { action, value } : null;
    default:
      return null;
  }
}

// Apple Music API paths the phone may read through us: the catalog and the user's library,
// recommendations and history. Also refuses anything URL parsing could turn into "..".
const MUSIC_PATH = /^\/v1\/(catalog\/(\{storefront\}|[a-z]{2})|me\/library|me\/recommendations|me\/recent|me\/history)(\/|\?|$)/;
const isMusicPath = (p) => MUSIC_PATH.test(p) && !/\.\.|#|%2e|\\/i.test(p);
const isParams = (p) =>
  p === undefined || (typeof p === 'object' && p !== null && !Array.isArray(p) && Object.values(p).every((v) => ['string', 'number', 'boolean'].includes(typeof v)));

/** Reads a JSON body of at most `limit` characters; `done` gets undefined if it isn't valid JSON. */
function readJson(req, limit, done) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > limit) req.destroy();
  });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Bad JSON.
    }
    done(parsed);
  });
}

/**
 * LAN HTTP server for the phone remote (only runs while enabled in Settings):
 *  - GET /v1/info, GET /v1/state
 *  - GET /v1/events streams the state over Server-Sent Events
 *  - POST /v1/command { action, value } is handed to `command`, which returns false if it can't run it
 *  - GET /v1/queue and POST /v1/music { path, params } (a read-only Apple Music API call) are answered
 *    by the player through `request`, which resolves { status, body }
 * Every request needs "Authorization: Bearer <token>".
 */
function startRemote({ port, token, info, state, command, request }) {
  const expected = Buffer.from(`Bearer ${token}`);
  const clients = new Set();
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const answer = (res, question) => request(question).then(({ status, body }) => json(res, status, body));

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
      // Big enough for playSongs with 500 IDs.
      return readJson(req, 64 * 1024, (body) => {
        const cmd = parseCommand(body);
        if (!cmd) return json(res, 400, { error: 'bad command' });
        if (!command(cmd)) return json(res, 503, { error: 'player unavailable' });
        res.writeHead(204).end();
      });
    }

    if (route === 'GET /v1/queue') return answer(res, { kind: 'queue' });

    if (route === 'POST /v1/music') {
      return readJson(req, 8192, (body) => {
        const { path, params } = body ?? {};
        if (typeof path !== 'string' || !isParams(params ?? undefined)) return json(res, 400, { error: 'bad request' });
        if (!isMusicPath(path)) return json(res, 400, { error: 'path not allowed' });
        answer(res, { kind: 'music', path, params: params ?? undefined });
      });
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
