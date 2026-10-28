import { createContext, useContext, useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  errorMessage,
  FAVORITE_CHANGED,
  isFavorite,
  isNotFound,
  mk,
  moveInQueue,
  nowPlayingIds,
  playContainer,
  playNext,
  playSongs,
  removeFromQueue,
  setFavorite,
  ShuffleMode,
  songRef,
  storefront,
  type MediaItem,
  type MusicKitInstance,
} from './musickit';

/** Player bar state. Track rows, the queue and volume have their own hooks below so they don't re-render on every event. */
export interface PlayerState {
  item?: MediaItem;
  isPlaying: boolean;
  duration: number;
  shuffle: boolean;
  repeat: number;
}

const STATE_EVENTS = [
  'playbackStateDidChange',
  'nowPlayingItemDidChange',
  'playbackDurationDidChange',
  'shuffleModeDidChange',
  'repeatModeDidChange',
];

function snapshot(music: MusicKitInstance): PlayerState {
  return {
    item: music.nowPlayingItem,
    isPlaying: music.isPlaying,
    duration: music.currentPlaybackDuration || (music.nowPlayingItem?.attributes?.durationInMillis ?? 0) / 1000,
    shuffle: music.shuffleMode !== 0,
    repeat: music.repeatMode,
  };
}

export const itemTitle = (item?: MediaItem) => item?.attributes?.name ?? item?.title ?? '';
export const itemArtist = (item?: MediaItem) => item?.attributes?.artistName ?? item?.artistName ?? '';
export const itemAlbum = (item?: MediaItem) => item?.attributes?.albumName ?? item?.albumName ?? '';
export function itemArtwork(item: MediaItem | undefined, px: number): string | undefined {
  const url = item?.attributes?.artwork?.url ?? item?.artworkURL;
  return url?.replace('{w}', String(px)).replace('{h}', String(px)).replace('{f}', 'jpg');
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => snapshot(mk()));

  useEffect(() => {
    const music = mk();
    const saved = Number(localStorage.getItem('ahahh.volume'));
    if (localStorage.getItem('ahahh.volume') !== null && Number.isFinite(saved)) music.volume = saved;

    // MusicKit fires several events per song change; coalesce them so one change = one render.
    // (A timer, not requestAnimationFrame: rAF pauses while the window is hidden behind a game,
    // and the OBS overlay depends on these updates.)
    let pending: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      pending = undefined;
      setState(snapshot(music));
    };
    const update = () => {
      pending ??= setTimeout(apply, 30);
    };
    const saveVolume = () => localStorage.setItem('ahahh.volume', String(music.volume));
    STATE_EVENTS.forEach((name) => music.addEventListener(name, update));
    music.addEventListener('playbackVolumeDidChange', saveVolume);
    apply();
    return () => {
      clearTimeout(pending);
      STATE_EVENTS.forEach((name) => music.removeEventListener(name, update));
      music.removeEventListener('playbackVolumeDidChange', saveVolume);
    };
  }, []);

  useNowPlayingBroadcast(state);
  useMediaSession(state);
  useRemoteCommands();

  return <PlayerContext.Provider value={state}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const state = useContext(PlayerContext);
  if (!state) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return state;
}

/** Subscribes to MusicKit events; the returned function is a useSyncExternalStore `subscribe`. */
function subscribeTo(events: string[], onEvent?: () => void) {
  return (onChange: () => void) => {
    const music = mk();
    const listener = () => {
      onEvent?.();
      onChange();
    };
    events.forEach((name) => music.addEventListener(name, listener));
    return () => events.forEach((name) => music.removeEventListener(name, listener));
  };
}

export interface NowPlaying {
  item?: MediaItem;
  /** Every ID the playing song might be known by (library and catalog), see nowPlayingIds. */
  ids: Set<string>;
  isPlaying: boolean;
}

let nowPlaying: NowPlaying = { ids: new Set(), isPlaying: false };
const subscribeNowPlaying = subscribeTo(['nowPlayingItemDidChange', 'playbackStateDidChange']);
function getNowPlaying(): NowPlaying {
  const music = mk();
  const item = music.nowPlayingItem;
  if (item?.id !== nowPlaying.item?.id || music.isPlaying !== nowPlaying.isPlaying) {
    nowPlaying = { item, ids: nowPlayingIds(item), isPlaying: music.isPlaying };
  }
  return nowPlaying;
}

/** The playing song and play/pause only, so track lists skip time, volume and queue updates. */
export function useNowPlaying(): NowPlaying {
  return useSyncExternalStore(subscribeNowPlaying, getNowPlaying);
}

