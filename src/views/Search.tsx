import { Close, Search as SearchIcon } from '../icons';
import { useEffect, useState } from 'react';
import { Shelf } from '../components/CardGrid';
import { Empty, ErrorNote, Spinner } from '../components/Status';
import { TrackList } from '../components/TrackList';
import { useAsync } from '../hooks';
import { api, playSongs, storefront, type Resource } from '../musickit';
import { useNav } from '../navigation';

interface SearchResults {
  results: Partial<Record<'songs' | 'albums' | 'artists' | 'playlists', { data: Resource[] }>>;
}

export function SearchView({ initialTerm = '' }: { initialTerm?: string }) {
  const { replace } = useNav();
  const [input, setInput] = useState(initialTerm);
  const [term, setTerm] = useState(initialTerm);

  // Debounce typing, and remember the term so Back returns to these results.
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(input.trim());
      replace({ view: 'search', term: input.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [input, replace]);

  const { data, error, loading } = useAsync(async () => {
    if (!term) return null;
    return api<SearchResults>(`/v1/catalog/${storefront()}/search`, {
      term,
      types: 'songs,albums,artists,playlists',
      limit: 20,
    });
  }, [term]);

  const r = data?.results;
  const songs = r?.songs?.data ?? [];
  const nothing = data && !songs.length && !r?.albums?.data.length && !r?.artists?.data.length && !r?.playlists?.data.length;

  return (
    <div className="page">
      <div className="search-box">
        <SearchIcon />
        <input autoFocus placeholder="Artists, songs, albums, playlists…" value={input} onChange={(e) => setInput(e.target.value)} />
        {input && (
          <button className="icon-btn" title="Clear" onClick={() => setInput('')}>
            <Close />
          </button>
        )}
      </div>

      {!term && <Empty>Search all of Apple Music.</Empty>}
      {term && loading && !data && <Spinner />}
      {error ? <ErrorNote error={error} /> : null}
      {nothing && <Empty>No results for “{term}”.</Empty>}

      {songs.length > 0 && (
        <section className="section">
          <h2>Songs</h2>
          <TrackList tracks={songs.slice(0, 10)} showArtwork onPlay={(i) => void playSongs(songs, i)} />
        </section>
      )}
      <Shelf title="Artists" items={r?.artists?.data ?? []} />
      <Shelf title="Albums" items={r?.albums?.data ?? []} />
      <Shelf title="Playlists" items={r?.playlists?.data ?? []} />
    </div>
  );
}
