// Thin wrapper around Apple's MusicKit JS v3 (loaded from Apple's CDN at runtime).
// MusicKit ships without TypeScript types, so we describe only the parts we use.

export interface Artwork {
  url: string;
  width?: number;
  height?: number;
}

export interface PlayParams {
  id: string;
  kind: string;
  isLibrary?: boolean;
  catalogId?: string;
}

/** An Apple Music API resource (song, album, playlist, artist, station, library-*). */
export interface Resource {
  id: string;
  type: string;
  href?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    curatorName?: string;
    artwork?: Artwork;
    durationInMillis?: number;
    trackNumber?: number;
    trackCount?: number;
    contentRating?: string;
    releaseDate?: string;
    genreNames?: string[];
    playParams?: PlayParams;
    description?: { standard?: string; short?: string };
    editorialNotes?: { standard?: string; short?: string };
    url?: string;
    /** Library playlists: whether the user can add songs to it. */
    canEdit?: boolean;
  };
  relationships?: Record<string, { data: Resource[]; next?: string }>;
  views?: Record<string, { data: Resource[]; attributes?: { title?: string } }>;
}

export interface Page {
  data: Resource[];
  next?: string;
}

export interface MediaItem {
  id: string;
  songId?: string;
  title?: string;
  artistName?: string;
  albumName?: string;
  artworkURL?: string;
  playbackDuration?: number;
  attributes?: Resource['attributes'];
  playParams?: PlayParams;
  container?: { id: string; type: string };
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  storefrontId: string;
  isPlaying: boolean;
  playbackState: number;
  nowPlayingItem?: MediaItem;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  volume: number;
  shuffleMode: number;
  repeatMode: number;
  queue: { items: MediaItem[]; position: number };
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(options: Record<string, unknown>): Promise<unknown>;
  play(): Promise<void>;
  pause(): void;
  skipToNextItem(): Promise<void>;
  skipToPreviousItem(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  changeToMediaAtIndex(index: number): Promise<void>;
  playNext(options: Record<string, unknown>): Promise<void>;
  playLater(options: Record<string, unknown>): Promise<void>;
  addEventListener(name: string, fn: (event: unknown) => void): void;
  removeEventListener(name: string, fn: (event: unknown) => void): void;
  api: {
    music(path: string, params?: Record<string, unknown>, options?: { fetchOptions?: RequestInit }): Promise<{ data: any }>;
  };
}

declare global {
  interface Window {
    MusicKit?: {
      configure(options: Record<string, unknown>): Promise<MusicKitInstance>;
      getInstance(): MusicKitInstance;
    };
  }
}

/** sessionStorage flag: Settings → "Use your own MusicKit key" reloads the app into the key setup screen. */
export const OWN_KEY_SETUP = 'ahahh.ownKeySetup';

const SCRIPT_URL = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

export const PlaybackStates = { playing: 2, paused: 3, stopped: 4, ended: 5, loading: 1, waiting: 8, stalled: 9 } as const;
export const RepeatMode = { none: 0, one: 1, all: 2 } as const;
export const ShuffleMode = { off: 0, songs: 1 } as const;

let instance: MusicKitInstance | null = null;

let loadingScript: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.MusicKit) return Promise.resolve();
  loadingScript ??= new Promise<void>((resolve, reject) => {
    document.addEventListener('musickitloaded', () => resolve(), { once: true });
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => reject(new Error('Could not load MusicKit from Apple. Check your internet connection.'));
    document.head.appendChild(script);
  }).catch((err) => {
    loadingScript = null;
    throw err;
  });
  return loadingScript;
}

/** Starts downloading MusicKit early (e.g. while the developer token is fetched); initMusicKit reuses it. */
export const preloadMusicKit = (): Promise<void> => loadScript();

let configuring: Promise<MusicKitInstance> | null = null;

/** Loads and configures MusicKit once; safe to call repeatedly (React StrictMode, retries). */
export function initMusicKit(developerToken: string): Promise<MusicKitInstance> {
  configuring ??= (async () => {
    await loadScript();
    instance = await window.MusicKit!.configure({
      developerToken,
      app: { name: 'ah ahh', build: '0.1.0' },
    });
    return instance;
  })().catch((err) => {
    configuring = null;
    throw err;
  });
  return configuring;
}

export function mk(): MusicKitInstance {
  if (!instance) throw new Error('MusicKit is not configured yet');
  return instance;
}

// ---------- API helpers ----------

export async function api<T = any>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await mk().api.music(path, params);
  return response.data as T;
}

/** Fetch one page; returns an empty page when Apple answers 404 (e.g. an empty playlist). */
export async function page(path: string, params: Record<string, unknown> = {}): Promise<Page> {
  try {
    return await api<Page>(path, params);
  } catch (err) {
    if (isNotFound(err)) return { data: [] };
    throw err;
  }
}

/** Follow `next` links until the collection is exhausted (or `max` items are loaded). */
export async function all(path: string, params: Record<string, unknown> = {}, max = 5000): Promise<Resource[]> {
  const items: Resource[] = [];
  let result = await page(path, params);
  items.push(...result.data);
  while (result.next && items.length < max) {
    result = await page(result.next);
    items.push(...result.data);
  }
  return items;
}

export function isNotFound(err: unknown): boolean {
  const e = err as { errorCode?: string; status?: number; data?: { status?: number } };
  return e?.status === 404 || e?.data?.status === 404 || e?.errorCode === 'NOT_FOUND';
}

