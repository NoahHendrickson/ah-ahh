/// <reference types="vite/client" />

interface AhAhhInfo {
  version: string;
  overlayUrl: string;
  nowPlayingTextUrl: string;
  widevine: Record<string, { title?: string; status?: string; version?: string }>;
}

/** The computer account's name and picture (a data URL, or null if there isn't one). */
interface AhAhhProfile {
  name: string;
  photo: string | null;
}

interface AhAhhPrefs {
  glass: boolean;
  /** 0–1: how dark/opaque the tint over the frosted glass is. */
  glassTint: number;
  glassSupported: boolean;
}

interface AhAhhRemotePairing {
  enabled: boolean;
  /** Set when the remote server couldn't start (e.g. the port is taken). */
  error: string | null;
  /** The rest is only there while the server is running. */
  url?: string;
  /** QR code of `url`, as a PNG data URL. */
  qr?: string;
  hosts?: string[];
  port?: number;
}

type AhAhhRemoteCommand =
  | { action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' }
  | { action: 'seek' | 'volume'; value: number }
  | { action: 'shuffle'; value: boolean }
  | { action: 'repeat'; value: 0 | 1 | 2 }
  | { action: 'playItem'; value: { type: string; id: string; startWith: number; shuffle?: boolean } }
  | { action: 'playSongs'; value: { ids: string[]; startWith: number; shuffle?: boolean } }
  | { action: 'playNext'; value: { id: string; type: 'songs' | 'library-songs' } }
  | { action: 'jumpTo' | 'removeFromQueue'; value: number }
  /** `to` is the index the song ends up at. */
  | { action: 'moveInQueue'; value: { from: number; to: number } }
  | { action: 'favorite'; value: boolean };

/** Something the phone remote asked for; `path` was already checked by the main process. */
type AhAhhRemoteRequest = { kind: 'queue' } | { kind: 'music'; path: string; params?: Record<string, string | number | boolean> };

/** The HTTP status and JSON body the phone gets back. */
interface AhAhhRemoteReply {
  status: number;
  body: unknown;
}

type AhAhhUpdateStatus = 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error';

interface AhAhhBridge {
  platform: string;
  /** Prefs as they were when the page loaded (read synchronously by the preload). */
  prefs?: AhAhhPrefs;
  getDeveloperToken(): Promise<string | null>;
  /** Whether you saved your own MusicKit key, and the state of the token release builds ship with. */
  getKeyStatus(): Promise<{ ownKey: boolean; builtIn: 'valid' | 'expired' | 'none' }>;
  saveCredentials(creds: { teamId: string; keyId: string; privateKey: string }): Promise<string>;
  resetCredentials(): Promise<void>;
  getInfo(): Promise<AhAhhInfo>;
  getProfile(): Promise<AhAhhProfile>;
  getPrefs(): Promise<AhAhhPrefs>;
  setPrefs(patch: Partial<Pick<AhAhhPrefs, 'glass' | 'glassTint'>>): Promise<AhAhhPrefs>;
  publishNowPlaying(state: Record<string, unknown>): void;
  getUpdateStatus(): Promise<AhAhhUpdateStatus>;
  /** Returns an unsubscribe function. */
  onUpdateStatus(callback: (status: AhAhhUpdateStatus) => void): () => void;
  checkForUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  getRemotePairing(): Promise<AhAhhRemotePairing>;
  setRemoteEnabled(enabled: boolean): Promise<AhAhhRemotePairing>;
  resetRemotePairing(): Promise<AhAhhRemotePairing>;
  /** Commands from the phone remote. Returns an unsubscribe function. */
  onRemoteCommand(callback: (command: AhAhhRemoteCommand) => void): () => void;
  /** Requests from the phone remote. Returns an unsubscribe function. */
  onRemoteRequest(handler: (request: AhAhhRemoteRequest) => Promise<AhAhhRemoteReply>): () => void;
}

interface Window {
  ahahh?: AhAhhBridge;
}
