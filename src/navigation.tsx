import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { playContainer, playSongs, type Resource } from './musickit';

export type Route =
  | { view: 'home' }
  | { view: 'search'; term?: string }
  | { view: 'songs' }
  | { view: 'albums' }
  | { view: 'playlists' }
  | { view: 'collection'; item: Resource }
  | { view: 'artist'; id: string; name?: string }
  | { view: 'settings' };

interface Navigation {
  route: Route;
  /** Changes on navigate/back but not on replace, e.g. for page-enter animations and scroll reset. */
  pageKey: number;
  canGoBack: boolean;
  navigate(route: Route): void;
  /** Swap the current route in place (e.g. remembering a search term) without adding history. */
  replace(route: Route): void;
  back(): void;
  /** Open whatever an API resource is: albums/playlists/artists navigate, songs/stations play. */
  open(item: Resource): void;
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const nextKey = useRef(1);
  const [stack, setStack] = useState<{ route: Route; key: number }[]>([{ route: { view: 'home' }, key: 0 }]);

  const navigate = useCallback(
    (route: Route) => setStack((s) => [...s.slice(-49), { route, key: nextKey.current++ }]),
    [],
  );
  const replace = useCallback(
    (route: Route) => setStack((s) => [...s.slice(0, -1), { route, key: s[s.length - 1].key }]),
    [],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const open = useCallback(
    (item: Resource) => {
      if (item.type === 'artists') navigate({ view: 'artist', id: item.id, name: item.attributes?.name });
      else if (/albums$|playlists$/.test(item.type)) navigate({ view: 'collection', item });
      else if (item.type === 'stations') void playContainer(item);
      else if (/songs$/.test(item.type)) void playSongs([item]);
    },
    [navigate],
  );

  const value = useMemo(() => {
    const top = stack[stack.length - 1];
    return { route: top.route, pageKey: top.key, canGoBack: stack.length > 1, navigate, replace, back, open };
  }, [stack, navigate, replace, back, open]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNav(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error('useNav must be used inside <NavigationProvider>');
  return nav;
}
