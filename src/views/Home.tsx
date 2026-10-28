import { CardGrid, Shelf } from '../components/CardGrid';
import { ErrorNote, Spinner } from '../components/Status';
import { TrackList } from '../components/TrackList';
import { useAsync } from '../hooks';
import { page, playSongs, type Page } from '../musickit';

const orEmpty = (p: Promise<Page>) => p.catch((): Page => ({ data: [] }));

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomeView() {
  const { data, error, loading } = useAsync(async () => {
    // One request per section (10 and 25 are the endpoints' page-size limits).
    const [recent, tracks, added] = await Promise.all([
      orEmpty(page('/v1/me/recent/played', { limit: 10 })),
      orEmpty(page('/v1/me/recent/played/tracks', { limit: 10, types: 'songs,library-songs' })),
      page('/v1/me/library/recently-added', { limit: 25 }),
    ]);
    return { recent: recent.data, tracks: tracks.data, added: added.data };
  }, []);

  return (
    <div className="page">
      <h1>{greeting()}</h1>
      {loading && !data && <Spinner />}
      {error ? <ErrorNote error={error} /> : null}
      {data && (
        <>
          <Shelf title="Jump Back In" items={data.recent} />
          {data.tracks.length > 0 && (
            <section className="section">
              <h2>Recently Played Songs</h2>
              <TrackList tracks={data.tracks} showArtwork onPlay={(i) => void playSongs(data.tracks, i)} />
            </section>
          )}
          {data.added.length > 0 && (
            <section className="section">
              <h2>Recently Added</h2>
              <CardGrid items={data.added} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
