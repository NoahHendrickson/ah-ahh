import { Back } from './icons';
import { useEffect, useRef, useState } from 'react';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { ErrorScreen, LoadingScreen, SetupScreen, SignInScreen } from './components/Screens';
import { Sidebar } from './components/Sidebar';
import { LibraryProvider } from './library';
import { initMusicKit, mk, PLAY_STARTED, preloadMusicKit } from './musickit';
import { NavigationProvider, useNav } from './navigation';
import { PlayerProvider } from './player';
import { ArtistView } from './views/Artist';
import { CollectionView } from './views/Collection';
import { HomeView } from './views/Home';
import { AlbumsView, PlaylistsView, SongsView } from './views/Library';
import { SearchView } from './views/Search';
import { SettingsView } from './views/Settings';

type Phase = { name: 'loading' } | { name: 'setup' } | { name: 'signin' } | { name: 'ready' } | { name: 'error'; error: unknown };

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!window.ahahh) {
      setPhase({ name: 'error', error: 'Open ah ahh through the desktop app, not a regular browser.' });
      return;
    }
    let cancelled = false;
    const onAuthChange = () => setPhase(mk().isAuthorized ? { name: 'ready' } : { name: 'signin' });

    (async () => {
      // Download MusicKit while the token is fetched; initMusicKit reports any load error.
      preloadMusicKit().catch(() => {});
      const token = await window.ahahh!.getDeveloperToken();
      if (cancelled) return;
      if (!token) return setPhase({ name: 'setup' });
      const music = await initMusicKit(token);
      if (cancelled) return;
      music.addEventListener('authorizationStatusDidChange', onAuthChange);
      onAuthChange();
    })().catch((error) => !cancelled && setPhase({ name: 'error', error }));

    return () => {
      cancelled = true;
      try {
        mk().removeEventListener('authorizationStatusDidChange', onAuthChange);
      } catch {
        // MusicKit never configured.
      }
    };
  }, [attempt]);

  const retry = () => {
    setPhase({ name: 'loading' });
    setAttempt((n) => n + 1);
  };

  const replaceKey = async () => {
    await window.ahahh?.resetCredentials();
    location.reload();
  };

  switch (phase.name) {
    case 'loading':
      return <LoadingScreen label="Connecting to Apple Music…" />;
    case 'setup':
      return <SetupScreen onSaved={retry} />;
    case 'error':
      return <ErrorScreen error={phase.error} onRetry={retry} onReplaceKey={window.ahahh ? replaceKey : undefined} />;
    case 'signin':
      return <SignInScreen />;
    case 'ready':
      return (
        <PlayerProvider>
          <LibraryProvider>
            <NavigationProvider>
              <Shell />
            </NavigationProvider>
          </LibraryProvider>
        </PlayerProvider>
      );
  }
}

function Shell() {
  const [queueOpen, setQueueOpen] = useState(false);

  // Starting something new opens Up Next; auto-advancing songs doesn't, so closing it sticks.
  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener(PLAY_STARTED, open);
    return () => window.removeEventListener(PLAY_STARTED, open);
  }, []);
  const { pageKey, canGoBack, back } = useNav();
  const scroller = useRef<HTMLElement>(null);

  // New page → start at the top (not on in-place route updates like typing a search).
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pageKey]);

  return (
    <div className={`app platform-${window.ahahh?.platform} ${queueOpen ? 'with-queue' : ''}`}>
      <Sidebar />
      {/* Sits over the top of <main> (same grid cell) rather than inside it, so the
          scrolling content can fade out beneath it in glass mode. */}
      <div className="topbar drag">
        <button className="icon-btn no-drag" title="Back" disabled={!canGoBack} onClick={back}>
          <Back />
        </button>
      </div>
      <main className="main" ref={scroller}>
        {/* Re-keyed per page so each page plays its enter animation. */}
        <div key={pageKey} className="page-enter">
          <View />
        </div>
      </main>
      <QueuePanel open={queueOpen} />
      <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((o) => !o)} />
    </div>
  );
}

function View() {
  const { route } = useNav();
  switch (route.view) {
    case 'home':
      return <HomeView />;
    case 'search':
      return <SearchView initialTerm={route.term} />;
    case 'songs':
      return <SongsView />;
    case 'albums':
      return <AlbumsView />;
    case 'playlists':
      return <PlaylistsView />;
    case 'collection':
      return <CollectionView key={route.item.id} item={route.item} />;
    case 'artist':
      return <ArtistView key={route.id} id={route.id} name={route.name} />;
    case 'settings':
      return <SettingsView />;
  }
}