export interface QueueState {
  items: MediaItem[];
  position: number;
}

// MusicKit may mutate queue.items in place, so copy it once per queue event instead of comparing.
let queue: QueueState = { items: [], position: -1 };
let queueStale = true;
const subscribeQueueEvents = subscribeTo(['queueItemsDidChange', 'queuePositionDidChange'], () => (queueStale = true));
const subscribeQueue = (onChange: () => void) => {
  queueStale = true;
  return subscribeQueueEvents(onChange);
};
function getQueue(): QueueState {
  if (queueStale) {
    queueStale = false;
    const music = mk();
    queue = { items: [...(music.queue?.items ?? [])], position: music.queue?.position ?? -1 };
  }
  return queue;
}

export function useQueue(): QueueState {
  return useSyncExternalStore(subscribeQueue, getQueue);
}

const subscribeVolume = subscribeTo(['playbackVolumeDidChange']);
const getVolume = () => mk().volume;

export function useVolume(): number {
  return useSyncExternalStore(subscribeVolume, getVolume);
}

/** Current playback time in seconds. Kept separate so only the progress bar re-renders ~4x/second. */
export function usePlaybackTime(): number {
  return useSyncExternalStore(
    (onChange) => {
      mk().addEventListener('playbackTimeDidChange', onChange);
      return () => mk().removeEventListener('playbackTimeDidChange', onChange);
    },
    () => mk().currentPlaybackTime || 0,
  );
}

/**
 * Playback time that glides smoothly between MusicKit's time updates (a few per second),
 * so the progress bar moves continuously instead of ticking.
 */
export function useSmoothPlaybackTime(isPlaying: boolean): number {
  const time = usePlaybackTime();
  const anchor = useRef({ time, at: performance.now() });
  if (anchor.current.time !== time) anchor.current = { time, at: performance.now() };
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = requestAnimationFrame(function loop() {
      redraw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  if (!isPlaying) return time;
  return anchor.current.time + Math.min((performance.now() - anchor.current.at) / 1000, 1);
}

/** Counts queue changes (a burst counts once), so the phone remote knows when to refetch the queue. */
function useQueueRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeQueueEvents(() => {
      pending ??= setTimeout(() => {
        pending = undefined;
        setRevision((n) => n + 1);
      }, 100);
    });
    return () => {
      clearTimeout(pending);
      unsubscribe();
    };
  }, []);
  return revision;
}

/** Whether the playing song is a favorite, for the phone remote; null while unknown or with nothing playing. */
function useFavorite(item?: MediaItem): boolean | null {
  // Kept with the song's ID so a new song never shows the previous one's value.
  const [favorite, setFavoriteState] = useState<{ id: string; value: boolean }>();
  useEffect(() => {
    if (!item) return;
    const song = songRef(item);
    let live = true;
    isFavorite(song).then((value) => live && setFavoriteState({ id: item.id, value }), () => {});
    const onChange = (event: Event) => {
      const { song: changed, favorite } = (event as CustomEvent).detail;
      if (changed.id === song.id) setFavoriteState({ id: item.id, value: favorite });
    };
    window.addEventListener(FAVORITE_CHANGED, onChange);
    return () => {
      live = false;
      window.removeEventListener(FAVORITE_CHANGED, onChange);
    };
  }, [item?.id]);
  return favorite && favorite.id === item?.id ? favorite.value : null;
}

/** Pushes now-playing info to the main process, which relays it to the OBS overlay and the phone remote. */
function useNowPlayingBroadcast(state: PlayerState) {
  const { item, isPlaying, duration, shuffle, repeat } = state;
  const queueRevision = useQueueRevision();
  const favorite = useFavorite(item);

  useEffect(() => {
    const music = mk();
    let last = { positionMs: 0, updatedAt: 0, playing: false };
    let volumeTimer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      const positionMs = (music.currentPlaybackTime || 0) * 1000;
      last = { positionMs, updatedAt: Date.now(), playing: music.isPlaying };
      window.ahahh?.publishNowPlaying({
        playing: music.isPlaying,
        title: item ? itemTitle(item) : null,
        artist: itemArtist(item),
        album: itemAlbum(item),
        artwork: itemArtwork(item, 600) ?? null,
        durationMs: duration * 1000,
        positionMs,
        updatedAt: last.updatedAt,
        volume: music.volume,
        shuffle,
        repeat,
        queueRevision,
        favorite,
      });
    };

    // Re-sync after seeks: if the real position drifts from what the overlay is predicting.
    const onTime = () => {
      const predicted = last.positionMs + (last.playing ? Date.now() - last.updatedAt : 0);
      if (Math.abs(predicted - (music.currentPlaybackTime || 0) * 1000) > 1500) publish();
    };
    // Dragging the volume slider fires many events; send at most one per 100ms.
    const onVolume = () => {
      volumeTimer ??= setTimeout(() => {
        volumeTimer = undefined;
        publish();
      }, 100);
    };

    publish();
    const timer = setInterval(publish, 10_000);
    music.addEventListener('playbackTimeDidChange', onTime);
    music.addEventListener('playbackVolumeDidChange', onVolume);
    return () => {
      clearInterval(timer);
      clearTimeout(volumeTimer);
      music.removeEventListener('playbackTimeDidChange', onTime);
      music.removeEventListener('playbackVolumeDidChange', onVolume);
    };
  }, [item, isPlaying, duration, shuffle, repeat, queueRevision, favorite]);
}

