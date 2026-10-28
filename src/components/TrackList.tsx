import { Add, Check, Play, PlayNext } from '../icons';
import { memo, useCallback, useRef, useState } from 'react';
import { addToLibrary, formatTime, playNext, type Resource } from '../musickit';
import { useNowPlaying } from '../player';
import { Artwork } from './Artwork';

interface Props {
  tracks: Resource[];
  onPlay(index: number): void;
  /** Show artwork thumbnails instead of track numbers (playlists, search). */
  showArtwork?: boolean;
  showAlbum?: boolean;
}

export function TrackList({ tracks, onPlay, showArtwork = false, showAlbum = true }: Props) {
  const { ids: playingIds, isPlaying } = useNowPlaying();
  // Stable across renders so memoized rows only re-render when their own flags change.
  const latestOnPlay = useRef(onPlay);
  latestOnPlay.current = onPlay;
  const play = useCallback((index: number) => latestOnPlay.current(index), []);

  return (
    <div className={`tracks ${showAlbum ? '' : 'no-album'}`}>
      {tracks.map((track, index) => {
        const current = playingIds.has(track.id) || playingIds.has(track.attributes?.playParams?.catalogId ?? '');
        return (
          <TrackRow
            key={`${track.id}:${index}`}
            track={track}
            index={index}
            number={showArtwork ? undefined : track.attributes?.trackNumber ?? index + 1}
            current={current}
            playing={current && isPlaying}
            showAlbum={showAlbum}
            onPlay={play}
          />
        );
      })}
    </div>
  );
}

interface RowProps {
  track: Resource;
  /** Position in the list: passed to onPlay, and drives the staggered entrance. */
  index: number;
  number?: number;
  current: boolean;
  playing: boolean;
  showAlbum: boolean;
  onPlay(index: number): void;
}

const TrackRow = memo(function TrackRow({ track, index, number, current, playing, showAlbum, onPlay }: RowProps) {
  const a = track.attributes ?? {};
  const [added, setAdded] = useState(false);
  const unavailable = !a.playParams;
  const isCatalog = !track.type.startsWith('library-');
  const play = () => onPlay(index);

  return (
    <div
      className={`track ${current ? 'current' : ''} ${unavailable ? 'unavailable' : ''}`}
      style={{ '--i': index } as React.CSSProperties}
      onDoubleClick={unavailable ? undefined : play}
    >
      <div className="track-lead">
        {number !== undefined ? (
          <span className="track-number">{playing ? <Bars /> : number}</span>
        ) : (
          <div className="track-thumb">
            <Artwork artwork={a.artwork} size={36} />
            {playing && (
              <div className="thumb-overlay">
                <Bars />
              </div>
            )}
          </div>
        )}
        {!unavailable && (
          <button className="track-play" title="Play" onClick={play}>
            <Play />
          </button>
        )}
      </div>
      <div className="track-main">
        <div className="track-title">
          {a.name}
          {a.contentRating === 'explicit' && <span className="explicit">E</span>}
        </div>
        <div className="track-artist">{a.artistName}</div>
      </div>
      {showAlbum && <div className="track-album">{a.albumName}</div>}
      <div className="track-actions">
        {!unavailable && (
          <button className="icon-btn" title="Play next" onClick={() => void playNext(track)}>
            <PlayNext />
          </button>
        )}
        {isCatalog && track.type === 'songs' && (
          <button
            className="icon-btn"
            title={added ? 'Added to library' : 'Add to library'}
            disabled={added}
            onClick={() => addToLibrary(track).then(() => setAdded(true))}
          >
            {added ? <Check /> : <Add />}
          </button>
        )}
      </div>
      <div className="track-time">{a.durationInMillis ? formatTime(a.durationInMillis / 1000) : ''}</div>
    </div>
  );
});

export function Bars() {
  return (
    <span className="bars" aria-label="Playing">
      <i />
      <i />
      <i />
    </span>
  );
}
