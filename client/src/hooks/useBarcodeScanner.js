import { useEffect, useRef } from 'react';

/**
 * Keyboard-wedge barcode scanners "type" the code very fast and finish with Enter.
 * This listens globally so a scan works even when the search box isn't focused,
 * while ignoring normal human typing inside form fields.
 */
export function useBarcodeScanner(onScan, { enabled = true, minLength = 4, maxGapMs = 40 } = {}) {
  const buffer = useRef('');
  const lastTime = useRef(0);
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      const target = e.target;
      const typingInField = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typingInField || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;

      const now = performance.now();
      if (now - lastTime.current > maxGapMs) buffer.current = '';
      lastTime.current = now;

      if (e.key === 'Enter') {
        if (buffer.current.length >= minLength) {
          e.preventDefault();
          handler.current(buffer.current);
        }
        buffer.current = '';
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, minLength, maxGapMs]);
}
