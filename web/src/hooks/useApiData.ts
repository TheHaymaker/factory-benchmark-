import { useCallback, useEffect, useState } from 'react';

export interface ApiData<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data from the API and re-load whenever `deps` change. Pass `null` as the
 * loader to skip loading (e.g. while a required id is not chosen yet).
 */
export function useApiData<T>(loader: (() => Promise<T>) | null, deps: unknown[]): ApiData<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(loader !== null);
  const [version, setVersion] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader ?? (() => Promise.resolve(undefined as T)), deps);
  const enabled = loader !== null;

  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    load()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(undefined);
      })
      .catch((err: Error) => active && setError(err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
