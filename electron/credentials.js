const { app } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Apple allows developer tokens to live up to ~6 months. We mint a fresh one every launch.
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;

const file = () => path.join(app.getPath('userData'), 'musickit.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return null;
  }
}

/** Signs an ES256 MusicKit developer token (JWT) with the .p8 key from the Apple Developer portal. */
function sign({ teamId, keyId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const input = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: teamId, iat: now, exp: now + TOKEN_TTL_SECONDS })}`;
  const signature = crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}

function developerToken() {
  const creds = load();
  return creds ? sign(creds) : null;
}

function save(input) {
  const creds = {
    teamId: String(input?.teamId ?? '').trim().toUpperCase(),
    keyId: String(input?.keyId ?? '').trim().toUpperCase(),
    privateKey: String(input?.privateKey ?? '').trim(),
  };
  if (!/^[A-Z0-9]{10}$/.test(creds.teamId)) throw new Error('Team ID should be 10 letters/numbers.');
  if (!/^[A-Z0-9]{10}$/.test(creds.keyId)) throw new Error('Key ID should be 10 letters/numbers.');
  if (!creds.privateKey.includes('BEGIN PRIVATE KEY')) throw new Error('That does not look like a .p8 private key file.');

  let key;
  try {
    key = crypto.createPrivateKey(creds.privateKey);
  } catch {
    throw new Error('Could not read the .p8 key. Make sure you picked the file Apple gave you.');
  }
  if (key.asymmetricKeyType !== 'ec') throw new Error('MusicKit keys must be EC (ES256) keys.');

  const token = sign(creds);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(creds), { mode: 0o600 });
  return token;
}

function clear() {
  fs.rmSync(file(), { force: true });
}

module.exports = { developerToken, save, clear };
