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

## Install

Download the installer from [Releases](https://github.com/NoahHendrickson/ah-ahh/releases/latest),
run it, and sign in with the Apple ID that has your Apple Music subscription. That's it: release
builds include a MusicKit developer token, so you don't need an Apple Developer account.

---

## 1. MusicKit key (for building)

Apple Music needs a developer token signed with a MusicKit key from the Apple Developer Program
($99/yr). Make one: a **Media ID** under
[Identifiers](https://developer.apple.com/account/resources/identifiers/list/mediaId), then a key
under [Keys](https://developer.apple.com/account/resources/authkeys/list) with **Media Services**
enabled and configured for that Media ID. **Download** the `AuthKey_XXXXXXXXXX.p8` file (once only).

- **Release builds** sign a token with the key at `~/.ahahh/AuthKey_<KEY ID>.p8` and bundle it
  (`scripts/make-token.js`). The token is locked to the app's origin (`http://127.0.0.1:10770`)
  and expires after 90 days, so release at least that often; installed copies update
  themselves. The `.p8` itself never ships. Use a key dedicated to public builds: if it's ever
  abused, revoke it in the portal, make a new one, and release.
- **Your own key:** without a built-in token (dev builds, `SKIP_TOKEN=1`), or via **Settings →
  Use your own MusicKit key**, ah ahh asks for your Team ID, Key ID, and `.p8`. They're stored only
  in the app's data folder (`%APPDATA%\ah ahh\musickit.json`) and take priority over the built-in
  token.

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

The phone can also browse your Apple Music (search, library, home) and start playback, see the
queue, and favorite the playing song. It never talks to Apple itself: ah ahh makes those read-only
Apple Music API calls for it, limited to the catalog and your library, recommendations and history.

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

The phone app lives in `ios/` (SwiftUI, no dependencies, iOS 17+) and is installed through
**TestFlight**: get the TestFlight app on the iPhone, accept the invite, and tap **Install**.
TestFlight then keeps it updated. It has Home, Search and Library tabs like the desktop app (tap
any song, album or playlist to play it on the PC), a mini player, and a full Now Playing screen
with Up Next and favorites.

To publish a new build:

```sh
npm run release:ios   # archive, sign, and upload to TestFlight (see scripts/release-ios.sh)
```

This needs an App Store Connect API key (App Manager role) at
`~/.appstoreconnect/private_keys/AuthKey_<KEY ID>.p8`, its Issuer ID in
`~/.appstoreconnect/issuer_id`, and the "Apple Distribution" certificate in the login keychain
with the "ah ahh Remote App Store" provisioning profile installed. TestFlight builds expire after
90 days, so publish at least that often.

To pair, turn on **Settings → Phone remote** on the PC, then scan the code with the app (or the
Camera app). When iOS asks to find devices on your local network, tap **Allow**. If you tapped
Don't Allow, turn it back on in **Settings → ah ahh → Local Network**.
