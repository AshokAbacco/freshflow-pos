import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';

/** GET with cancellation of stale requests; re-runs whenever `params` (serialised) changes. */
export function useApiQuery(url, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const controllerRef = useRef(null);
  const key = JSON.stringify(params ?? {});

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(url, { params: JSON.parse(key), signal: controller.signal });
      setState({ data, loading: false, error: null });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [url, key]);

  useEffect(() => {
    if (enabled) run();
    return () => controllerRef.current?.abort();
  }, [run, enabled]);

  return { ...state, refetch: run };
}
