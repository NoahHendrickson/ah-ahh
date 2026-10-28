const { nativeImage } = require('electron');
const { execFile } = require('node:child_process');
const os = require('node:os');

/** Reads one attribute of the Mac user's account record; '' if it isn't set. */
const readAccount = (attribute) =>
  new Promise((resolve) =>
    execFile('dscl', ['.', '-read', `/Users/${os.userInfo().username}`, attribute], { maxBuffer: 16 << 20 }, (err, out) =>
      resolve(err ? '' : out.slice(out.indexOf(':') + 1).trim()),
    ),
  );

/**
 * The computer account's name and picture. MusicKit doesn't expose the Apple Account's name or photo,
 * but the Mac account picture is the Apple Account photo when you're signed in to iCloud.
 * Read fresh each time, so a changed name or picture shows up (the renderer decides when to ask).
 */
async function read() {
  const fallback = { name: os.userInfo().username, photo: null };
  if (process.platform !== 'darwin') return fallback;
  const [name, jpeg] = await Promise.all([readAccount('RealName'), readAccount('JPEGPhoto')]);
  const image = nativeImage.createFromBuffer(Buffer.from(jpeg.replace(/\s+/g, ''), 'hex'));
  return { name: name || fallback.name, photo: image.isEmpty() ? null : image.resize({ width: 192, quality: 'best' }).toDataURL() };
}

module.exports = { read };
