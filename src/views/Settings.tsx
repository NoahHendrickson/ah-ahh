import { Check, Copy, ExternalLink } from '../icons';
import { useEffect, useRef, useState } from 'react';
import { applyAppearance } from '../appearance';
import { useAsync } from '../hooks';
import { mk } from '../musickit';

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <code>{value}</code>
      <button
        className="icon-btn"
        title="Copy"
        onClick={() =>
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

function AppearancePanel() {
  const [prefs, setPrefs] = useState<AhAhhPrefs | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void window.ahahh!.getPrefs().then(setPrefs);
    return () => clearTimeout(saveTimer.current);
  }, []);

  if (!prefs) return null;

  const update = (patch: Partial<AhAhhPrefs>, saveDelay = 0) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyAppearance(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void window.ahahh!.setPrefs({ glass: next.glass, glassTint: next.glassTint }), saveDelay);
  };

  return (
    <section className="panel">
      <h2>Appearance</h2>
      <div className="switch-row">
        <div>
          <div>Glass</div>
          <p className="muted small">
            {prefs.glassSupported
              ? 'Frosted, see-through window background.'
              : 'Needs Windows 11 (version 22H2 or newer).'}
          </p>
        </div>
        <button
          className={`switch ${prefs.glass && prefs.glassSupported ? 'on' : ''}`}
          role="switch"
          aria-checked={prefs.glass}
          aria-label="Glass"
          disabled={!prefs.glassSupported}
          onClick={() => update({ glass: !prefs.glass })}
        />
      </div>
      {prefs.glass && prefs.glassSupported && (
        <label className="tint-row">
          Clearer
          <input
            type="range"
            className="slider"
            min={0.15}
            max={0.95}
            step={0.01}
            value={prefs.glassTint}
            style={{ '--pct': `${((prefs.glassTint - 0.15) / 0.8) * 100}%` } as React.CSSProperties}
            onChange={(e) => update({ glassTint: Number(e.target.value) }, 300)}
          />
          Darker
        </label>
      )}
    </section>
  );
}

function RemotePanel() {
  const [pairing, setPairing] = useState<AhAhhRemotePairing | null>(null);

  useEffect(() => {
    void window.ahahh!.getRemotePairing().then(setPairing);
  }, []);

  if (!pairing) return null;

  const resetPairing = async () => {
    if (!confirm('Unpair all phones? You will need to scan the new code.')) return;
    setPairing(await window.ahahh!.resetRemotePairing());
  };

  return (
    <section className="panel">
      <h2>Phone remote</h2>
      <div className="switch-row">
        <div>
          <div>Control from your phone</div>
          <p className="muted small">Play, pause, skip and change volume from the ah ahh iPhone app on the same Wi-Fi.</p>
        </div>
        <button
          className={`switch ${pairing.enabled ? 'on' : ''}`}
          role="switch"
          aria-checked={pairing.enabled}
          aria-label="Phone remote"
          onClick={() => {
            setPairing({ ...pairing, enabled: !pairing.enabled });
            void window.ahahh!.setRemoteEnabled(!pairing.enabled).then(setPairing);
          }}
        />
      </div>
      {pairing.enabled && pairing.error && <p className="muted small">{pairing.error}</p>}
      {pairing.enabled && pairing.qr && (
        <>
          <img className="remote-qr" src={pairing.qr} alt="Pairing code" />
          <p className="muted">Scan this with the ah ahh app on your phone.</p>
          <p className="muted small">
            {pairing.hosts?.length ? pairing.hosts.map((host) => `${host}:${pairing.port}`).join(', ') : 'Not connected to a network'}
          </p>
          <p className="muted small">Windows will ask to allow ah ahh on private networks — click Allow.</p>
          <div className="actions">
            <button className="btn" onClick={resetPairing}>
              Reset pairing
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const UPDATE_LABELS: Record<AhAhhUpdateStatus, string> = {
  idle: '',
  latest: 'Up to date',
  downloading: 'Downloading update…',
  ready: 'Update ready',
  error: 'Couldn’t check for updates',
};

function UpdateStatus() {
  const [status, setStatus] = useState<AhAhhUpdateStatus>('idle');

  useEffect(() => {
    void window.ahahh!.getUpdateStatus().then(setStatus);
    return window.ahahh!.onUpdateStatus(setStatus);
  }, []);

  if (status === 'idle') return null;
  return (
    <>
      <p className="muted small">{UPDATE_LABELS[status]}</p>
      {status === 'ready' && (
        <button className="btn" onClick={() => void window.ahahh!.installUpdate()}>
          Restart to update
        </button>
      )}
    </>
  );
}

export function SettingsView() {
  const { data: info } = useAsync(() => window.ahahh!.getInfo(), []);

  const replaceKey = async () => {
    if (!confirm('Remove your saved MusicKit key? You will need to set it up again.')) return;
    await window.ahahh!.resetCredentials();
    location.reload();
  };

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <AppearancePanel />

      <section className="panel">
        <h2>Stream overlay</h2>
        <p className="muted">
          In OBS, add a <strong>Browser Source</strong> with this URL (600 × 160 works well). It updates live while ah ahh is open.
        </p>
        {info && <CopyField value={info.overlayUrl} />}
        <p className="muted small">
          Options: add <code>?hidePaused=1</code> to fade out while paused, <code>?noProgress=1</code> to hide the progress bar,{' '}
          <code>?align=right</code> to anchor right. Combine with <code>&amp;</code>.
        </p>
        {info && (
          <a className="btn" href={info.overlayUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Preview in browser
          </a>
        )}
        <h3>Plain text</h3>
        <p className="muted">For chat bots (e.g. a !song command): “Song — Artist”.</p>
        {info && <CopyField value={info.nowPlayingTextUrl} />}
      </section>

      <RemotePanel />

      <section className="panel">
        <h2>Account</h2>
        <p className="muted">Signed in to Apple Music · Storefront {mk().storefrontId?.toUpperCase()}</p>
        <div className="actions">
          <button className="btn" onClick={() => void mk().unauthorize()}>
            Sign out
          </button>
          <button className="btn ghost" onClick={replaceKey}>
            Replace MusicKit key
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>About</h2>
        <p className="muted small">ah ahh {info?.version}</p>
        <UpdateStatus />
        {info &&
          Object.values(info.widevine ?? {}).map((c) => (
            <p key={c.title} className="muted small">
              {c.title} {c.version} — {c.status}
            </p>
          ))}
      </section>
    </div>
  );
}
