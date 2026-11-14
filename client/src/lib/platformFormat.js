/**
 * Shared presentation for the platform panel.
 *
 * Entitlement state is the panel's main signal, so it has to look the same on the dashboard,
 * the stores list and a store's own page. Copy-pasting the colour map into each page is how
 * "amber means grace" quietly becomes "amber means grace, except on that one screen".
 */

/** One state, one colour, everywhere. */
export const STATE_STYLE = {
  TRIAL: "bg-sky-50 text-sky-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  GRACE_PERIOD: "bg-amber-50 text-amber-700",
  EXPIRED: "bg-rose-50 text-rose-700",
  SUSPENDED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export const STATE_LABEL = {
  TRIAL: "On trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment due",
  GRACE_PERIOD: "In grace",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

/** Every state the list may be filtered by, in the order an operator thinks about them. */
export const STATE_ORDER = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
];

export const PAYMENT_STYLE = {
  PAID: "bg-emerald-50 text-emerald-700",
  CREATED: "bg-slate-100 text-slate-600",
  ATTEMPTED: "bg-amber-50 text-amber-700",
  FAILED: "bg-rose-50 text-rose-700",
  REFUNDED: "bg-slate-100 text-slate-600",
};

export const BUSINESS_LABEL = {
  KIRANA: "Kirana",
  SUPERMARKET: "Supermarket",
  MINI_MART: "Mini mart",
  DEPARTMENTAL: "Departmental",
  OTHER: "Other",
};

export const ROLE_LABEL = {
  SUPER_ADMIN: "Super admin",
  SUPPORT: "Support",
  FINANCE: "Finance",
  ADMIN: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

export const inr = (value, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

export const when = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";

export const whenExact = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

/**
 * "3 days ago" / "in 5 days". A support person scanning a list cares about distance from today,
 * not the date -- the date is in the tooltip for when they need to quote it.
 */
export function sinceNow(value) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  const past = diff >= 0;
  const mins = Math.abs(Math.round(diff / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return past ? `${days}d ago` : `in ${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return past ? `${months}mo ago` : `in ${months}mo`;
  return past
    ? `${Math.round(months / 12)}y ago`
    : `in ${Math.round(months / 12)}y`;
}

/** Phone as a dialable string for a tel: link, keeping a leading +. */
export const telHref = (phone) => {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
};
