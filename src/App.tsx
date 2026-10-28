import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { ErrorScreen, LoadingScreen, SetupScreen, SignInScreen } from './components/Screens';
import { Sidebar } from './components/Sidebar';
import { LibraryProvider } from './library';
import { initMusicKit, mk, OWN_KEY_SETUP, PLAY_STARTED, preloadMusicKit } from './musickit';
import { NavigationProvider, useNav } from './navigation';
import { PlayerProvider } from './player';
import { ArtistView } from './views/Artist';
import { CollectionView } from './views/Collection';
import { HomeView } from './views/Home';
import { AlbumsView, PlaylistsView, SongsView } from './views/Library';
import { ProfileView } from './views/Profile';
import { SearchView } from './views/Search';
import { SettingsView } from './views/Settings';

type Phase = { name: 'loading' } | { name: 'setup'; expired?: boolean; cancelable?: boolean } | { name: 'signin' } | { name: 'ready' } | { name: 'error'; error: unknown };

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
      // Settings → "Use your own MusicKit key" reloads into setup.
      if (sessionStorage.getItem(OWN_KEY_SETUP)) return setPhase({ name: 'setup', cancelable: true });
      const token = await window.ahahh!.getDeveloperToken();
      if (cancelled) return;
      if (!token) {
        const { builtIn } = await window.ahahh!.getKeyStatus();
        return !cancelled && setPhase({ name: 'setup', expired: builtIn === 'expired' });
      }
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
    sessionStorage.removeItem(OWN_KEY_SETUP);
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
      return <SetupScreen onSaved={retry} onCancel={phase.cancelable ? retry : undefined} expired={phase.expired} />;
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

  // Starting something new opens the queue; auto-advancing songs doesn't, so closing it sticks.
  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener(PLAY_STARTED, open);
    return () => window.removeEventListener(PLAY_STARTED, open);
  }, []);
  const { pageKey } = useNav();
  const scroller = useRef<HTMLElement>(null);
  // Set once; the resizers change these on the element directly while dragging.
  const [widths] = useState(() => ({ '--sidebar-w': `${paneWidth('sidebar')}px`, '--queue-w': `${paneWidth('queue')}px` }) as CSSProperties);

  // New page → start at the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pageKey]);

  return (
    <div className={`app platform-${window.ahahh?.platform} ${queueOpen ? 'with-queue' : ''}`} style={widths}>
      <Sidebar />
      <Resizer pane="sidebar" />
      {/* Window drag strip over the top of <main> (same grid cell) rather than inside it,
          so the scrolling content can fade out beneath it in glass mode. */}
      <div className="topbar drag" />
      <main className="main" ref={scroller}>
        {/* Re-keyed per page so each page plays its enter animation. */}
        <div key={pageKey} className="page-enter">
          <View />
        </div>
      </main>
      <QueuePanel open={queueOpen} />
      {queueOpen && <Resizer pane="queue" />}
      <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((o) => !o)} />
    </div>
  );
}

/** How wide each side panel can be dragged, saved across launches. */
const PANES = {
  sidebar: { min: 180, max: 320, initial: 236 },
  queue: { min: 260, max: 440, initial: 320 },
};
type Pane = keyof typeof PANES;

function paneWidth(pane: Pane) {
  const { min, max, initial } = PANES[pane];
  const saved = Number(localStorage.getItem(`ahahh.${pane}Width`) ?? initial);
  return Number.isFinite(saved) ? Math.min(Math.max(saved, min), max) : initial;
}

/** Drag a panel's inner edge to resize it; double-click to put it back. */
function Resizer({ pane }: { pane: Pane }) {
  const resize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget;
    const app = handle.parentElement!;
    const style = getComputedStyle(app);
    const from = parseFloat(style.getPropertyValue(`--${pane}-w`));
    const other = parseFloat(style.getPropertyValue(pane === 'sidebar' ? '--queue-w' : '--sidebar-w'));
    // Leave the page in the middle at least 360px.
    const max = Math.max(Math.min(PANES[pane].max, innerWidth - other - 360), from);
    const sign = pane === 'sidebar' ? 1 : -1;
    let width = from;
    handle.setPointerCapture(e.pointerId);
    app.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      width = Math.round(Math.min(Math.max(from + sign * (ev.clientX - e.clientX), PANES[pane].min), max));
      app.style.setProperty(`--${pane}-w`, `${width}px`);
    };
    // Fires after pointerup and pointercancel alike.
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('lostpointercapture', end);
      app.classList.remove('resizing');
      localStorage.setItem(`ahahh.${pane}Width`, String(width));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', end);
  };

  return (
    <div
      className={`resizer resizer-${pane} no-drag`}
      onPointerDown={resize}
      onDoubleClick={(e) => {
        localStorage.removeItem(`ahahh.${pane}Width`);
        e.currentTarget.parentElement!.style.setProperty(`--${pane}-w`, `${PANES[pane].initial}px`);
      }}
    />
  );
}

function View() {
  const { route } = useNav();
  switch (route.view) {
    case 'home':
      return <HomeView />;
    case 'search':
      return <SearchView />;
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
    case 'profile':
      return <ProfileView />;
    case 'settings':
      return <SettingsView />;
  }
}
