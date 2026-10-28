import { AddToPlaylist, Check, Favorite, Repeat, RepeatOne, Shuffle } from '../icons';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLibrary } from '../library';
import {
  addToPlaylist,
  cycleRepeat,
  errorMessage,
  FAVORITE_CHANGED,
  isFavorite,
  mk,
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
  onClick?(): void;
}

function QueueRow({ title, artist, art, order = 0, onClick }: RowProps) {
  return (
    <div
      className="queue-row"
      style={{ '--i': order } as CSSProperties}
      onDoubleClick={onClick}
      title={onClick ? 'Double-click to play' : undefined}
    >
      <div className="artwork" style={{ width: 36, height: 36 }}>
        {art && <img src={art} alt="" draggable={false} loading="lazy" decoding="async" />}
      </div>
      <div className="queue-meta">
        <div className="queue-title">{title}</div>
        <div className="queue-artist">{artist}</div>
      </div>
    </div>
  );
}
