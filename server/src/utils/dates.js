const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isIsoDate = (s) => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const toUtc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso, n) => fromUtc(toUtc(iso) + n * DAY_MS);
export const diffDays = (fromIso, toIso) => Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Describe the selected period and the equally long period right before it. */
export function comparePeriods(from, to) {
  const days = diffDays(from, to) + 1;
  return {
    from,
    to,
    days,
    prevFrom: addDays(from, -days),
    prevTo: addDays(from, -1),
    granularity: days === 1 ? 'hour' : days <= 120 ? 'day' : 'week',
  };
}

/** ISO weekday Monday on/before the date (matches Postgres date_trunc('week')). */
export function mondayOf(iso) {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Every bucket key in a period so charts have no gaps. Keys match the SQL `to_char` format. */
export function bucketsFor(from, to, granularity) {
  const out = [];
  if (granularity === 'hour') {
    for (let h = 0; h < 24; h += 1) {
      const hh = String(h).padStart(2, '0');
      out.push({ key: `${from}T${hh}:00`, label: `${hh}:00` });
    }
  } else if (granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: `${d}T00:00`, label: shortDate(d) });
  } else {
    for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push({ key: `${d}T00:00`, label: `Wk ${shortDate(d)}` });
  }
  return out;
}
