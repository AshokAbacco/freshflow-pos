import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
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
} from "../../components/platform/ui.jsx";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import { sinceNow, whenExact } from "../../lib/platformFormat.js";

/*
 * Razorpay's callbacks, and which of them we failed to process.
 *
 * An unhandled event is the gap between "the customer paid" and "the system knows": the money
 * left their account and the plan did not start. This is where you find out, and the stored
 * payload is what you work from.
 */

export default function PlatformWebhooksPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const query = params.toString();

  useEffect(() => {
    setDraft(params.get("q") ?? "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/webhooks?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the webhook events."));
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

  /** The payload is only fetched when a row is actually opened; it can be large. */
  const toggle = async (id) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setDetail(null);
    try {
      const response = await platformApi.get(`/webhooks/${id}`);
      setDetail(response.data.event);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load that event."));
    }
  };

  const events = data?.events ?? [];
  const page = Number(params.get("page") ?? 1);
  const activeFilters = [...params.entries()].filter(([k]) => k !== "page");

  return (
    <Page
      wide
      title="Webhooks"
      subtitle={
        loading && !data
          ? "Loading…"
          : data.unhandled
            ? `${data.unhandled} event${data.unhandled === 1 ? "" : "s"} we failed to process`
            : "Every callback Razorpay sent has been processed"
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilter("q", draft.trim())}
          placeholder="Order id, payment id or event id"
          label="Search webhook events"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip
          on={params.get("handled") === "false"}
          tone="danger"
          onClick={() =>
            setFilter(
              "handled",
              params.get("handled") === "false" ? "" : "false",
            )
          }
        >
          Failed{data?.unhandled ? ` (${data.unhandled})` : ""}
        </Chip>
        <Chip
          on={params.get("handled") === "true"}
          onClick={() =>
            setFilter("handled", params.get("handled") === "true" ? "" : "true")
          }
        >
          Processed
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
          <Loading what="Loading events" />
        ) : !events.length ? (
          <Empty title="No webhook events">
            {activeFilters.length
              ? "Nothing matches these filters."
              : "Razorpay callbacks are recorded here as they arrive."}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className={e.handled ? "" : "bg-rose-50/40"}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-expanded={open === e.id}
                  className="flex w-full items-start gap-2.5 p-3.5 text-left hover:bg-slate-50"
                >
                  {open === e.id ? (
                    <LuChevronDown
                      size={16}
                      className="mt-0.5 shrink-0 text-slate-400"
                      aria-hidden
                    />
                  ) : (
                    <LuChevronRight
                      size={16}
                      className="mt-0.5 shrink-0 text-slate-400"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-body font-semibold text-slate-900">
                        {e.event}
                      </span>
                      <Pill
                        className={
                          e.handled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-100 text-rose-800"
                        }
                      >
                        {e.handled ? "processed" : "failed"}
                      </Pill>
                    </div>
                    <p className="mt-0.5 font-mono text-desc text-slate-500">
                      {e.orderId ?? "—"}
                      {e.paymentId ? ` · ${e.paymentId}` : ""}
                    </p>
                    {e.error ? (
                      <p className="mt-0.5 text-desc text-rose-700">
                        {e.error}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 text-desc text-slate-400"
                    title={whenExact(e.receivedAt)}
                  >
                    {sinceNow(e.receivedAt)}
                  </span>
                </button>

                {open === e.id ? (
                  <div className="border-t border-slate-100 bg-slate-50 p-3.5">
                    {!detail ? (
                      <Loading what="Loading the payload" />
                    ) : (
                      <>
                        <p className="text-desc font-semibold text-slate-500">
                          Event id{" "}
                          <span className="font-mono font-normal">
                            {detail.eventId}
                          </span>
                        </p>
                        <pre className="scroll-thin mt-1.5 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 text-desc text-slate-700">
                          {JSON.stringify(detail.payload, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
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
