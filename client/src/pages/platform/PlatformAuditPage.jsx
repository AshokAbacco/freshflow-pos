import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Card,
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
import { ROLE_LABEL, sinceNow, whenExact } from "../../lib/platformFormat.js";

/*
 * What platform staff did, and why.
 *
 * Read-only, deliberately: there is no route behind this screen that edits or removes an entry,
 * because a log you can tidy up from the panel it audits proves nothing. Entries outlive the
 * store they refer to, so a removed store still shows its history with the name blank.
 */

/** Actions whose consequence is big enough to colour. */
const TONE = {
  "store.suspended": "bg-rose-100 text-rose-800",
  "store.cancelled": "bg-rose-100 text-rose-800",
  "store_user.disabled": "bg-rose-50 text-rose-700",
  "store.reactivated": "bg-emerald-50 text-emerald-700",
  "store_user.enabled": "bg-emerald-50 text-emerald-700",
  "store.extended": "bg-sky-50 text-sky-700",
  "store.plan_changed": "bg-sky-50 text-sky-700",
  "platform.login_failed": "bg-amber-50 text-amber-700",
};

export default function PlatformAuditPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");

  const query = params.toString();

  useEffect(() => {
    setDraft(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/audit?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the audit log."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // The filter offers what has actually happened rather than a hardcoded list that drifts.
  useEffect(() => {
    platformApi
      .get("/audit/actions")
      .then((r) => setActions(r.data.actions))
      .catch(() => setActions([]));
  }, []);

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

  const entries = data?.entries ?? [];
  const page = Number(params.get("page") ?? 1);
  const activeFilters = [...params.entries()].filter(([k]) => k !== "page");

  return (
    <Page
      wide
      title="Audit log"
      subtitle={
        loading && !data
          ? "Loading…"
          : `${(data?.total ?? 0).toLocaleString("en-IN")} recorded actions`
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilter("q", draft.trim())}
          placeholder="Reason, person or action"
          label="Search the audit log"
        />
        <Select
          label="Action"
          value={params.get("action")}
          onChange={(v) => setFilter("action", v)}
          options={actions.map((a) => ({
            value: a.action,
            label: `${a.action} (${a.count})`,
          }))}
          any="Any action"
        />
        {activeFilters.length ? (
          <ClearFilters
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          />
        ) : null}
      </div>

      <ErrorNote message={error} onRetry={load} />

      <Card>
        {loading && !data ? (
          <Loading what="Loading the audit log" />
        ) : !entries.length ? (
          <Empty title="Nothing recorded yet">
            {activeFilters.length
              ? "No entries match these filters."
              : "Actions taken from this panel are recorded here."}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill className={TONE[e.action]}>{e.action}</Pill>
                  {e.storeId ? (
                    e.storeName ? (
                      <Link
                        to={`/platform/stores/${e.storeId}`}
                        className="text-body font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {e.storeName}
                      </Link>
                    ) : (
                      <span
                        className="text-body text-slate-400"
                        title={`Store ${e.storeId} no longer exists`}
                      >
                        store removed
                      </span>
                    )
                  ) : null}
                </div>

                {e.reason ? (
                  <p className="mt-1 text-body text-slate-700">{e.reason}</p>
                ) : null}

                {e.changes && Object.keys(e.changes).length ? (
                  <pre className="scroll-thin mt-1 max-h-28 overflow-auto rounded-lg bg-slate-50 p-2 text-desc text-slate-600">
                    {JSON.stringify(e.changes, null, 2)}
                  </pre>
                ) : null}

                <p
                  className="mt-1 text-desc text-slate-400"
                  title={whenExact(e.createdAt)}
                >
                  {e.actorLabel}
                  {e.actorRole
                    ? ` (${ROLE_LABEL[e.actorRole] ?? e.actorRole})`
                    : ""}
                  {" · "}
                  {sinceNow(e.createdAt)}
                  {e.ip ? ` · ${e.ip}` : ""}
                </p>
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
