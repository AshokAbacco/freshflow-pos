/**
 * Barcode input, from whatever the shop actually owns.
 *
 * Three transports, because "connect a barcode scanner" means something different depending on
 * the hardware on the counter:
 *
 *   wedge   Keyboard-emulating scanners: almost every USB scanner, and Bluetooth ones paired
 *           as a keyboard. Nothing to connect -- they type. Always listening, costs nothing.
 *   serial  USB/RS-232 scanners in serial mode, over Web Serial. Needs Chrome or Edge on a
 *           computer and an explicit port choice by the user. Same mechanism this project
 *           already uses for the weighing scale and the receipt printer.
 *   camera  The device's own camera via the native BarcodeDetector. For a phone or tablet
 *           with no hardware scanner at all.
 *
 * A scan is an event, not state: scanning the same tin twice in a row is a normal thing to do
 * at a till, so listeners are notified each time rather than diffing a value. `lastScan` is
 * kept as well, purely so the setup screen can show what came through.
 */
import { create } from "zustand";
import {
  detectSymbology,
  hasValidCheckDigit,
  looksScannable,
  normalizeBarcode,
} from "../lib/barcode.js";

const SETTINGS_KEY = "ff_scanner_settings";

const hasSerial = typeof navigator !== "undefined" && "serial" in navigator;
const hasBarcodeDetector =
  typeof window !== "undefined" && "BarcodeDetector" in window;
const hasCamera =
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/** Formats the camera can read. Narrowed to retail symbologies to cut false positives. */
const CAMERA_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

const DEFAULT_SETTINGS = {
  /** Keyboard-wedge listening. Off only if a scanner misbehaves and the shop wants it quiet. */
  wedgeEnabled: true,
  /** Characters a scanner has been configured to wrap its output with. */
  prefix: "",
  suffix: "",
  /** Shorter than this is treated as stray typing rather than a scan. */
  minLength: 4,
  /**
   * The same code arriving twice inside this window counts once. Scanners sometimes fire
   * twice on one trigger pull. Kept low so two genuine scans of two identical tins still
   * register as two.
   */
  dedupeMs: 350,
  /** Longest gap between keystrokes still considered machine-fast rather than human. */
  maxGapMs: 50,
  /** Refuse a check-digit failure instead of looking it up. Off by default: many shops print
   *  their own labels that have no valid check digit at all. */
  requireValidCheckDigit: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : { ...DEFAULT_SETTINGS };
  } catch {
    // Private windows and blocked site data both land here; defaults are fine.
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* preference only; losing it is not worth interrupting a sale */
  }
}

/** Scan listeners, outside zustand because these are events. */
const listeners = new Set();
let lastEmit = { code: null, at: 0 };

let serialReader = null;
let serialPort = null;
let cameraStream = null;
let cameraLoop = null;
let detector = null;

