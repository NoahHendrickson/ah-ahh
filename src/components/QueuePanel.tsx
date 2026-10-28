import { AddToPlaylist, Check, Close, Favorite, Repeat, RepeatOne, Shuffle } from '../icons';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLibrary } from '../library';
import {
  addToPlaylist,
  cycleRepeat,
  errorMessage,
  FAVORITE_CHANGED,
  isFavorite,
  mk,
  moveInQueue,
  removeFromQueue,
  RepeatMode,
  setFavorite,
  songRef,
  toggleShuffle,
  type MediaItem,
  type Resource,
  type SongRef,
} from '../musickit';
import { itemAlbum, itemArtist, itemArtwork, itemTitle, useNowPlaying, usePlayer, useQueue } from '../player';
import { Bars } from './TrackList';

/** How many upcoming songs to render; the rest of the queue still plays. */
const MAX_UPCOMING = 50;

/** Stays mounted while closed so it can slide in and out (see .queue in styles.css). */
export function QueuePanel({ open }: { open: boolean }) {
  const { item, isPlaying } = useNowPlaying();
  const { items, position } = useQueue();
  const start = Math.max(position + 1, 0);
  const upcoming = items.slice(start, start + MAX_UPCOMING);
  // Dragging: the queue index being moved, and the gap (0…upcoming.length) it would drop into.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  // Keys follow the song, not its position, so rows don't re-mount (and re-animate) when moved.
  const seen = new Map<string, number>();
  const keys = upcoming.map((entry) => {
    const n = seen.get(entry.id) ?? 0;
    seen.set(entry.id, n + 1);
    return `${entry.id}:${n}`;
  });

  const endDrag = () => {
    setDragFrom(null);
    setDropSlot(null);
  };
  const drop = () => {
    if (dragFrom !== null && dropSlot !== null) {
      const to = start + dropSlot;
      moveInQueue(dragFrom, dragFrom < to ? to - 1 : to);
    }
    endDrag();
  };

  return (
    <aside className={`queue ${open ? 'open' : ''}`} inert={!open} aria-hidden={!open}>
      <div className="queue-inner">
        <h3>Now Playing</h3>
        {item ? <NowPlayingCard key={item.id} item={item} playing={isPlaying} /> : <p className="muted">Nothing playing</p>}
        <h3 className="up-next">Up Next</h3>
        {upcoming.length === 0 && <p className="muted">Your queue is empty.</p>}
        <div className="queue-list">
          {upcoming.map((entry, i) => (
            <QueueRow
              key={keys[i]}
              title={itemTitle(entry)}
              artist={itemArtist(entry)}
              art={itemArtwork(entry, 72)}
              order={i}
              dragging={dragFrom === start + i}
              dropMark={dropSlot === i ? 'before' : dropSlot === upcoming.length && i === upcoming.length - 1 ? 'after' : undefined}
              onClick={() => void mk().changeToMediaAtIndex(start + i)}
              onRemove={() => removeFromQueue(start + i)}
              onDragStart={() => setDragFrom(start + i)}
              onDragOver={(after) => dragFrom !== null && setDropSlot(i + (after ? 1 : 0))}
              onDrop={drop}
              onDragEnd={endDrag}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function NowPlayingCard({ item, playing }: { item: MediaItem; playing: boolean }) {
  const art = itemArtwork(item, 192);
  const song = songRef(item);
  // Set by the add-to-playlist menu: what happened, shown briefly under the buttons.
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="now-card">
      <div className="now-card-main">
        <div className="artwork" style={{ width: 96, height: 96 }}>
          {art && <img src={art} alt="" draggable={false} />}
          {playing && (
            <div className="thumb-overlay">
              <Bars />
            </div>
          )}
        </div>
        <div className="queue-meta">
          <div className="now-card-title">{itemTitle(item)}</div>
          <div className="queue-artist">{itemArtist(item)}</div>
          <div className="queue-artist">{itemAlbum(item)}</div>
        </div>
      </div>
      <div className="now-card-actions">
        <FavoriteButton song={song} />
        <AddToPlaylistButton song={song} onDone={setNotice} />
        <PlaybackModeButtons />
      </div>
      {notice && <p className="now-card-notice muted small">{notice}</p>}
    </div>
  );
}

function FavoriteButton({ song }: { song: SongRef }) {
  // undefined while loading; the card is re-keyed per song, so this starts fresh each time.
  const [favorite, setFavoriteState] = useState<boolean>();

  useEffect(() => {
    let live = true;
    isFavorite(song)
      .then((value) => live && setFavoriteState(value))
      .catch(() => live && setFavoriteState(false));
    // Favorited from the phone remote.
    const onChange = (event: Event) => {
      const { song: changed, favorite } = (event as CustomEvent).detail;
      if (changed.id === song.id) setFavoriteState(favorite);
    };
    window.addEventListener(FAVORITE_CHANGED, onChange);
    return () => {
      live = false;
      window.removeEventListener(FAVORITE_CHANGED, onChange);
    };
  }, [song.id, song.type]);

  const toggle = () => {
    const next = !favorite;
    setFavoriteState(next);
    setFavorite(song, next).catch(() => setFavoriteState(!next));
  };

  return (
    <button
      className={`icon-btn ${favorite ? 'favorited' : ''}`}
      title={favorite ? 'Remove from Favorites' : 'Favorite'}
      aria-pressed={!!favorite}
      disabled={favorite === undefined}
      onClick={toggle}
    >
      <Favorite filled={!!favorite} />
    </button>
  );
}

function AddToPlaylistButton({ song, onDone }: { song: SongRef; onDone(message: string): void }) {
  const { playlists } = useLibrary();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editable = playlists.filter((p) => p.attributes?.canEdit);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const add = async (playlist: Resource) => {
    setOpen(false);
    const name = playlist.attributes?.name?.trim() ?? 'playlist';
    try {
      await addToPlaylist(playlist, song);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
      onDone(`Added to ${name}`);
    } catch (err) {
      onDone(`Couldn’t add to ${name}: ${errorMessage(err)}`);
    }
  };

  return (
    <div className="menu-anchor" ref={ref}>
      <button className={`icon-btn ${open ? 'active' : ''}`} title="Add to Playlist" aria-expanded={open} onClick={() => setOpen(!open)}>
        {added ? <Check /> : <AddToPlaylist />}
      </button>
      {open && (
        <div className="menu" role="menu">
          {editable.length === 0 && <p className="muted small menu-empty">No playlists you can add to.</p>}
          {editable.map((playlist) => (
            <button key={playlist.id} className="menu-item" role="menuitem" onClick={() => void add(playlist)}>
              {playlist.attributes?.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaybackModeButtons() {
  const { shuffle, repeat } = usePlayer();
  return (
    <>
      <button className={`icon-btn ${shuffle ? 'active' : ''}`} title="Shuffle" onClick={toggleShuffle}>
        <Shuffle />
      </button>
      <button className={`icon-btn ${repeat !== RepeatMode.none ? 'active' : ''}`} title="Repeat" onClick={cycleRepeat}>
        {repeat === RepeatMode.one ? <RepeatOne /> : <Repeat />}
      </button>
    </>
  );
}

interface RowProps {
  title: string;
  artist: string;
  art?: string;
  /** Position in the list, for the staggered entrance. */
  order?: number;
  dragging: boolean;
  /** Where the dragged row would land, drawn as a line. */
  dropMark?: 'before' | 'after';
  onClick(): void;
  onRemove(): void;
  onDragStart(): void;
  /** `after`: the pointer is over the lower half of this row. */
  onDragOver(after: boolean): void;
  onDrop(): void;
  onDragEnd(): void;
}

function QueueRow({ title, artist, art, order = 0, dragging, dropMark, onClick, onRemove, onDragStart, onDragOver, onDrop, onDragEnd }: RowProps) {
  return (
    <div
      className={`queue-row ${dragging ? 'dragging' : ''} ${dropMark ? `drop-${dropMark}` : ''}`}
      style={{ '--i': order } as CSSProperties}
      draggable
      onDoubleClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY > rect.top + rect.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      title="Double-click to play, drag to reorder"
    >
      <div className="artwork" style={{ width: 36, height: 36 }}>
        {art && <img src={art} alt="" draggable={false} loading="lazy" decoding="async" />}
      </div>
      <div className="queue-meta">
        <div className="queue-title">{title}</div>
        <div className="queue-artist">{artist}</div>
      </div>
      <button
        className="icon-btn queue-remove"
        title="Remove from Up Next"
        onClick={onRemove}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Close />
      </button>
    </div>
  );
}
