import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuCheck, LuClock, LuUserPlus } from "react-icons/lu";
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
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
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
