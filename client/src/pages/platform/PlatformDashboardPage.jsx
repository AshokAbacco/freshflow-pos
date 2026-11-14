import { useCallback, useEffect, useState } from "react";
import {
  LuBuilding2,
  LuCircleAlert,
  LuClock,
  LuLoaderCircle,
  LuRefreshCw,
  LuTrendingUp,
  LuTriangleAlert,
} from "react-icons/lu";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
// Colour carries meaning here, so the state map is shared rather than copied: the same state
// has to be the same colour on every screen in the panel.
import {
  STATE_LABEL,
  STATE_STYLE,
  inr,
  when,
} from "../../lib/platformFormat.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

export default function PlatformDashboardPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get("/dashboard");
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the dashboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const seesMoney = admin?.role !== "SUPPORT";

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 font-extrabold tracking-tight text-slate-900">
            Good to see you, {admin?.name?.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-desc text-slate-500">
            {data
              ? `Every figure read from the database at ${new Date(data.generatedAt).toLocaleTimeString("en-IN")}`
              : "Across every store on the platform"}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-desc font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <LuRefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
            aria-hidden
          />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4">
          <LuTriangleAlert
            className="mt-0.5 shrink-0 text-rose-600"
            size={16}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-body font-bold text-rose-800">
              Could not load the dashboard
            </p>
            <p className="mt-0.5 text-desc text-rose-700">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-desc font-bold text-white hover:bg-rose-700"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-10 grid place-items-center text-slate-400">
          <LuLoaderCircle className="animate-spin" size={24} aria-hidden />
          <span className="sr-only">Loading</span>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={LuBuilding2}
              label="Stores on the platform"
              value={data.stores.total}
              hint={`${data.signups.last30Days} joined in 30 days`}
            />
            <Stat
              icon={LuClock}
              label="Plans ending within 7 days"
              value={data.expiring.in7Days}
              hint={`${data.expiring.in3Days} within 3 days`}
              tone={data.expiring.in7Days > 0 ? "warn" : undefined}
            />
            {seesMoney ? (
              <Stat
                icon={LuTrendingUp}
                label="Revenue, last 30 days"
                value={inr(data.payments.revenueLast30Days)}
                hint={`MRR ${inr(data.payments.mrr)}`}
              />
            ) : null}
            <Stat
              icon={LuCircleAlert}
              label="Failed payments, 30 days"
              value={data.payments.failedLast30Days}
              hint={
                data.payments.webhookFailuresLast24h
                  ? `${data.payments.webhookFailuresLast24h} webhook failures in 24h`
                  : "No webhook failures in 24h"
              }
              tone={
                data.payments.failedLast30Days > 0 ||
                data.payments.webhookFailuresLast24h > 0
                  ? "warn"
                  : undefined
              }
            />
          </div>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-h2 font-bold text-slate-900">
              Where every store stands
            </h2>
            <p className="mt-0.5 text-desc text-slate-500">
              Worked out per store right now, not read from a status column, so
              a plan that lapsed an hour ago already shows as lapsed.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.stores.byState).map(([state, count]) => (
                <li
                  key={state}
                  className={`rounded-lg px-3 py-2 ${STATE_STYLE[state] ?? "bg-slate-100 text-slate-600"}`}
                >
                  <span className="text-h2 font-extrabold tabular-nums">
                    {count}
                  </span>{" "}
                  <span className="text-desc font-semibold">
                    {STATE_LABEL[state] ?? state}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-h2 font-bold text-slate-900">
                Newest stores
              </h2>
              {data.latestSignups.length ? (
                <ul className="mt-2 divide-y divide-slate-100">
                  {data.latestSignups.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-slate-800">
                          {s.name}
                        </p>
                        <p className="truncate text-desc text-slate-500">
                          {s.city ? `${s.city} · ` : ""}joined{" "}
                          {when(s.createdAt)}
                        </p>
                      </div>
                      {s.status ? (
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-desc font-semibold ${STATE_STYLE[s.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {STATE_LABEL[s.status] ?? s.status}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-desc text-slate-500">
                  No stores have signed up yet.
                </p>
              )}
            </section>

            {seesMoney ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-h2 font-bold text-slate-900">
                  Latest payments
                </h2>
                {data.latestPayments.length ? (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {data.latestPayments.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-semibold text-slate-800">
                            {p.store}
                          </p>
                          <p className="truncate text-desc text-slate-500">
                            {p.plan} · {p.seats} user{p.seats === 1 ? "" : "s"}{" "}
                            · {when(p.at)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-body font-bold text-slate-900 tabular-nums">
                            {inr(p.amount, p.currency)}
                          </p>
                          <p
                            className={`text-desc font-semibold ${
                              p.status === "PAID"
                                ? "text-emerald-700"
                                : p.status === "FAILED"
                                  ? "text-rose-600"
                                  : "text-amber-700"
                            }`}
                          >
                            {p.status === "PAID"
                              ? "Paid"
                              : p.status === "FAILED"
                                ? "Failed"
                                : "Started"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-desc text-slate-500">
                    No payments recorded yet.
                  </p>
                )}
              </section>
            ) : null}
          </div>

          <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-desc leading-5 text-slate-500">
            This is the first screen of the panel. Stores, follow-ups, plans,
            payments, messages, the team and the audit log are the next phases —
            the sections marked “soon” in the sidebar.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 ${tone === "warn" ? "border-amber-200" : "border-slate-200"}`}
    >
      <div className="flex items-center gap-2">
        <Icon
          size={14}
          className={tone === "warn" ? "text-amber-600" : "text-slate-400"}
          aria-hidden
        />
        <p className="text-desc font-semibold text-slate-500">{label}</p>
      </div>
      <p className="mt-1.5 text-h1 font-extrabold text-slate-900 tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-desc text-slate-500">{hint}</p> : null}
    </div>
  );
}
