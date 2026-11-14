import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuDownload,
  LuFilter,
  LuLoaderCircle,
  LuRefreshCw,
  LuSearch,
  LuX,
} from "react-icons/lu";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import {
  BUSINESS_LABEL,
  STATE_LABEL,
  STATE_ORDER,
  STATE_STYLE,
  inr,
  sinceNow,
  when,
} from "../../lib/platformFormat.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

/*
 * Every store, with the filters a support desk actually reaches for.
 *
 * Filter state lives in the URL, not in component state, so a filtered list can be pasted into
 * a ticket or a chat and come back the same. It also means the browser's back button steps
 * back through the filters, which is what people expect from a list like this.
 */

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "endingSoon", label: "Ending soonest" },
  { value: "revenue", label: "Highest billed" },
  { value: "inactive", label: "Quietest" },
  { value: "active", label: "Most recently active" },
  { value: "name", label: "Name A–Z" },
  { value: "oldest", label: "Oldest first" },
];

const QUICK = [
  { key: "endingWithin", value: "7", label: "Renewing in 7 days" },
  { key: "state", value: "PAST_DUE", label: "Payment failed" },
  { key: "state", value: "GRACE_PERIOD", label: "In grace" },
  { key: "state", value: "EXPIRED", label: "Expired" },
  { key: "inactiveDays", value: "14", label: "Quiet 14+ days" },
  { key: "state", value: "SUSPENDED", label: "Suspended" },
];

