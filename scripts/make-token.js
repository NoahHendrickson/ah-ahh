// Signs the MusicKit developer token that ships inside the app, so people can use ah ahh
// without an Apple Developer account of their own. Runs before electron-builder.
//
// The token is locked to the app's origin and expires after 90 days, so a release must ship
// at least that often (installed copies auto-update). The .p8 key never leaves this machine:
//   ~/.ahahh/AuthKey_<KEY ID>.p8   (a MusicKit key used only for public builds)
// If it's ever abused: revoke the key in the Apple Developer portal, make a new one, release.
// Skip:  SKIP_TOKEN=1 npm run dist:win   (users will need their own key)
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEAM_ID = '4WDT6B6JDX';
const ORIGIN = 'http://127.0.0.1:10770';
const TTL_SECONDS = 90 * 24 * 60 * 60;
const out = path.join(__dirname, '..', 'electron', 'token.json');

if (process.env.SKIP_TOKEN === '1') {
  fs.rmSync(out, { force: true });
  console.warn('  • SKIP_TOKEN=1, building without a built-in MusicKit token');
  process.exit(0);
}

const dir = path.join(os.homedir(), '.ahahh');
const keyFile = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => /^AuthKey_[A-Z0-9]{10}\.p8$/.test(f));
if (!keyFile) {
  console.error(`No MusicKit key found at ${dir}/AuthKey_<KEY ID>.p8 (or set SKIP_TOKEN=1).`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const input = `${encode({ alg: 'ES256', kid: keyFile.slice(8, 18) })}.${encode({ iss: TEAM_ID, iat: now, exp: now + TTL_SECONDS, origin: [ORIGIN] })}`;
const signature = crypto.sign('sha256', Buffer.from(input), { key: fs.readFileSync(path.join(dir, keyFile)), dsaEncoding: 'ieee-p1363' });

fs.writeFileSync(out, JSON.stringify({ token: `${input}.${signature.toString('base64url')}`, expiresAt: now + TTL_SECONDS }));
console.log(`  • built-in MusicKit token expires ${new Date((now + TTL_SECONDS) * 1000).toDateString()}`);
