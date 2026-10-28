import type { CSSProperties } from 'react';
import { mk } from '../musickit';
import { itemArtist, itemArtwork, itemTitle, useNowPlaying, useQueue } from '../player';
import { Bars } from './TrackList';

/** How many upcoming songs to render; the rest of the queue still plays. */
const MAX_UPCOMING = 50;

/** Stays mounted while closed so it can slide in and out (see .queue in styles.css). */
export function QueuePanel({ open }: { open: boolean }) {
  const { item, isPlaying } = useNowPlaying();
  const { items, position } = useQueue();
  const start = Math.max(position + 1, 0);
  const upcoming = items.slice(start, start + MAX_UPCOMING);

  return (
    <aside className={`queue ${open ? 'open' : ''}`} inert={!open} aria-hidden={!open}>
      <div className="queue-inner">
        <h3>Now Playing</h3>
        {item ? (
          <QueueRow title={itemTitle(item)} artist={itemArtist(item)} art={itemArtwork(item, 72)} current playing={isPlaying} />
        ) : (
          <p className="muted">Nothing playing</p>
        )}
        <h3>Up Next</h3>
        {upcoming.length === 0 && <p className="muted">Your queue is empty.</p>}
        <div className="queue-list">
          {upcoming.map((entry, i) => (
            <QueueRow
              key={`${entry.id}:${start + i}`}
              title={itemTitle(entry)}
              artist={itemArtist(entry)}
              art={itemArtwork(entry, 72)}
              order={i}
              onClick={() => void mk().changeToMediaAtIndex(start + i)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

interface RowProps {
  title: string;
  artist: string;
  art?: string;
  current?: boolean;
  playing?: boolean;
  /** Position in the list, for the staggered entrance. */
  order?: number;
  onClick?(): void;
}

function QueueRow({ title, artist, art, current, playing, order = 0, onClick }: RowProps) {
  return (
    <div
      className={`queue-row ${current ? 'current' : ''}`}
      style={{ '--i': order } as CSSProperties}
      onDoubleClick={onClick}
      title={onClick ? 'Double-click to play' : undefined}
    >
      <div className="artwork" style={{ width: 36, height: 36 }}>
        {art && <img src={art} alt="" draggable={false} loading="lazy" decoding="async" />}
        {playing && (
          <div className="thumb-overlay">
            <Bars />
          </div>
        )}
      </div>
      <div className="queue-meta">
        <div className="queue-title">{title}</div>
        <div className="queue-artist">{artist}</div>
      </div>
    </div>
  );
}