export default function PlatformStoresPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftQuery, setDraftQuery] = useState(params.get("q") ?? "");

  const canExport = admin?.role !== "SUPPORT";
  const query = params.toString();

  // Keeps the box in step when the URL changes from somewhere else (a quick filter, back button).
  useEffect(() => {
    setDraftQuery(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/stores?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the stores."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  /** Writes one filter, dropping it when cleared and resetting to page 1. */
  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "" || value === null || value === undefined)
            next.delete(key);
          else next.set(key, String(value));
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const activeFilters = useMemo(
    () =>
      [...params.entries()].filter(
        ([key]) => !["page", "sort", "pageSize"].includes(key),
      ),
    [params],
  );

  const search = (event) => {
    event.preventDefault();
    setFilter("q", draftQuery.trim());
  };

  /*
   * The export is an authenticated GET that must arrive as a download, so it cannot be a plain
   * <a href>: the access token lives in memory, not in a cookie, so the browser would send an
   * unauthenticated request. Fetch it with the token, then hand the blob to a temporary link.
   */
  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await platformApi.get(`/stores?${query}&format=csv`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stores-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(platformErrorMessage(err, "The export did not download."));
    } finally {
      setExporting(false);
    }
  };

  const page = Number(params.get("page") ?? 1);
  const pageSize = data?.pageSize ?? 50;
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const stores = data?.stores ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-extrabold text-slate-900">Stores</h1>
          <p className="mt-0.5 text-desc text-slate-500">
            {loading && !data
              ? "Loading…"
              : `${total.toLocaleString("en-IN")} ${total === 1 ? "store" : "stores"}${
                  activeFilters.length
                    ? " matching these filters"
                    : " on the platform"
                }`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="Reload the list"
            title="Reload"
          >
            <LuRefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
              aria-hidden
            />
          </button>

          {canExport ? (
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting || !total}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-body font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting ? (
                <LuLoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden
                />
              ) : (
                <LuDownload size={16} aria-hidden />
              )}
              <span className="hidden sm:inline">
                {exporting ? "Preparing…" : "Export CSV"}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {/* Search and sort */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={search}
          className="flex min-w-[240px] flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <LuSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Store, owner, email or phone number"
              aria-label="Search stores"
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

        <label className="flex items-center gap-1.5 text-desc text-slate-500">
          Sort
          <select
            value={params.get("sort") ?? "newest"}
            onChange={(event) => setFilter("sort", event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-body font-semibold transition ${
            showFilters || activeFilters.length
              ? "border-brand bg-brand/10 text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <LuFilter size={15} aria-hidden />
          Filters
          {activeFilters.length ? (
            <span className="rounded-full bg-brand px-1.5 text-desc font-bold text-ink">
              {activeFilters.length}
            </span>
          ) : null}
        </button>
      </div>

      {/* Quick filters: the six questions a support desk asks every morning. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map(({ key, value, label }) => {
          const on = params.get(key) === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(key, on ? "" : value)}
              aria-pressed={on}
              className={`h-8 rounded-full border px-3 text-desc font-semibold transition ${
                on
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          );
        })}
        {activeFilters.length ? (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="flex h-8 items-center gap-1 rounded-full px-2.5 text-desc font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            <LuX size={13} aria-hidden />
            Clear all
          </button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">
              State
            </span>
            <select
              value={params.get("state") ?? ""}
              onChange={(event) => setFilter("state", event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="">Any state</option>
              {STATE_ORDER.map((state) => (
                <option key={state} value={state}>
                  {STATE_LABEL[state]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-desc font-semibold text-slate-500">Plan</span>
            <select
              value={params.get("plan") ?? ""}
              onChange={(event) => setFilter("plan", event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="">Any plan</option>
              <option value="TRIAL">Trial</option>
              <option value="STANDARD">Standard</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>

          <label className="block">
            <span className="text-desc font-semibold text-slate-500">
              Business type
            </span>
            <select
              value={params.get("businessType") ?? ""}
              onChange={(event) =>
                setFilter("businessType", event.target.value)
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="">Any type</option>
              {Object.entries(BUSINESS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-desc font-semibold text-slate-500">City</span>
            <input
              type="text"
              defaultValue={params.get("city") ?? ""}
              onBlur={(event) => setFilter("city", event.target.value.trim())}
              placeholder="Any city"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-desc font-semibold text-slate-500">
              Renewing within (days)
            </span>
            <input
              type="number"
              min="1"
              max="365"
              defaultValue={params.get("endingWithin") ?? ""}
              onBlur={(event) => setFilter("endingWithin", event.target.value)}
              placeholder="Any time"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-desc font-semibold text-slate-500">
              Quiet for at least (days)
            </span>
            <input
              type="number"
              min="1"
              max="3650"
              defaultValue={params.get("inactiveDays") ?? ""}
              onBlur={(event) => setFilter("inactiveDays", event.target.value)}
              placeholder="Any"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 self-end pb-2.5">
            <input
              type="checkbox"
              checked={params.get("hasOpenFollowUps") === "true"}
              onChange={(event) =>
                setFilter(
                  "hasOpenFollowUps",
                  event.target.checked ? "true" : "",
                )
              }
              className="h-4 w-4 rounded border-slate-300 accent-brand"
            />
            <span className="text-body text-slate-600">
              Has open follow-ups
            </span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-body text-rose-800"
          role="alert"
        >
          <LuCircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={load}
            className="font-semibold underline"
          >
            Retry
          </button>
        </p>
      ) : null}

      {/* The list. A table on wide screens, cards on a phone -- a support desk uses both. */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading && !data ? (
          <div className="grid place-items-center gap-2 p-12 text-slate-400">
            <LuLoaderCircle className="animate-spin" size={22} aria-hidden />
            <p className="text-desc">Loading stores…</p>
          </div>
        ) : !stores.length ? (
          <div className="p-12 text-center">
            <p className="text-body font-semibold text-slate-700">
              No stores match this
            </p>
            <p className="mt-1 text-desc text-slate-500">
              {activeFilters.length
                ? "Try removing a filter, or clear them all."
                : "Once a shop signs up it will appear here."}
            </p>
            {activeFilters.length ? (
              <button
                type="button"
                onClick={() =>
                  setParams(new URLSearchParams(), { replace: true })
                }
                className="mt-3 h-10 rounded-lg bg-slate-900 px-4 text-body font-semibold text-white"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <table className="hidden w-full text-left lg:table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-desc font-semibold text-slate-500">
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">Plan</th>
                  {/* "Plan ends", not "Renews": the same cell has to read sensibly for a plan
                      that lapsed a fortnight ago as well as one renewing next month. */}
                  <th className="px-4 py-2.5">Plan ends</th>
                  <th className="px-4 py-2.5 text-right">Billed 30d</th>
                  <th className="px-4 py-2.5 text-right">Bills</th>
                  <th className="px-4 py-2.5">Last active</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr
                    key={store.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/platform/stores/${store.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {store.name}
                      </Link>
                      <p className="text-desc text-slate-500">
                        {[
                          BUSINESS_LABEL[store.businessType] ??
                            store.businessType,
                          store.city,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-body text-slate-700">
                        {store.owner?.name ?? "—"}
                      </p>
                      <p className="text-desc text-slate-400">
                        {store.owner?.phone ?? store.owner?.email ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <StateChip state={store.state} />
                      {store.openFollowUps ? (
                        <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-desc font-semibold text-amber-700">
                          {store.openFollowUps} to chase
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-body text-slate-700">
                      {store.plan ?? "—"}
                      <span className="text-desc text-slate-400">
                        {store.seats ? ` · ${store.seats} seats` : ""}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2.5 text-body text-slate-700"
                      title={when(store.periodEnd)}
                    >
                      {store.periodEnd ? sinceNow(store.periodEnd) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-body text-slate-700">
                      {inr(store.billedLast30Days)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-body text-slate-700">
                      {(store.usage?.billsThisMonth ?? 0).toLocaleString(
                        "en-IN",
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-body text-slate-500"
                      title={when(store.lastActiveAt)}
                    >
                      {sinceNow(store.lastActiveAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 lg:hidden">
              {stores.map((store) => (
                <li key={store.id}>
                  <Link
                    to={`/platform/stores/${store.id}`}
                    className="block p-3.5 active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-body font-bold text-slate-900">
                          {store.name}
                        </p>
                        <p className="truncate text-desc text-slate-500">
                          {[store.owner?.name, store.city]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <StateChip state={store.state} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-desc text-slate-500">
                      <span>{store.plan ?? "No plan"}</span>
                      <span>
                        Plan ends{" "}
                        {store.periodEnd ? sinceNow(store.periodEnd) : "—"}
                      </span>
                      <span>{inr(store.billedLast30Days)} billed 30d</span>
                      <span>Active {sinceNow(store.lastActiveAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {total > pageSize ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-desc text-slate-500">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
            {total.toLocaleString("en-IN")}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("page", page - 1)}
              disabled={page <= 1 || loading}
              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <LuChevronLeft size={17} aria-hidden />
            </button>
            <span className="px-1 text-desc text-slate-500">
              Page {page} of {lastPage}
            </span>
            <button
              type="button"
              onClick={() => setFilter("page", page + 1)}
              disabled={page >= lastPage || loading}
              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <LuChevronRight size={17} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StateChip({ state }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-desc font-semibold ${
        STATE_STYLE[state] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {STATE_LABEL[state] ?? state}
    </span>
  );
}