export const storefront = () => mk().storefrontId || 'us';

export async function addToLibrary(item: Resource): Promise<void> {
  const kind = item.type.replace(/^library-/, '');
  await mk().api.music('/v1/me/library', { [`ids[${kind}]`]: item.id }, { fetchOptions: { method: 'POST' } });
}

/** How the API refers to a playing song: by catalog ID when it has one, else as a library song. */
export interface SongRef {
  id: string;
  type: 'songs' | 'library-songs';
}

export function songRef(item: MediaItem): SongRef {
  const catalogId = item.playParams?.catalogId ?? (item.playParams?.isLibrary ? undefined : item.id);
  return catalogId ? { id: catalogId, type: 'songs' } : { id: item.id, type: 'library-songs' };
}

/** Favorites are "love" ratings: they show up in the user's Favorite Songs. */
export async function isFavorite(song: SongRef): Promise<boolean> {
  try {
    const response = await mk().api.music(`/v1/me/ratings/${song.type}/${song.id}`);
    return response.data.data[0]?.attributes?.value === 1;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** Window event fired after a song is favorited or unfavorited (from here or the phone); detail is { song, favorite }. */
export const FAVORITE_CHANGED = 'ahahh:favorite-changed';

export async function setFavorite(song: SongRef, favorite: boolean): Promise<void> {
  const fetchOptions = favorite
    ? { method: 'PUT', body: JSON.stringify({ type: 'rating', attributes: { value: 1 } }) }
    : { method: 'DELETE' };
  await mk().api.music(`/v1/me/ratings/${song.type}/${song.id}`, {}, { fetchOptions });
  window.dispatchEvent(new CustomEvent(FAVORITE_CHANGED, { detail: { song, favorite } }));
}

export async function addToPlaylist(playlist: Resource, song: SongRef): Promise<void> {
  await mk().api.music(`/v1/me/library/playlists/${playlist.id}/tracks`, {}, {
    fetchOptions: { method: 'POST', body: JSON.stringify({ data: [song] }) },
  });
}

// ---------- Playback helpers ----------

export function toggleShuffle(): void {
  const music = mk();
  music.shuffleMode = music.shuffleMode === ShuffleMode.off ? ShuffleMode.songs : ShuffleMode.off;
}

/** Off → all → one → off, like Apple Music. */
export function cycleRepeat(): void {
  const music = mk();
  music.repeatMode = music.repeatMode === RepeatMode.none ? RepeatMode.all : music.repeatMode === RepeatMode.all ? RepeatMode.one : RepeatMode.none;
}

/** Queue key MusicKit expects for a container resource type. */
function queueKey(type: string): string | null {
  if (type.endsWith('playlists')) return 'playlist';
  if (type.endsWith('albums')) return 'album';
  if (type === 'stations') return 'station';
  return null;
}

/** Window event fired when the user starts playing something new (not auto-advance to the next song). */
export const PLAY_STARTED = 'ahahh:play-started';

/** `shuffle` undefined keeps the user's current shuffle setting (e.g. clicking a single track). */
export async function playContainer(container: Resource, startWith = 0, shuffle?: boolean): Promise<void> {
  const key = queueKey(container.type);
  if (!key) return;
  const music = mk();
  await music.setQueue({ [key]: container.id, startWith, startPlaying: true });
  window.dispatchEvent(new Event(PLAY_STARTED));
  if (shuffle !== undefined) music.shuffleMode = shuffle ? ShuffleMode.songs : ShuffleMode.off;
}

/** Songs queued up front; the rest are appended once playback has started (MusicKit loads each one). */
const FIRST_CHUNK = 25;

export async function playSongs(songs: Resource[], startWith = 0, shuffle?: boolean): Promise<void> {
  const music = mk();
  const ids = songs.map((s) => s.id);
  const split = Math.max(FIRST_CHUNK, startWith + 1);
  await music.setQueue({ songs: ids.slice(0, split), startWith, startPlaying: true });
  window.dispatchEvent(new Event(PLAY_STARTED));
  if (shuffle !== undefined) music.shuffleMode = shuffle ? ShuffleMode.songs : ShuffleMode.off;
  const rest = ids.slice(split);
  if (rest.length) void music.playLater({ songs: rest }).catch((err) => console.warn('Could not queue the remaining songs:', err));
}

export async function playNext(song: Resource): Promise<void> {
  await mk().playNext({ song: song.id });
}

// ---------- Formatting ----------

export function artworkUrl(artwork: Artwork | undefined, size: number): string | undefined {
  if (!artwork?.url) return undefined;
  const px = String(Math.round(size * (window.devicePixelRatio || 1)));
  return artwork.url.replace('{w}', px).replace('{h}', px).replace('{f}', 'jpg');
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTotal(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} hr ${minutes % 60} min`;
}

/** IDs a now-playing item might be known by, so track rows can highlight the playing song. */
export function nowPlayingIds(item?: MediaItem): Set<string> {
  const ids = new Set<string>();
  if (!item) return ids;
  for (const id of [item.id, item.songId, item.playParams?.id, item.playParams?.catalogId]) if (id) ids.add(id);
  return ids;
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; description?: string; errorCode?: string };
  return (e.message || e.description || e.errorCode || 'Something went wrong.').replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  );
}
