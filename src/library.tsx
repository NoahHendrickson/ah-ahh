import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { all, type Resource } from './musickit';

interface Library {
  playlists: Resource[];
  loading: boolean;
  error?: unknown;
  refresh(): void;
}

const LibraryContext = createContext<Library | null>(null);

/** The user's library playlists, shared by the sidebar and the Playlists page. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  const refresh = useCallback(() => {
    setLoading(true);
    all('/v1/me/library/playlists', { limit: 100 })
      .then((items) => {
        setPlaylists(items);
        setError(undefined);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return <LibraryContext.Provider value={{ playlists, loading, error, refresh }}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return library;
}
