import { Play } from '../icons';
import { Artwork } from '../components/Artwork';
import { Shelf } from '../components/CardGrid';
import { ErrorNote, Spinner } from '../components/Status';
import { TrackList } from '../components/TrackList';
import { useAsync } from '../hooks';
import { api, playSongs, storefront, type Resource } from '../musickit';

export function ArtistView({ id, name }: { id: string; name?: string }) {
  const { data, error, loading } = useAsync(
    () =>
      api<{ data: Resource[] }>(`/v1/catalog/${storefront()}/artists/${id}`, {
        views: 'top-songs,full-albums,singles,appears-on-albums',
      }).then((r) => r.data[0]),
    [id],
  );

  const a = data?.attributes ?? {};
  const view = (key: string) => data?.views?.[key]?.data ?? [];
  const topSongs = view('top-songs');

  return (
    <div className="page">
      <header className="hero artist">
        <Artwork artwork={a.artwork} size={200} round className="hero-art" />
        <div className="hero-info">
          <div className="eyebrow">Artist</div>
          <h1>{a.name ?? name}</h1>
          <div className="actions">
            <button className="btn primary" disabled={!topSongs.length} onClick={() => void playSongs(topSongs, 0, false)}>
              <Play /> Play
            </button>
          </div>
        </div>
      </header>

      {loading && !data && <Spinner />}
      {error ? <ErrorNote error={error} /> : null}
      {topSongs.length > 0 && (
        <section className="section">
          <h2>Top Songs</h2>
          <TrackList tracks={topSongs.slice(0, 10)} showArtwork onPlay={(i) => void playSongs(topSongs, i)} />
        </section>
      )}
      <Shelf title="Albums" items={view('full-albums')} />
      <Shelf title="Singles & EPs" items={view('singles')} />
      <Shelf title="Appears On" items={view('appears-on-albums')} />
    </div>
  );
}
