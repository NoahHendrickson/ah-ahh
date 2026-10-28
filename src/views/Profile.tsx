import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { useAsync } from '../hooks';
import { mk, OWN_KEY_SETUP } from '../musickit';
import { refreshProfile, useProfile } from '../profile';

export function ProfileView() {
  const profile = useProfile();
  useEffect(refreshProfile, []);
  const { data: keyStatus } = useAsync(() => window.ahahh!.getKeyStatus(), []);

  const removeKey = async () => {
    const fallback = keyStatus?.builtIn === 'valid' ? 'ah ahh will use its built-in key.' : 'You will need to set one up again.';
    if (!confirm(`Remove your MusicKit key? ${fallback}`)) return;
    await window.ahahh!.resetCredentials();
    location.reload();
  };

  const useOwnKey = () => {
    sessionStorage.setItem(OWN_KEY_SETUP, '1');
    location.reload();
  };

  return (
    <div className="page">
      <div className="profile-header">
        <Avatar profile={profile} size={96} />
        <h1>{profile?.name}</h1>
      </div>

      <section className="panel">
        <h2>Account</h2>
        <p className="muted">
          Signed in to Apple Music · Storefront {mk().storefrontId?.toUpperCase()}
          {keyStatus && ` · ${keyStatus.ownKey ? 'Your own' : 'Built-in'} MusicKit key`}
        </p>
        <div className="actions">
          <button className="btn" onClick={() => void mk().unauthorize()}>
            Sign out
          </button>
          {keyStatus?.ownKey ? (
            <button className="btn ghost" onClick={removeKey}>
              Remove your MusicKit key
            </button>
          ) : (
            <button className="btn ghost" onClick={useOwnKey}>
              Use your own MusicKit key
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
