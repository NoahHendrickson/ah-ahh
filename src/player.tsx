import { createContext, useContext, useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { mk, nowPlayingIds, type MediaItem, type MusicKitInstance } from './musickit';

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

/** Pushes now-playing info to the main process, which relays it to the OBS overlay. */
function useNowPlayingBroadcast(state: PlayerState) {
  const { item, isPlaying, duration } = state;

  useEffect(() => {
    const music = mk();
    let last = { positionMs: 0, updatedAt: 0, playing: false };

    const publish = () => {
      const positionMs = (music.currentPlaybackTime || 0) * 1000;
      last = { positionMs, updatedAt: Date.now(), playing: music.isPlaying };
      window.ahahh?.publishNowPlaying({
        playing: music.isPlaying,
        title: item ? itemTitle(item) : null,
        artist: itemArtist(item),
        album: itemAlbum(item),
        artwork: itemArtwork(item, 300) ?? null,
        durationMs: duration * 1000,
        positionMs,
        updatedAt: last.updatedAt,
      });
    };

    // Re-sync after seeks: if the real position drifts from what the overlay is predicting.
    const onTime = () => {
      const predicted = last.positionMs + (last.playing ? Date.now() - last.updatedAt : 0);
      if (Math.abs(predicted - (music.currentPlaybackTime || 0) * 1000) > 1500) publish();
    };

    publish();
    const timer = setInterval(publish, 10_000);
    music.addEventListener('playbackTimeDidChange', onTime);
    return () => {
      clearInterval(timer);
      music.removeEventListener('playbackTimeDidChange', onTime);
    };
  }, [item, isPlaying, duration]);
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
