import { AddToPlaylist, Check, Close, Favorite, Grip, Repeat, RepeatOne, Shuffle } from '../icons';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
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
  // Reordering: the lifted row and the spot it would land in, both as indexes into `upcoming`.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  // Keys follow the song, not its position, so rows don't re-mount (and re-animate) when moved.
  const seen = new Map<string, number>();
  const keys = upcoming.map((entry) => {
    const n = seen.get(entry.id) ?? 0;
    seen.set(entry.id, n + 1);
    return `${entry.id}:${n}`;
  });

  /**
   * Press and hold (or move) a row to lift it: it follows the pointer while the rows it passes slide
   * out of the way, and the panel scrolls when held near its top or bottom edge. Release to drop it.
   * A queue change mid-drag (a song ends, the phone edits it) puts the row back, since `from`, `to`
   * and `start` would no longer point at the same songs.
   */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, from: number) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const row = e.currentTarget;
    const scroller = row.closest<HTMLElement>('.queue-inner')!;
    const height = row.offsetHeight;
    const startY = e.clientY + scroller.scrollTop;
    let y = e.clientY;
    let dy = 0;
    let to = from;
    let frame = 0;
    let hold = 0;
    // Keeps the release coming here even if the pointer leaves the row or the window first.
    row.setPointerCapture(e.pointerId);

    // Runs every frame once lifted, so edge scrolling continues while the pointer holds still.
    const tick = () => {
      const box = scroller.getBoundingClientRect();
      scroller.scrollTop += y < box.top + 48 ? -8 : y > box.bottom - 48 ? 8 : 0;
      dy = y + scroller.scrollTop - startY;
      row.style.setProperty('--dy', `${dy}px`);
      const next = Math.min(Math.max(from + Math.round(dy / height), 0), upcoming.length - 1);
      if (next !== to) setDrag({ from, to: (to = next) });
      frame = requestAnimationFrame(tick);
    };
    const lift = () => {
      if (frame) return;
      clearTimeout(hold);
      setDrag({ from, to });
      tick();
    };
    // A short hold lifts it in place; a quick click or double-click never does.
    hold = window.setTimeout(lift, 150);
    const move = (ev: PointerEvent) => {
      y = ev.clientY;
      if (Math.abs(y - e.clientY) >= 4) lift();
    };
    const listen = (on: boolean) => {
      const method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('pointermove', move as EventListener);
      window[method]('pointerup', drop);
      window[method]('pointercancel', cancel);
      window[method]('blur', cancel);
      mk()[method]('queueItemsDidChange', cancel);
      mk()[method]('queuePositionDidChange', cancel);
    };
    const cancel = () => {
      listen(false);
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      if (!frame) return;
      row.style.removeProperty('--dy');
      setDrag(null);
    };
    const drop = () => {
      listen(false);
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      if (!frame) return;
      // Commit the move with transitions off so the other rows don't slide twice, then ease
      // the dropped row from where it was let go into its new place.
      const { boxShadow, backgroundColor } = getComputedStyle(row);
      scroller.classList.add('settling');
      flushSync(() => {
        moveInQueue(start + from, start + to);
        setDrag(null);
      });
      // Rows React moved in the DOM would replay their entrance animation.
      for (const r of row.parentElement!.children) for (const a of r.getAnimations()) if (a instanceof CSSAnimation) a.finish();
      row.style.removeProperty('--dy');
      void scroller.offsetHeight;
      scroller.classList.remove('settling');
      const transform = `translateY(${dy - (to - from) * height}px) scale(1.02)`;
      row.animate([{ offset: 0, transform, boxShadow, backgroundColor }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    };
    listen(true);
  };

  return (
    <aside className={`queue ${open ? 'open' : ''}`} inert={!open} aria-hidden={!open}>
      <div className="queue-inner">
        {item ? <NowPlayingCard key={item.id} item={item} playing={isPlaying} /> : <p className="muted">Nothing playing</p>}
        <h3>Queue</h3>
        {upcoming.length === 0 && <p className="muted">Your queue is empty.</p>}
        <div className={`queue-list ${drag ? 'reordering' : ''}`}>
          {upcoming.map((entry, i) => (
            <QueueRow
              key={keys[i]}
              title={itemTitle(entry)}
              artist={itemArtist(entry)}
              art={itemArtwork(entry, 72)}
              order={i}
              lifted={drag?.from === i}
              shift={drag && i !== drag.from ? (i > drag.from && i <= drag.to ? -1 : i < drag.from && i >= drag.to ? 1 : 0) : 0}
              onClick={() => void mk().changeToMediaAtIndex(start + i)}
              onRemove={() => removeFromQueue(start + i)}
              onPointerDown={(e) => startDrag(e, i)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function NowPlayingCard({ item, playing }: { item: MediaItem; playing: boolean }) {
  const art = itemArtwork(item, 192);
  const mesh = useArtMesh(itemArtwork(item, 24));
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
      {mesh && (
        <div className="now-card-bg" aria-hidden>
          <div className={`now-card-mesh ${playing ? '' : 'paused'}`} style={{ background: mesh }} />
        </div>
      )}
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

/** Mesh backgrounds already worked out, by artwork URL, so coming back to a song paints at once. */
const meshes = new Map<string, string | null>();

/** The card's background in the artwork's colours, once the (tiny) artwork has loaded. */
function useArtMesh(url: string | undefined): string | undefined {
  const [mesh, setMesh] = useState(() => (url ? meshes.get(url) : undefined));

  useEffect(() => {
    if (!url || meshes.has(url)) return;
    let live = true;
    const img = new Image();
    // Apple's artwork CDN allows this, so the pixels can be read back.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let value: string | null = null;
      try {
        value = meshFrom(img);
      } catch {
        // Artwork from a host without CORS: keep the plain card.
      }
      meshes.set(url, value);
      if (live) setMesh(value);
    };
    img.src = url;
    return () => {
      live = false;
    };
  }, [url]);

  return mesh ?? undefined;
}

/** Shrinks the art to 3×3 pixels: its corners glow from the card's corners over its centre colour. */
function meshFrom(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 3;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, 3, 3);
  const px = ctx.getImageData(0, 0, 3, 3).data;
  const color = (i: number) => tone(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  return [
    `radial-gradient(at 30% 30%, ${color(0)}, transparent 50%)`,
    `radial-gradient(at 70% 30%, ${color(2)}, transparent 50%)`,
    `radial-gradient(at 30% 70%, ${color(6)}, transparent 50%)`,
    `radial-gradient(at 70% 70%, ${color(8)}, transparent 50%)`,
    color(4),
  ].join(', ');
}

/** More saturated than the art, and never bright enough to wash out the white text on top. */
function tone(r: number, g: number, b: number): string {
  const grey = (r + g + b) / 3;
  const rgb = [r, g, b].map((v) => Math.min(255, Math.max(0, grey + (v - grey) * 1.4)));
  const luma = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const k = Math.min(1, 0.34 / luma);
  return `rgb(${rgb.map((v) => Math.round(v * k)).join(' ')})`;
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
  /** Being dragged: follows the pointer (by --dy) above the other rows. */
  lifted: boolean;
  /** Slid a row up (-1) or down (1) to make room for the dragged row. */
  shift: number;
  onClick(): void;
  onRemove(): void;
  onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void;
}

function QueueRow({ title, artist, art, order = 0, lifted, shift, onClick, onRemove, onPointerDown }: RowProps) {
  return (
    <div
      className={`queue-row ${lifted ? 'lifted' : ''}`}
      style={{ '--i': order, '--shift': shift } as CSSProperties}
      onDoubleClick={onClick}
      onPointerDown={onPointerDown}
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
        title="Remove from Queue"
        onClick={onRemove}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Close />
      </button>
      <span className="queue-grip" aria-hidden>
        <Grip />
      </span>
    </div>
  );
}
