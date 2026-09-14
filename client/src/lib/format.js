const currencyFormatters = new Map();

export function formatMoney(value, currency = 'INR') {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return currencyFormatters.get(currency).format(Number(value || 0));
}

const compactFormatters = new Map();
export function formatCompactMoney(value, currency = 'INR') {
  if (!compactFormatters.has(currency)) {
    compactFormatters.set(currency, new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }));
  }
  return compactFormatters.get(currency).format(Number(value || 0));
}

const numberFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const formatNumber = (n) => numberFmt.format(Number(n || 0));

export function formatQuantity(quantity, unit, soldByWeight) {
  if (soldByWeight) return `${Number(quantity).toFixed(3)} ${unit}`;
  return `${formatNumber(quantity)} ${unit}`;
}

export function formatPercentChange(current, previous) {
  if (!previous) return current ? { label: 'New', direction: 'up' } : { label: '0%', direction: 'flat' };
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.abs(change) >= 100 ? Math.round(change) : Math.round(change * 10) / 10;
  return { label: `${rounded > 0 ? '+' : ''}${rounded}%`, direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat', value: change };
}

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatDateTime = (d) => dateTimeFmt.format(new Date(d));

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
export const formatTime = (d) => timeFmt.format(new Date(d));

export const invoiceLabel = (invoiceNo) => `INV-${String(invoiceNo).padStart(6, '0')}`;

export function relativeTime(ms) {
  if (!ms) return 'never';
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDateTime(ms);
}
