import { Add, Check, Play, Shuffle } from '../icons';
import { useState } from 'react';
import { Artwork } from '../components/Artwork';
import { ErrorNote, Spinner } from '../components/Status';
import { TrackList } from '../components/TrackList';
import { useAllPages, useAsync } from '../hooks';
import { addToLibrary, api, formatTotal, playContainer, playSongs, storefront, type Resource } from '../musickit';

/** Apple's descriptions contain light HTML (<br>, <i>); show them as text. */
function plainText(html?: string): string | undefined {
  if (!html) return undefined;
  return new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent ?? undefined;
}

/** Album or playlist page, for both library and catalog items. */
export function CollectionView({ item }: { item: Resource }) {
  const isLibrary = item.type.startsWith('library-');
  const kind = item.type.endsWith('albums') ? 'albums' : 'playlists';
  const base = isLibrary ? `/v1/me/library/${kind}/${item.id}` : `/v1/catalog/${storefront()}/${kind}/${item.id}`;

  // Detail and tracks load in parallel; tracks render from the first page while the rest stream in.
  const info = useAsync(() => api<{ data: Resource[] }>(base), [base]);
  const { items: tracks, loading, error: tracksError } = useAllPages(`${base}/tracks`);

  const detail = info.data?.data[0] ?? item;
  const error = info.error ?? tracksError;
  const a = detail.attributes ?? {};
  const totalMs = tracks.reduce((sum, t) => sum + (t.attributes?.durationInMillis ?? 0), 0);
  const year = a.releaseDate?.slice(0, 4);
  const byline = kind === 'albums' ? [a.artistName, a.genreNames?.[0], year].filter(Boolean).join(' · ') : a.curatorName ?? (isLibrary ? 'Your playlist' : 'Playlist');
  const notes = plainText(a.description?.standard ?? a.description?.short ?? a.editorialNotes?.short);
  const artwork = a.artwork ?? tracks.find((t) => t.attributes?.artwork)?.attributes?.artwork;
  // Play the tracks already on screen so MusicKit doesn't fetch the whole collection again first;
  // until every page has arrived, let MusicKit load it.
  const play = (startWith: number, shuffle?: boolean) =>
    void (loading ? playContainer(detail, startWith, shuffle) : playSongs(tracks, startWith, shuffle));

  return (
    <div className="page">
      <header className="hero">
        <Artwork artwork={artwork} size={220} className="hero-art" />
        <div className="hero-info">
          <div className="eyebrow">{kind === 'albums' ? 'Album' : 'Playlist'}</div>
          <h1>{a.name}</h1>
          <div className="byline">{byline}</div>
          {notes && <p className="notes">{notes}</p>}
          {tracks.length > 0 && (
            <div className="muted small">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · {formatTotal(totalMs)}
            </div>
          )}
          <div className="actions">
            <button className="btn primary" disabled={!tracks.length} onClick={() => play(0, false)}>
              <Play /> Play
            </button>
            <button
              className="btn"
              disabled={!tracks.length}
              onClick={() => play(Math.floor(Math.random() * tracks.length), true)}
            >
              <Shuffle /> Shuffle
            </button>
            {!isLibrary && <AddButton item={detail} />}
          </div>
        </div>
      </header>

      {loading && !tracks.length && <Spinner />}
      {error ? <ErrorNote error={error} /> : null}
      <TrackList
        tracks={tracks}
        showArtwork={kind === 'playlists'}
        showAlbum={kind === 'playlists'}
        onPlay={play}
      />
    </div>
  );
}

function AddButton({ item }: { item: Resource }) {
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle');
  return (
    <button
      className="btn"
      disabled={state !== 'idle'}
      onClick={() => {
        setState('adding');
        addToLibrary(item).then(
          () => setState('added'),
          () => setState('idle'),
        );
      }}
    >
      {state === 'added' ? <Check /> : <Add />} {state === 'added' ? 'In Library' : 'Add'}
    </button>
  );
}
