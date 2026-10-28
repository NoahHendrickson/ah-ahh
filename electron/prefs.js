const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULTS = { glass: true, glassTint: 0.55 };

const file = () => path.join(app.getPath('userData'), 'prefs.json');

let cache = null;

function get() {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  return cache;
}

function set(patch) {
  const next = { ...get() };
  if (typeof patch?.glass === 'boolean') next.glass = patch.glass;
  if (Number.isFinite(patch?.glassTint)) next.glassTint = Math.min(0.95, Math.max(0.15, patch.glassTint));
  cache = next;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next));
  return next;
}

/** Frosted window backgrounds: macOS vibrancy, or Windows 11 22H2+ (build 22621) acrylic. */
function glassSupported() {
  if (process.platform === 'darwin') return true;
  if (process.platform === 'win32') return Number(os.release().split('.')[2]) >= 22621;
  return false;
}

module.exports = { get, set, glassSupported };
