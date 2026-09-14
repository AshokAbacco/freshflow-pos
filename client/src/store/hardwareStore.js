/**
 * Web Serial integrations for RS-232/USB weighing scales and ESC/POS receipt printers.
 * Web Serial needs Chrome/Edge on desktop and a secure context (https:// or localhost).
 */
import { create } from 'zustand';

const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

// Handles common continuous-output formats, e.g. "ST,GS,+  1.250kg", "US,NT, 0.845 kg", "  1250 g".
export function parseScaleLine(line) {
  const match = line.match(/([-+]?\s*\d+(?:\.\d+)?)\s*(kg|g|lb)?/i);
  if (!match) return null;
  let value = Number(match[1].replace(/\s/g, ''));
  const unit = (match[2] || 'kg').toLowerCase();
  if (unit === 'g') value /= 1000;
  if (unit === 'lb') value *= 0.45359237;
  if (!Number.isFinite(value)) return null;
  return { kg: Math.round(value * 1000) / 1000, stable: !/\bUS\b|unstable/i.test(line) };
}

let scaleReader = null;

export const useHardwareStore = create((set, get) => ({
  serialSupported: hasSerial,
  scale: { port: null, status: 'disconnected', reading: null, error: null, baudRate: 9600 },
  printer: { port: null, status: 'disconnected', error: null, baudRate: 9600 },

  async connectScale(baudRate = get().scale.baudRate) {
    if (!hasSerial) return;
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      set({ scale: { ...get().scale, port, baudRate, status: 'connected', error: null } });
      get()._readScale(port);
    } catch (err) {
      if (err.name !== 'NotFoundError') set({ scale: { ...get().scale, status: 'error', error: err.message } });
    }
  },

  async _readScale(port) {
    const decoder = new TextDecoderStream();
    const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
    scaleReader = decoder.readable.getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await scaleReader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split(/\r?\n|\r/);
        buffer = parts.pop();
        for (const line of parts) {
          const reading = parseScaleLine(line);
          if (reading) set({ scale: { ...get().scale, reading: { ...reading, at: Date.now() } } });
        }
      }
    } catch (err) {
      set({ scale: { ...get().scale, status: 'error', error: err.message } });
    } finally {
      scaleReader?.releaseLock();
      await closed;
    }
  },

  async disconnectScale() {
    const { port } = get().scale;
    try {
      await scaleReader?.cancel();
      await port?.close();
    } catch {
      /* port already closed */
    }
    scaleReader = null;
    set({ scale: { ...get().scale, port: null, status: 'disconnected', reading: null } });
  },

  async connectPrinter(baudRate = get().printer.baudRate) {
    if (!hasSerial) return;
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      set({ printer: { ...get().printer, port, baudRate, status: 'connected', error: null } });
    } catch (err) {
      if (err.name !== 'NotFoundError') set({ printer: { ...get().printer, status: 'error', error: err.message } });
    }
  },

  async disconnectPrinter() {
    try {
      await get().printer.port?.close();
    } catch {
      /* already closed */
    }
    set({ printer: { ...get().printer, port: null, status: 'disconnected' } });
  },

  async printBytes(bytes) {
    const { port } = get().printer;
    if (!port?.writable) throw new Error('Connect a receipt printer first');
    const writer = port.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  },
}));
