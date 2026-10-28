import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { page, type Resource } from './musickit';

export interface AsyncState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
}

export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Incrementally loads a paginated library endpoint (songs, albums) as the user scrolls. */
export function usePaged(path: string, pageSize = 100) {
  const [items, setItems] = useState<Resource[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>();
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || next === null) return;
    busy.current = true;
    setLoading(true);
    try {
      const result = next ? await page(next) : await page(path, { limit: pageSize });
      setItems((prev) => [...prev, ...result.data]);
      setNext(result.next ?? null);
    } catch (err) {
      setError(err);
      setNext(null);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [next, path, pageSize]);

  useEffect(() => {
    if (next === undefined) void loadMore();
  }, [next, loadMore]);

  return { items, loading, error, done: next === null, loadMore };
}

/** Loads every page of an endpoint in the background, publishing items as each page arrives. `complete`: every item arrived. */
export function useAllPages(path: string, pageSize = 100, max = 5000) {
  const [state, setState] = useState<{ items: Resource[]; loading: boolean; complete?: boolean; error?: unknown }>({ items: [], loading: true });
  useEffect(() => {
    let alive = true;
    setState({ items: [], loading: true });
    (async () => {
      let result = await page(path, { limit: pageSize });
      let count = 0;
      while (alive) {
        const { data, next } = result;
        count += data.length;
        const more = Boolean(next) && count < max;
        setState((s) => ({ items: [...s.items, ...data], loading: more, complete: !next }));
        if (!more) break;
        result = await page(next!);
      }
    })().catch((error) => alive && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      alive = false;
    };
  }, [path, pageSize, max]);
  return state;
}

/** Calls `onVisible` whenever the returned ref's element scrolls into view. */
export function useOnVisible(onVisible: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && callback.current(), {
      rootMargin: '600px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}