export const useScannerStore = create((set, get) => ({
  settings: loadSettings(),
  serial: { status: "disconnected", error: null, baudRate: 9600 },
  camera: { status: "idle", error: null },
  lastScan: null,
  /** Counts scans this session; the setup screen uses it to show that input is arriving. */
  scanCount: 0,

  capabilities: {
    wedge: true,
    serial: hasSerial,
    camera: hasCamera && hasBarcodeDetector,
  },

  /** Why a transport is unavailable, for the setup screen to explain rather than just disable. */
  unavailableReason(transport) {
    if (transport === "serial" && !hasSerial) {
      return "Serial scanners need Chrome or Edge on a computer, over https or localhost.";
    }
    if (transport === "camera") {
      if (!hasCamera)
        return "This device has no camera available to the browser.";
      if (!hasBarcodeDetector) {
        return "This browser cannot read barcodes from the camera. Chrome or Edge on Android, or Chrome on a computer, can.";
      }
    }
    return null;
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },

  resetSettings() {
    saveSettings(DEFAULT_SETTINGS);
    set({ settings: { ...DEFAULT_SETTINGS } });
  },

  onScan(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * The single way a scan enters the app, whichever transport produced it.
   * Returns the accepted code, or null when the input was discarded.
   */
  emitScan(raw, source = "wedge") {
    const { settings } = get();
    const code = normalizeBarcode(raw, {
      prefix: settings.prefix,
      suffix: settings.suffix,
    });
    if (!looksScannable(code, { minLength: settings.minLength })) return null;

    const now = Date.now();
    if (code === lastEmit.code && now - lastEmit.at < settings.dedupeMs)
      return null;

    const symbology = detectSymbology(code);
    const checkDigitOk = hasValidCheckDigit(code);

    // Only meaningful for fixed-length GS1 codes; a store's own Code 128 label has no check digit.
    const checkable =
      [8, 12, 13, 14].includes(code.length) && /^\d+$/.test(code);
    if (settings.requireValidCheckDigit && checkable && !checkDigitOk) {
      set({
        lastScan: { code, source, symbology, at: now, rejected: "CHECK_DIGIT" },
      });
      return null;
    }

    lastEmit = { code, at: now };
    const scan = {
      code,
      source,
      symbology,
      checkDigitOk: checkable ? checkDigitOk : null,
      at: now,
    };
    set({ lastScan: scan, scanCount: get().scanCount + 1 });
    for (const listener of listeners) {
      try {
        listener(scan);
      } catch (err) {
        // One bad listener must not stop the others, or the till stops taking scans.
        console.error("[scanner] listener failed:", err);
      }
    }
    return code;
  },

  // ----------------------------------------------------------------- serial

  async connectSerial(baudRate = get().serial.baudRate) {
    if (!hasSerial) {
      set({
        serial: {
          ...get().serial,
          status: "error",
          error: get().unavailableReason("serial"),
        },
      });
      return;
    }
    try {
      set({ serial: { ...get().serial, status: "connecting", error: null } });
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      serialPort = port;
      set({ serial: { status: "connected", error: null, baudRate } });
      get()._readSerial(port);
    } catch (err) {
      // The user closing the port picker is not an error worth showing.
      if (err.name === "NotFoundError") {
        set({
          serial: { ...get().serial, status: "disconnected", error: null },
        });
        return;
      }
      set({ serial: { ...get().serial, status: "error", error: err.message } });
    }
  },

  async _readSerial(port) {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    serialReader = decoder.readable.getReader();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await serialReader.read();
        if (done) break;
        buffer += value;
        // Serial scanners terminate each read with CR, LF or both.
        const parts = buffer.split(/\r?\n|\r/);
        buffer = parts.pop() ?? "";
        for (const line of parts) get().emitScan(line, "serial");
        // A scanner configured with no terminator would grow the buffer forever.
        if (buffer.length > 256) buffer = "";
      }
    } catch (err) {
      set({ serial: { ...get().serial, status: "error", error: err.message } });
    } finally {
      try {
        serialReader?.releaseLock();
      } catch {
        /* already released */
      }
    }
  },

  async disconnectSerial() {
    try {
      await serialReader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      await serialPort?.close();
    } catch {
      /* ignore */
    }
    serialReader = null;
    serialPort = null;
    set({ serial: { ...get().serial, status: "disconnected", error: null } });
  },

  // ----------------------------------------------------------------- camera

  /**
   * @param {HTMLVideoElement} video element to show the preview in
   */
  async startCamera(video) {
    const reason = get().unavailableReason("camera");
    if (reason) {
      set({ camera: { status: "error", error: reason } });
      return;
    }
    try {
      set({ camera: { status: "starting", error: null } });
      // The back camera is the one pointed at the shelf.
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      video.srcObject = cameraStream;
      await video.play();

      detector =
        detector ?? new window.BarcodeDetector({ formats: CAMERA_FORMATS });
      set({ camera: { status: "scanning", error: null } });

      const tick = async () => {
        if (get().camera.status !== "scanning") return;
        try {
          const found = await detector.detect(video);
          if (found.length) get().emitScan(found[0].rawValue, "camera");
        } catch {
          // Detection throws on a frame that isn't ready yet; the next frame is along shortly.
        }
        // ~8 frames a second: fast enough to feel instant, slow enough not to flatten a tablet.
        cameraLoop = setTimeout(tick, 120);
      };
      tick();
    } catch (err) {
      const message =
        err.name === "NotAllowedError"
          ? "Camera access was declined. Allow it in the browser’s site settings to scan this way."
          : err.message;
      set({ camera: { status: "error", error: message } });
      get().stopCamera();
    }
  },

  stopCamera() {
    if (cameraLoop) clearTimeout(cameraLoop);
    cameraLoop = null;
    for (const track of cameraStream?.getTracks() ?? []) track.stop();
    cameraStream = null;
    if (get().camera.status !== "error")
      set({ camera: { status: "idle", error: null } });
  },
}));

/** For tests and for the setup screen's "restore defaults". */
export { DEFAULT_SETTINGS };
