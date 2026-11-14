import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorNote, Loading, Page, Pill, ReloadButton, Select } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { STATE_LABEL, STATE_STYLE, inr } from '../../lib/platformFormat.js';

/*
 * How the business is doing.
 *
 * Each figure says what it means underneath it, because "MRR" and "churn" mean different
 * things in different companies and a number whose definition is implicit is one nobody can
 * check. The charts are plain SVG: a bar chart of twelve numbers does not need a library.
 */

const monthLabel = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};

/**
 * A bar chart that stays readable at any scale, including all-zero.
 *
 * The bar's height is a percentage, so its parent must have a definite height or the bar
 * collapses to nothing: the column is h-full and the track inside it is flex-1, which gives
 * the percentage something real to resolve against.
 */
function Bars({ values, labels, format, tone = 'bg-brand' }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-3 flex items-end gap-1.5" style={{ height: 170 }}>
      {values.map((v, i) => (
        <div key={labels[i]} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
          <span className="shrink-0 text-desc text-slate-500">{v > 0 ? format(v) : ''}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className={`w-full rounded-t ${v > 0 ? tone : 'bg-slate-100'}`}
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              title={`${labels[i]}: ${format(v)}`}
            />
          </div>
          <span className="shrink-0 truncate text-desc text-slate-400">{monthLabel(labels[i])}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlatformReportsPage() {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState('12');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get(`/reports?months=${months}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the reports.'));
    } finally { setLoading(false); }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Loading what="Working out the numbers" />;

  const totalRevenue = (data?.revenue ?? []).reduce((t, v) => t + v, 0);
  const totalSignups = (data?.signups ?? []).reduce((t, v) => t + v, 0);
  const totalChurn = (data?.cancellations ?? []).reduce((t, v) => t + v, 0);
  const compact = (v) => (v >= 100000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

  return (
    <Page
      wide
      title="Reports"
      subtitle={`Everything computed from the rows, not from a cached counter`}
      actions={
        <>
          <Select
            label="Window"
            value={months}
            onChange={(v) => setMonths(v || '12')}
            options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }, { value: '24', label: '24 months' }]}
            any="12 months"
          />
          <ReloadButton onClick={load} busy={loading} />
        </>
      }
    >
      <ErrorNote message={error} onRetry={load} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Monthly recurring revenue" value={inr(data.mrr)}
          help={`${data.payingStores} stores on an active or past-due plan. Yearly plans counted at their monthly rate.`} />
        <Figure label={`Collected over ${months} months`} value={inr(totalRevenue)}
          help="Money Razorpay actually captured, less refunds." />
        <Figure label="New stores" value={totalSignups.toLocaleString('en-IN')}
          help={`Signed up in the last ${months} months.`} />
        <Figure label="Cancelled" value={totalChurn.toLocaleString('en-IN')}
          help="Subscriptions cancelled in the same window." />
      </div>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Revenue by month</h2>
        <p className="text-desc text-slate-500">Captured less refunded, grouped by the month it was paid.</p>
        <Bars values={data.revenue} labels={data.months} format={(v) => `₹${compact(v)}`} />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-h2 font-bold text-slate-900">New stores</h2>
          <p className="text-desc text-slate-500">By the month they signed up.</p>
          <Bars values={data.signups} labels={data.months} format={(v) => String(v)} tone="bg-sky-500" />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-h2 font-bold text-slate-900">Cancellations</h2>
          <p className="text-desc text-slate-500">Subscriptions cancelled, by month.</p>
          <Bars values={data.cancellations} labels={data.months} format={(v) => String(v)} tone="bg-rose-400" />
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-h2 font-bold text-slate-900">Where every store stands</h2>
          <ul className="mt-2 space-y-1.5">
            {data.byState.map((row) => (
              <li key={row.state} className="flex items-center justify-between gap-2">
                <Pill className={STATE_STYLE[row.state]}>{STATE_LABEL[row.state] ?? row.state}</Pill>
                <span className="text-body font-semibold text-slate-900">{row.stores.toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-h2 font-bold text-slate-900">Revenue by plan</h2>
          <p className="text-desc text-slate-500">Monthly value of the stores currently paying.</p>
          {data.byPlan.length ? (
            <ul className="mt-2 space-y-1.5">
              {data.byPlan.map((row) => (
                <li key={row.plan} className="flex items-center justify-between gap-2">
                  <span className="text-body text-slate-700">{row.plan}
                    <span className="text-desc text-slate-400"> · {row.stores} stores</span>
                  </span>
                  <span className="text-body font-semibold text-slate-900">{inr(row.monthly)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-body text-slate-500">Nobody is paying yet.</p>}
        </section>
      </div>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Biggest customers</h2>
        <p className="text-desc text-slate-500">By money that actually landed in the window.</p>
        {data.topStores.length ? (
          <ol className="mt-2 divide-y divide-slate-100">
            {data.topStores.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-5 shrink-0 text-desc text-slate-400">{i + 1}</span>
                <Link to={`/platform/stores/${s.id}`} className="min-w-0 flex-1 truncate text-body font-semibold text-slate-800 hover:text-brand-700 hover:underline">
                  {s.name}
                </Link>
                <span className="shrink-0 text-desc text-slate-400">{s.city}</span>
                <span className="shrink-0 text-body font-semibold text-slate-900">{inr(s.billed)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-body text-slate-500">No payments in this window yet.</p>}
      </section>
    </Page>
  );
}

function Figure({ label, value, help }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-desc font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-h1 font-extrabold text-slate-900">{value}</p>
      <p className="mt-1 text-desc leading-4 text-slate-400">{help}</p>
    </section>
  );
}
