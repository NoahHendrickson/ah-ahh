// electron-builder afterSign hook: Widevine VMP-sign the packaged app with castlabs EVS.
// Must run after electron-builder's own edits to the exe (fuses, version info, icon), so not
// afterPack: any later change to the exe invalidates the signature.
// Apple's license servers may refuse to hand out keys to an unsigned Widevine client,
// so unsigned builds can show your library but fail to actually play songs.
//
// One-time setup:  pip3 install --upgrade castlabs-evs && python3 -m castlabs_evs.account signup
// Skip signing:    SKIP_VMP=1 npm run dist:win
const { execFileSync } = require('node:child_process');

exports.default = async function vmpSign(context) {
  if (process.env.SKIP_VMP === '1') {
    console.warn('  • SKIP_VMP=1, leaving build unsigned for Widevine (playback may fail)');
    return;
  }
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
  console.log(`  • VMP signing ${context.appOutDir}`);
  execFileSync(python, ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], { stdio: 'inherit' });
  execFileSync(python, ['-m', 'castlabs_evs.vmp', 'verify-pkg', context.appOutDir], { stdio: 'inherit' });
};
