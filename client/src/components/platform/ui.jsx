import {
  LuCircleAlert,
  LuLoaderCircle,
  LuRefreshCw,
  LuSearch,
  LuX,
} from "react-icons/lu";

/**
 * The parts every list screen in the panel is built from.
 *
 * Follow-ups, Users, Payments, Webhooks and the Audit log are all the same shape: a title with
 * a count, a search box, some filter chips, a table, a pager. Five copies of that scaffolding
 * would drift into five slightly different screens, which is how a back office starts feeling
 * unfinished. One set of pieces, used five times.
 */

export function Page({ title, subtitle, actions, children, wide }) {
  return (
    <div
      className={`mx-auto w-full ${wide ? "max-w-[1400px]" : "max-w-[1100px]"} p-4 lg:p-6`}
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-extrabold text-slate-900">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 text-desc text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function ReloadButton({ onClick, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
      aria-label="Reload"
      title="Reload"
    >
      <LuRefreshCw
        size={16}
        className={busy ? "animate-spin" : ""}
        aria-hidden
      />
    </button>
  );
}

/** Submits on Enter; the caller decides what the term means. */
export function SearchBox({ value, onChange, onSubmit, placeholder, label }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex min-w-[220px] flex-1 items-center gap-2"
    >
      <div className="relative flex-1">
        <LuSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-10 rounded-lg bg-slate-900 px-3 text-body font-semibold text-white transition hover:bg-slate-800"
      >
        Search
      </button>
    </form>
  );
}

/** A toggle chip. `tone` tints it when it carries a warning count. */
export function Chip({ on, onClick, children, tone }) {
  const active =
    tone === "warn"
      ? "border-amber-500 bg-amber-500 text-white"
      : tone === "danger"
        ? "border-rose-600 bg-rose-600 text-white"
        : "border-slate-900 bg-slate-900 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-8 shrink-0 rounded-full border px-3 text-desc font-semibold transition ${
        on
          ? active
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

export function ClearFilters({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1 rounded-full px-2.5 text-desc font-semibold text-slate-500 transition hover:bg-slate-100"
    >
      <LuX size={13} aria-hidden />
      Clear all
    </button>
  );
}

export function Select({ label, value, onChange, options, any = "Any" }) {
  return (
    <label className="flex items-center gap-1.5 text-desc text-slate-500">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <p
      className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-body text-rose-800"
      role="alert"
    >
      <LuCircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline"
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}

export function Loading({ what = "Loading" }) {
  return (
    <div className="grid place-items-center gap-2 p-12 text-slate-400">
      <LuLoaderCircle className="animate-spin" size={22} aria-hidden />
      <p className="text-desc">{what}…</p>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="p-12 text-center">
      <p className="text-body font-semibold text-slate-700">{title}</p>
      {children ? (
        <p className="mt-1 text-desc text-slate-500">{children}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** A plain card that holds a table or list. */
export function Card({ children, className = "" }) {
  return (
    <div
      className={`mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function Th({ children, align }) {
  return (
    <th className={`px-4 py-2.5 ${align === "right" ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

export function TableHead({ children }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-desc font-semibold text-slate-500">
        {children}
      </tr>
    </thead>
  );
}

export function Pagination({ page, pageSize, total, onPage, busy }) {
  if (total <= pageSize) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-desc text-slate-500">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
        {total.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || busy}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-body font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-1 text-desc text-slate-500">
          Page {page} of {last}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= last || busy}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-body font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** A coloured pill. Used for states, payment status, roles. */
export function Pill({ className, children }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-desc font-semibold ${
        className ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}
