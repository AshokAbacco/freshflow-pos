import { useEffect, useRef } from 'react';

/** Map of key (e.g. "F2", "F8") → handler. Ignored while a dialog is open. */
export function useHotkeys(map, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const fn = ref.current[e.key];
      if (!fn || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
