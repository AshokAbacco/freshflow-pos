import { useEffect, useRef } from "react";
import { useScannerStore } from "../store/scannerStore.js";

/*
 * The keyboard-wedge listener is installed once for the whole app, however many components
 * are listening for scans. Installing it per component would mean one trigger pull producing
 * one scan per mounted listener.
 */
let installed = 0;
let detach = null;

function installWedgeListener() {
  installed += 1;
  if (installed > 1) return;

  const buffer = { value: "", lastAt: 0 };

  const onKeyDown = (event) => {
    const store = useScannerStore.getState();
    if (!store.settings.wedgeEnabled) return;

    const { maxGapMs } = store.settings;
    const target = event.target;

    /*
     * While the cursor is in a field, the field owns the keystrokes: the characters belong in
     * it and its own Enter handler acts on them. Stealing them here would both duplicate the
     * scan and leave the field half-filled. Scanners on serial or camera do not produce
     * keystrokes at all, so they still reach every listener regardless of focus.
     */
    const inField =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (inField || event.ctrlKey || event.metaKey || event.altKey) return;

    const now = performance.now();
    // A gap longer than a machine would leave means this is a person, so start over.
    if (now - buffer.lastAt > maxGapMs) buffer.value = "";
    buffer.lastAt = now;

    // Scanners are configured to finish with Enter or, less often, Tab.
    if (event.key === "Enter" || event.key === "Tab") {
      const candidate = buffer.value;
      buffer.value = "";
      if (candidate.length >= store.settings.minLength) {
        event.preventDefault();
        store.emitScan(candidate, "wedge");
      }
      return;
    }

    if (event.key.length === 1) buffer.value += event.key;
  };

  window.addEventListener("keydown", onKeyDown, true);
  detach = () => window.removeEventListener("keydown", onKeyDown, true);
}

function removeWedgeListener() {
  installed -= 1;
  if (installed <= 0) {
    installed = 0;
    detach?.();
    detach = null;
  }
}

/**
 * Calls `onScan(code)` whenever a barcode arrives, from any connected scanner.
 *
 * @param {(code: string, scan: object) => void} onScan
 * @param {object}  [options]
 * @param {boolean} [options.enabled]  pause without unmounting, e.g. while a modal is open
 */
export function useBarcodeScanner(onScan, { enabled = true } = {}) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    installWedgeListener();
    // One subscription per consumer, fed by whichever transport produced the scan.
    const unsubscribe = useScannerStore.getState().onScan((scan) => {
      handler.current?.(scan.code, scan);
    });
    return () => {
      unsubscribe();
      removeWedgeListener();
    };
  }, [enabled]);
}

/**
 * The store's own view of scanner state, for screens that show or configure it.
 * Re-exported here so a component needs only one import to work with scanning.
 */
export { useScannerStore };
