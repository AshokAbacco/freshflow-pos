/** RFC 4122 v4 UUID. crypto.randomUUID only exists on HTTPS/localhost; LAN terminals over http need the fallback. */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const TERMINAL_KEY = 'ff_terminal_id';

/** Stable per-device register id, e.g. "T-8K2Q". */
export function terminalId() {
  let id = localStorage.getItem(TERMINAL_KEY);
  if (!id) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = crypto.getRandomValues(new Uint8Array(4));
    id = `T-${[...random].map((b) => alphabet[b % alphabet.length]).join('')}`;
    localStorage.setItem(TERMINAL_KEY, id);
  }
  return id;
}
