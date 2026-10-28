import { Key, Logo, Upload } from '../icons';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage, mk } from '../musickit';
import { Spinner } from './Status';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="screen">
      <div className="drag screen-drag" />
      <div className="screen-card">
        <div className="logo big">
          <Logo />
          ah ahh
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <Centered>
      <Spinner label={label} />
    </Centered>
  );
}

export function ErrorScreen({ error, onRetry, onReplaceKey }: { error: unknown; onRetry(): void; onReplaceKey?(): void }) {
  return (
    <Centered>
      <p className="error-text">{errorMessage(error)}</p>
      <div className="actions center">
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
        {onReplaceKey && (
          <button className="btn ghost" onClick={onReplaceKey}>
            Replace MusicKit key
          </button>
        )}
      </div>
    </Centered>
  );
}

export function SignInScreen() {
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await mk().authorize();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Centered>
      <p className="muted">Sign in with the Apple ID that has your Apple Music subscription.</p>
      <button className="btn primary wide" disabled={busy} onClick={signIn}>
        {busy ? 'Waiting for Apple…' : 'Sign in to Apple Music'}
      </button>
      {error ? <p className="error-text">{errorMessage(error)}</p> : null}
    </Centered>
  );
}

/**
 * Collects your own MusicKit key from the Apple Developer portal (stored locally by the main process).
 * Release builds ship with a built-in key, so this only shows when you ask for it, when that key has
 * expired, or in builds without one.
 */
export function SetupScreen({ onSaved, onCancel, expired }: { onSaved(token: string): void; onCancel?(): void; expired?: boolean }) {
  const [teamId, setTeamId] = useState('');
  const [keyId, setKeyId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const pickFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setPrivateKey(await file.text());
    // Apple names the file AuthKey_<KEYID>.p8; prefill the Key ID from it.
    const match = file.name.match(/AuthKey_([A-Z0-9]{10})\.p8$/i);
    if (match && !keyId) setKeyId(match[1].toUpperCase());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      onSaved(await window.ahahh!.saveCredentials({ teamId, keyId, privateKey }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Centered>
      {expired && (
        <p className="error-text">
          This copy of ah ahh is too old to connect to Apple Music. Restart it to finish updating, or{' '}
          <a href="https://github.com/NoahHendrickson/ah-ahh/releases/latest" target="_blank" rel="noreferrer">
            download the latest version
          </a>
          . You can also use your own MusicKit key:
        </p>
      )}
      <h2 className="setup-title">
        <Key /> Connect your MusicKit key
      </h2>
      <ol className="setup-steps muted">
        <li>
          In the{' '}
          <a href="https://developer.apple.com/account/resources/identifiers/list/mediaId" target="_blank" rel="noreferrer">
            Apple Developer portal
          </a>
          , create a <strong>Media ID</strong> (Identifiers → +).
        </li>
        <li>
          Under{' '}
          <a href="https://developer.apple.com/account/resources/authkeys/list" target="_blank" rel="noreferrer">
            Keys
          </a>
          , create a key with <strong>Media Services</strong> enabled and download the <code>.p8</code> file.
        </li>
        <li>
          Your Team ID is on the{' '}
          <a href="https://developer.apple.com/account#MembershipDetailsCard" target="_blank" rel="noreferrer">
            Membership page
          </a>
          .
        </li>
      </ol>
      <form className="setup-form" onSubmit={submit}>
        <label>
          Team ID
          <input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="ABCDE12345" maxLength={10} spellCheck={false} />
        </label>
        <label>
          Key ID
          <input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="XYZ9876543" maxLength={10} spellCheck={false} />
        </label>
        <label className="file-pick">
          <Upload />
          <span>{fileName || 'Choose your AuthKey_XXXXXXXXXX.p8 file'}</span>
          <input type="file" accept=".p8" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary wide" type="submit" disabled={!teamId || !keyId || !privateKey}>
          Save and continue
        </button>
        {onCancel && (
          <button className="btn ghost wide" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <p className="muted small">The key is stored only on this computer and is used to talk to Apple Music.</p>
      </form>
    </Centered>
  );
}
