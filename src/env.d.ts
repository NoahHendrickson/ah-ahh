/// <reference types="vite/client" />

interface EncoreInfo {
  version: string;
  overlayUrl: string;
  nowPlayingTextUrl: string;
  widevine: Record<string, { title?: string; status?: string; version?: string }>;
}

interface EncorePrefs {
  glass: boolean;
  /** 0–1: how dark/opaque the tint over the frosted glass is. */
  glassTint: number;
  glassSupported: boolean;
}

interface EncoreBridge {
  platform: string;
  /** Prefs as they were when the page loaded (read synchronously by the preload). */
  prefs?: EncorePrefs;
  getDeveloperToken(): Promise<string | null>;
  saveCredentials(creds: { teamId: string; keyId: string; privateKey: string }): Promise<string>;
  resetCredentials(): Promise<void>;
  getInfo(): Promise<EncoreInfo>;
  getPrefs(): Promise<EncorePrefs>;
  setPrefs(patch: Partial<Pick<EncorePrefs, 'glass' | 'glassTint'>>): Promise<EncorePrefs>;
  publishNowPlaying(state: Record<string, unknown>): void;
}

interface Window {
  encore?: EncoreBridge;
}
