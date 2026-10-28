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

type AhAhhUpdateStatus = 'idle' | 'latest' | 'downloading' | 'ready' | 'error';

interface AhAhhBridge {
  platform: string;
  /** Prefs as they were when the page loaded (read synchronously by the preload). */
  prefs?: AhAhhPrefs;
  getDeveloperToken(): Promise<string | null>;
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
}

interface Window {
  ahahh?: AhAhhBridge;
}
