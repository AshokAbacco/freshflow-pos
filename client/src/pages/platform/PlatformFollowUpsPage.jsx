import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuCheck,
  LuClock,
  LuPlus,
  LuSearch,
  LuUserPlus,
  LuX,
} from "react-icons/lu";
import {
  Card,
  Chip,
  ClearFilters,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Pagination,
  Pill,
  ReloadButton,
  SearchBox,
  Select,
} from "../../components/platform/ui.jsx";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import { sinceNow, whenExact } from "../../lib/platformFormat.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

/*
 * The support desk's worklist.
 *
 * Sorted by what is most likely to cost something: overdue and high priority first. Every row
 * can be actioned from the list -- close, snooze, reassign -- because a worklist that makes you
 * open each item to act on it stops being a worklist.
 */

const TYPE_LABEL = {
  RENEWAL: "Renewal",
  PAYMENT_FAILED: "Payment failed",
  ONBOARDING: "Onboarding",
  SUPPORT_ISSUE: "Support issue",
  UPSELL: "Upsell",
  OTHER: "Other",
};

const PRIORITY_PILL = {
  HIGH: "bg-rose-50 text-rose-700",
  NORMAL: "bg-slate-100 text-slate-600",
  LOW: "bg-slate-50 text-slate-500",
};

export default function PlatformFollowUpsPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const [params, setParams] = useSearchParams();
  // Which row is showing its close form, and what has been typed into it.
  const [closing, setClosing] = useState(null);
  const [closeText, setCloseText] = useState("");
  // Raising one by hand: the nightly job covers renewals and failed payments, but a phone
  // call that needs chasing next Tuesday has to be possible to write down.
  const [adding, setAdding] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState({
    title: "",
    type: "SUPPORT_ISSUE",
    priority: "NORMAL",
    dueInDays: 3,
  });
  const [storeQuery, setStoreQuery] = useState("");
  const [storeHits, setStoreHits] = useState([]);
  const [chosenStore, setChosenStore] = useState(null);
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [working, setWorking] = useState(null);

  const query = params.toString();

  useEffect(() => {
    setDraft(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, tally] = await Promise.all([
        platformApi.get(`/follow-ups?${query}`),
        platformApi.get("/follow-ups/counts"),
      ]);
      setData(list.data);
      setCounts(tally.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the follow-ups."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value) next.delete(key);
          else next.set(key, String(value));
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Finding the store to attach it to, through the search everyone already uses.
  useEffect(() => {
    const q = storeQuery.trim();
    if (!adding || chosenStore || q.length < 2) {
      setStoreHits([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await platformApi.get("/search", {
          params: { q },
          signal: controller.signal,
        });
        setStoreHits(response.data.stores ?? []);
      } catch {
        // An aborted search is the normal case while typing.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [adding, storeQuery, chosenStore]);

  const createFollowUp = async (event) => {
    event.preventDefault();
    if (!chosenStore || newFollowUp.title.trim().length < 3) return;
    setWorking("new");
    setError(null);
    try {
      await platformApi.post("/follow-ups", {
        organizationId: chosenStore.id,
        title: newFollowUp.title.trim(),
        type: newFollowUp.type,
        priority: newFollowUp.priority,
        dueAt: new Date(
          Date.now() + Number(newFollowUp.dueInDays) * 86400000,
        ).toISOString(),
      });
      setAdding(false);
      setNewFollowUp({
        title: "",
        type: "SUPPORT_ISSUE",
        priority: "NORMAL",
        dueInDays: 3,
      });
      setChosenStore(null);
      setStoreQuery("");
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That follow-up was not saved."));
    } finally {
      setWorking(null);
    }
  };

  const act = async (id, path, body) => {
    setWorking(id);
    setError(null);
    try {
      await platformApi.post(`/follow-ups/${id}/${path}`, body);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That did not go through."));
    } finally {
      setWorking(null);
    }
  };

  const submitClose = async (row) => {
    const result = closeText.trim();
    if (result.length < 3) return;
    await act(row.id, "close", { result });
    setClosing(null);
    setCloseText("");
  };

  const rows = data?.followUps ?? [];
  const page = Number(params.get("page") ?? 1);
  const activeFilters = [...params.entries()].filter(([k]) => k !== "page");

  return (
    <Page
      wide
      title="Follow-ups"
      subtitle={
        counts
          ? `${counts.open} open · ${counts.overdue} overdue · ${counts.mine} assigned to you`
          : "Loading…"
      }
      actions={
        <>
          <ReloadButton onClick={load} busy={loading} />
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex h-10 items-center gap-2 rounded-lg bg-brand px-3 text-body font-bold text-ink transition hover:bg-brand-700"
          >
            <LuPlus size={16} aria-hidden />
            New follow-up
          </button>
        </>
      }
    >
      {adding ? (
        <form
          onSubmit={createFollowUp}
          className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-h2 font-bold text-slate-900">
            Raise a follow-up
          </h2>
          <p className="mt-0.5 text-desc text-slate-500">
            For something you need to chase that the nightly job would not know
            about — a promise made on a call, a shop to check back on.
          </p>

          <div className="mt-3">
            <span className="text-desc font-semibold text-slate-500">
              Which store
            </span>
            {chosenStore ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="flex h-11 flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-body font-semibold text-slate-900">
                  {chosenStore.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setChosenStore(null);
                    setStoreQuery("");
                  }}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Pick a different store"
                >
                  <LuX size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <LuSearch
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={storeQuery}
                  onChange={(event) => setStoreQuery(event.target.value)}
                  placeholder="Start typing a store name"
                  aria-label="Find the store"
                  className="h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                />
                {storeHits.length ? (
                  <ul className="absolute left-0 right-0 top-12 z-20 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lift">
                    {storeHits.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setChosenStore(s);
                            setStoreHits([]);
                          }}
                          className="w-full rounded px-2 py-2 text-left text-body text-slate-800 hover:bg-slate-50"
                        >
                          {s.name}
                          <span className="ml-1 text-desc text-slate-400">
                            {s.city}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>

          <label className="mt-3 block">
            <span className="text-desc font-semibold text-slate-500">
              What needs doing
            </span>
            <input
              value={newFollowUp.title}
              onChange={(event) =>
                setNewFollowUp({ ...newFollowUp, title: event.target.value })
              }
              placeholder="e.g. Call back about the second till they asked for"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">
                Type
              </span>
              <select
                value={newFollowUp.type}
                onChange={(event) =>
                  setNewFollowUp({ ...newFollowUp, type: event.target.value })
                }
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">
                Priority
              </span>
              <select
                value={newFollowUp.priority}
                onChange={(event) =>
                  setNewFollowUp({
                    ...newFollowUp,
                    priority: event.target.value,
                  })
                }
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">
                Due in (days)
              </span>
              <input
                type="number"
                min="0"
                max="365"
                value={newFollowUp.dueInDays}
                onChange={(event) =>
                  setNewFollowUp({
                    ...newFollowUp,
                    dueInDays: event.target.value,
                  })
                }
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-desc text-slate-400">
              It will be assigned to you.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-11 rounded-lg border border-slate-200 px-4 text-body font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !chosenStore ||
                  newFollowUp.title.trim().length < 3 ||
                  working === "new"
                }
                className="h-11 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
              >
                {working === "new" ? "Saving…" : "Raise it"}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilter("q", draft.trim())}
          placeholder="Title or store name"
          label="Search follow-ups"
        />
        <Select
          label="Type"
          value={params.get("type")}
          onChange={(v) => setFilter("type", v)}
          options={Object.entries(TYPE_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
          any="Any type"
        />
        <Select
          label="Status"
          value={params.get("status")}
          onChange={(v) => setFilter("status", v)}
          options={[
            { value: "OPEN", label: "Open" },
            { value: "DONE", label: "Done" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
          any="Open"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip
          on={params.get("overdue") === "true"}
          tone="danger"
          onClick={() =>
            setFilter("overdue", params.get("overdue") === "true" ? "" : "true")
          }
        >
          Overdue{counts?.overdue ? ` (${counts.overdue})` : ""}
        </Chip>
        <Chip
          on={params.get("assignee") === "me"}
          onClick={() =>
            setFilter("assignee", params.get("assignee") === "me" ? "" : "me")
          }
        >
          Mine{counts?.mine ? ` (${counts.mine})` : ""}
        </Chip>
        <Chip
          on={params.get("assignee") === "unassigned"}
          onClick={() =>
            setFilter(
              "assignee",
              params.get("assignee") === "unassigned" ? "" : "unassigned",
            )
          }
        >
          Unassigned
        </Chip>
        <Chip
          on={params.get("priority") === "HIGH"}
          tone="warn"
          onClick={() =>
            setFilter(
              "priority",
              params.get("priority") === "HIGH" ? "" : "HIGH",
            )
          }
        >
          High priority
        </Chip>
        {activeFilters.length ? (
          <ClearFilters
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          />
        ) : null}
      </div>

      <ErrorNote message={error} onRetry={load} />

      <Card>
        {loading && !data ? (
          <Loading what="Loading follow-ups" />
        ) : !rows.length ? (
          <Empty title="Nothing to chase">
            {activeFilters.length
              ? "No follow-ups match these filters."
              : "The nightly job raises renewals and failed payments here."}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`p-3.5 ${row.overdue ? "bg-rose-50/40" : ""}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-body font-semibold text-slate-900">
                        {row.title}
                      </p>
                      <Pill className={PRIORITY_PILL[row.priority]}>
                        {row.priority.toLowerCase()}
                      </Pill>
                      {row.autoKey ? (
                        <Pill className="bg-sky-50 text-sky-700">auto</Pill>
                      ) : null}
                      {row.status !== "OPEN" ? (
                        <Pill className="bg-slate-100 text-slate-500">
                          {row.status.toLowerCase()}
                        </Pill>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-desc text-slate-500">
                      {row.store ? (
                        <Link
                          to={`/platform/stores/${row.store.id}`}
                          className="font-semibold text-slate-700 hover:text-brand-700 hover:underline"
                        >
                          {row.store.name}
                        </Link>
                      ) : (
                        "Store removed"
                      )}
                      {" · "}
                      {TYPE_LABEL[row.type] ?? row.type}
                      {" · "}
                      <span
                        className={
                          row.overdue ? "font-semibold text-rose-700" : ""
                        }
                        title={whenExact(row.dueAt)}
                      >
                        {row.overdue ? "overdue " : "due "}
                        {sinceNow(row.dueAt)}
                      </span>
                      {" · "}
                      {row.assignee ? row.assignee.name : "unassigned"}
                    </p>
                    {row.result ? (
                      <p className="mt-1 text-desc text-slate-600">
                        {row.result}
                      </p>
                    ) : null}
                  </div>

                  {row.status === "OPEN" ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => act(row.id, "snooze", { days: 3 })}
                        disabled={working === row.id}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                        title="Push the due date three days out, from today"
                      >
                        <LuClock size={14} aria-hidden />
                        Snooze
                      </button>
                      {!row.assignee && admin?.id ? (
                        <button
                          type="button"
                          onClick={() =>
                            act(row.id, "reassign", { assigneeId: admin.id })
                          }
                          disabled={working === row.id}
                          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                          <LuUserPlus size={14} aria-hidden />
                          Take it
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setClosing(closing === row.id ? null : row.id);
                          setCloseText("");
                        }}
                        disabled={working === row.id}
                        aria-expanded={closing === row.id}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-desc font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
                      >
                        <LuCheck size={14} aria-hidden />
                        Close
                      </button>
                    </div>
                  ) : null}
                </div>

                {/*
                 * Closing asks what happened, inline. The server requires it, and it is the only
                 * record of how the chase went -- so it is a field, not a confirm dialog.
                 */}
                {closing === row.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitClose(row);
                    }}
                    className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                  >
                    <label
                      htmlFor={`close-${row.id}`}
                      className="text-desc font-semibold text-slate-500"
                    >
                      What happened?
                    </label>
                    <textarea
                      id={`close-${row.id}`}
                      rows={2}
                      autoFocus
                      value={closeText}
                      onChange={(event) => setCloseText(event.target.value)}
                      placeholder="e.g. Owner paid over the phone, ref NEFT4471"
                      className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setClosing(null)}
                        className="h-9 rounded-lg px-3 text-desc font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={
                          closeText.trim().length < 3 || working === row.id
                        }
                        className="h-9 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
                      >
                        Save and close
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Pagination
        page={page}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        busy={loading}
        onPage={(p) => setFilter("page", p)}
      />
    </Page>
  );
}
