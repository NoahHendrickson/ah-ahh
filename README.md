# ah ahh

A lightweight Apple Music player for Windows that doesn't block game capture.

Apple's own Windows app plays through PlayReady protected media, so NVIDIA Instant
Replay, AMD ReLive, Xbox Game Bar, and sometimes OBS shut off or record silence while
it's playing. ah ahh plays the same Apple Music catalog through MusicKit JS and Widevine
inside Electron (the same approach as Cider), which Windows doesn't treat as protected
playback.

**Features:** your library (songs, albums, playlists), full Apple Music search, artist
pages, play/shuffle/repeat/queue, "Play next", add to library, Windows media keys and the
media flyout, and a live **"Now Playing" overlay for OBS**.

---

## 1. One-time Apple setup (needs the Apple Developer Program, $99/yr)

1. **Media ID**: [Identifiers](https://developer.apple.com/account/resources/identifiers/list/mediaId)
   → **+** → *Media IDs* → any description, identifier like `media.dev.yourname.ahahh`.
2. **Key**: [Keys](https://developer.apple.com/account/resources/authkeys/list) → **+** →
   tick **Media Services (MusicKit, ShazamKit, Apple Music Feed)** → *Configure* → pick your
   Media ID → *Continue / Register* → **Download** the `AuthKey_XXXXXXXXXX.p8` file.
   You can only download it once, so keep it safe.
3. Note your **Team ID** from the [Membership page](https://developer.apple.com/account#MembershipDetailsCard).

The first time ah ahh starts, it asks for the Team ID, Key ID, and `.p8` file. It stores
them in the app's data folder (`%APPDATA%\ah ahh\musickit.json`) and signs a fresh
developer token on every launch. The key never leaves your PC.

## 2. One-time castlabs setup (free, needed for playback)

ah ahh uses [castlabs' Electron build](https://github.com/castlabs/electron-releases),
which includes Widevine. Apple's license servers may refuse to play songs in an app that
isn't Widevine-signed (VMP). The signing service is free:

```sh
pip3 install --upgrade castlabs-evs
python3 -m castlabs_evs.account signup     # creates your free account (once)
```

`npm run dist:win` then signs the build automatically (see `scripts/vmp-sign.js`).

## 3. Run it

Requires Node 20+.

```sh
npm install
npm start          # build the UI and launch the app
npm run dev        # hot-reload UI development
```

When developing, sign the dev Electron once, or playback may fail even though browsing works:

```sh
npm run vmp:sign-dev
```

## 4. Build the Windows installer

```sh
npm run dist:win               # → release/ah-ahh-Setup-0.1.0.exe
SKIP_VMP=1 npm run dist:win    # build without Widevine signing (playback may fail)
```

This works from macOS too. Copy `release/ah-ahh-Setup-0.1.0.exe` to the Windows PC and
run it, or download it from [Releases](https://github.com/NoahHendrickson/ah-ahh/releases).
The installer isn't code-signed, so SmartScreen will warn: click **More info → Run anyway**.

### Publishing an update

Installed copies check GitHub Releases on launch and every few hours, download new versions
in the background, and install them on quit (or via **Settings → Restart to update**).

```sh
npm version patch       # bump the version (0.1.0 → 0.1.1) and tag it
git push --follow-tags
npm run release:win     # build, sign, and publish the GitHub release (uses `gh`)
```

---

## Stream overlay (OBS)

While ah ahh is open it serves a local overlay:

| URL | Use |
| --- | --- |
| `http://127.0.0.1:10770/overlay` | OBS **Browser Source**, 600 × 160. Album art, title, artist, live progress. |
| `…/overlay?hidePaused=1&align=right` | Options: `hidePaused=1`, `noProgress=1`, `align=right` |
| `http://127.0.0.1:10770/now-playing.txt` | `Song — Artist` as plain text (chat bots, text sources) |
| `http://127.0.0.1:10770/now-playing.json` | Full state as JSON |

These URLs are also in **Settings** inside the app.

## Phone remote

Control playback (play/pause, skip, seek, volume, shuffle, repeat) from the ah ahh iPhone
app on the same Wi-Fi. It's off by default: turn on **Settings → Phone remote** and scan
the QR code with the phone app. The first time, Windows Firewall asks about ah ahh: allow
it on **private** networks.

While it's on, ah ahh listens on port `10771` on your local network (the app's own server
on `10770` stays local-only). Every request needs the pairing token from the QR code;
**Reset pairing** makes a new one and disconnects every paired phone.

## How it fits together

```
electron/main.js         window, Widevine startup, Apple sign-in popup, IPC
electron/credentials.js  stores your MusicKit key, signs ES256 developer tokens
electron/server.js       127.0.0.1:10770, serves the UI, overlay, and now-playing feeds
electron/overlay.html    the OBS overlay (self-contained)
electron/remote.js       LAN server for the phone remote (port 10771, only while enabled)
src/musickit.ts          MusicKit JS loader, API helpers, playback helpers
src/player.tsx           player state, media keys / SMTC, now-playing broadcast
src/views/*              Home, Search, Songs, Albums, Playlists, Album/Playlist, Artist, Settings
```

The UI is served from `http://127.0.0.1:10770` rather than `file://` because MusicKit needs
a real web origin. The port is fixed because Apple Music keeps your sign-in per origin.

## Troubleshooting

- **Browsing works but songs won't play:** the build isn't VMP-signed. Run the castlabs
  setup above and rebuild (or `npm run vmp:sign-dev` in dev).
- **"Port 10770 is already in use":** another copy of ah ahh (or something else) is running.
- **Instant Replay still turns off:** make sure nothing else is playing protected content
  (Netflix in Edge, the Apple Music app). ah ahh itself uses software Widevine.
- **Running from a terminal inside VS Code or another Electron app:** if `npm start`
  crashes with `Cannot read properties of undefined (reading 'userAgentFallback')`, that
  terminal set `ELECTRON_RUN_AS_NODE=1`. Run `unset ELECTRON_RUN_AS_NODE` first.

## iPhone remote

The phone app lives in `ios/` (SwiftUI, no dependencies, iOS 17+). To install it on your iPhone:

1. Open `ios/AhAhhRemote.xcodeproj` in Xcode. If Xcode offers to install extra components, let it.
2. **Xcode → Settings → Accounts**: sign in with the Apple ID for team `4WDT6B6JDX`.
3. Plug in the iPhone and trust the Mac. On the phone, turn on **Settings → Privacy & Security
   → Developer Mode** and restart when it asks.
4. Pick the iPhone as the run destination and press **Run** (⌘R).
5. On the PC, turn on **Settings → Phone remote**, then scan the code with the app (or the
   Camera app). When iOS asks to find devices on your local network, tap **Allow**. If you
   tapped Don't Allow, turn it back on in **Settings → ah ahh → Local Network**.
