import { Play, Shuffle } from '../icons';
import { CardGrid } from '../components/CardGrid';
import { Empty, ErrorNote, Spinner } from '../components/Status';
import { TrackList } from '../components/TrackList';
import { useOnVisible, usePaged } from '../hooks';
import { useLibrary } from '../library';
import { playSongs, type Resource } from '../musickit';

// Keep queues a sensible size even for 10k-song libraries.
const MAX_QUEUE = 300;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const playable = (items: Resource[]) => items.filter((s) => s.attributes?.playParams);

export function SongsView() {
  const { items, loading, error, done, loadMore } = usePaged('/v1/me/library/songs');
  const sentinel = useOnVisible(() => void loadMore());

  return (
    <div className="page">
      <div className="page-header-row">
        <h1>Songs</h1>
        <div className="actions">
          <button className="btn primary" disabled={!items.length} onClick={() => void playSongs(playable(items).slice(0, MAX_QUEUE), 0, false)}>
            <Play /> Play
          </button>
          <button className="btn" disabled={!items.length} onClick={() => void playSongs(shuffled(playable(items)).slice(0, MAX_QUEUE), 0, true)}>
            <Shuffle /> Shuffle
          </button>
        </div>
      </div>
      <TrackList tracks={items} showArtwork onPlay={(i) => void playSongs(items.slice(i, i + MAX_QUEUE), 0)} />
      {error ? <ErrorNote error={error} /> : null}
      {loading && <Spinner />}
      {done && !items.length && !error && <Empty>No songs in your library yet.</Empty>}
      {!done && <div ref={sentinel} className="sentinel" />}
    </div>
  );
}

export function AlbumsView() {
  const { items, loading, error, done, loadMore } = usePaged('/v1/me/library/albums');
  const sentinel = useOnVisible(() => void loadMore());
  return (
    <div className="page">
      <h1>Albums</h1>
      <CardGrid items={items} />
      {error ? <ErrorNote error={error} /> : null}
      {loading && <Spinner />}
      {done && !items.length && !error && <Empty>No albums in your library yet.</Empty>}
      {!done && <div ref={sentinel} className="sentinel" />}
    </div>
  );
}

export function PlaylistsView() {
  const { playlists, loading, error, refresh } = useLibrary();
  return (
    <div className="page">
      <h1>Playlists</h1>
      {loading && !playlists.length && <Spinner />}
      {error ? <ErrorNote error={error} onRetry={refresh} /> : null}
      {!loading && !error && !playlists.length && <Empty>No playlists yet.</Empty>}
      <CardGrid items={playlists} />
    </div>
  );
}
