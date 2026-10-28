/// <reference types="vite/client" />

interface AhAhhInfo {
  version: string;
  overlayUrl: string;
  nowPlayingTextUrl: string;
  widevine: Record<string, { title?: string; status?: string; version?: string }>;
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
  | { action: 'repeat'; value: 0 | 1 | 2 };

type AhAhhUpdateStatus = 'idle' | 'latest' | 'downloading' | 'ready' | 'error';

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
  getPrefs(): Promise<AhAhhPrefs>;
  setPrefs(patch: Partial<Pick<AhAhhPrefs, 'glass' | 'glassTint'>>): Promise<AhAhhPrefs>;
  publishNowPlaying(state: Record<string, unknown>): void;
  getUpdateStatus(): Promise<AhAhhUpdateStatus>;
  /** Returns an unsubscribe function. */
  onUpdateStatus(callback: (status: AhAhhUpdateStatus) => void): () => void;
  installUpdate(): Promise<void>;
  getRemotePairing(): Promise<AhAhhRemotePairing>;
  setRemoteEnabled(enabled: boolean): Promise<AhAhhRemotePairing>;
  resetRemotePairing(): Promise<AhAhhRemotePairing>;
  /** Commands from the phone remote. Returns an unsubscribe function. */
  onRemoteCommand(callback: (command: AhAhhRemoteCommand) => void): () => void;
}

interface Window {
  ahahh?: AhAhhBridge;
}