/** The phone remote's view of the queue: the current song and up to 100 after it. */
function remoteQueue() {
  const { items = [], position = -1 } = mk().queue ?? {};
  if (position < 0 || position >= items.length) return { position: -1, items: [] };
  return {
    position,
    items: items.slice(position, position + 101).map((item, i) => ({
      index: position + i,
      id: item.id,
      title: itemTitle(item),
      artist: itemArtist(item),
      artwork: itemArtwork(item, 120) ?? null,
    })),
  };
}

/** Answers the phone remote: the queue, or a read-only Apple Music API call (the main process vetted the path). */
async function answerRemote(request: AhAhhRemoteRequest): Promise<AhAhhRemoteReply> {
  try {
    if (request.kind === 'queue') return { status: 200, body: remoteQueue() };
    const response = await mk().api.music(request.path.replace('{storefront}', storefront()), request.params ?? {});
    return { status: 200, body: response.data };
  } catch (err) {
    return isNotFound(err) ? { status: 404, body: { error: 'not found' } } : { status: 502, body: { error: errorMessage(err) } };
  }
}

/** Runs commands from the phone remote, relayed by the main process, and answers its requests. */
function useRemoteCommands() {
  useEffect(() => window.ahahh?.onRemoteRequest(answerRemote), []);
  useEffect(
    () =>
      window.ahahh?.onRemoteCommand((command) => {
        const music = mk();
        switch (command.action) {
          case 'play':
            void music.play();
            break;
          case 'pause':
            music.pause();
            break;
          case 'toggle':
            if (music.isPlaying) music.pause();
            else void music.play();
            break;
          case 'next':
            void music.skipToNextItem();
            break;
          case 'previous':
            void music.skipToPreviousItem();
            break;
          case 'seek':
            void music.seekToTime(command.value);
            break;
          case 'volume':
            music.volume = command.value;
            break;
          case 'shuffle':
            music.shuffleMode = command.value ? ShuffleMode.songs : ShuffleMode.off;
            break;
          case 'repeat':
            music.repeatMode = command.value;
            break;
          case 'playItem': {
            const { type, id, startWith, shuffle } = command.value;
            if (type === 'songs' || type === 'library-songs') void playSongs([{ id, type }], 0, shuffle);
            else void playContainer({ id, type }, startWith, shuffle);
            break;
          }
          case 'playSongs': {
            const { ids, startWith, shuffle } = command.value;
            void playSongs(ids.map((id) => ({ id, type: 'songs' })), startWith, shuffle);
            break;
          }
          case 'playNext':
            void playNext(command.value);
            break;
          case 'jumpTo':
            void music.changeToMediaAtIndex(command.value);
            break;
          case 'removeFromQueue':
            removeFromQueue(command.value);
            break;
          case 'moveInQueue':
            moveInQueue(command.value.from, command.value.to);
            break;
          case 'favorite':
            if (music.nowPlayingItem) void setFavorite(songRef(music.nowPlayingItem), command.value);
            break;
        }
      }),
    [],
  );
}

/** Feeds the OS media overlay (Windows media flyout, keyboard media keys). */
function useMediaSession({ item, isPlaying }: PlayerState) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const music = mk();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void music.play()],
      ['pause', () => music.pause()],
      ['previoustrack', () => void music.skipToPreviousItem()],
      ['nexttrack', () => void music.skipToNextItem()],
      ['seekto', (details) => details.seekTime != null && void music.seekToTime(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action on this platform.
      }
    }
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const art = itemArtwork(item, 512);
    navigator.mediaSession.metadata = item
      ? new MediaMetadata({
          title: itemTitle(item),
          artist: itemArtist(item),
          album: itemAlbum(item),
          artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
        })
      : null;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : item ? 'paused' : 'none';
  }, [item, isPlaying]);
}
