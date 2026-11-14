import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCircleCheck, LuTriangleAlert } from 'react-icons/lu';
import { ErrorNote, Loading, Page, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { sinceNow } from '../../lib/platformFormat.js';

/*
 * Is anything broken right now?
 *
 * A short list of checks that each mean something concrete and link to where you would fix
 * them. A wall of green ticks that nobody reads is worse than four lines that are usually
 * green and occasionally are not.
 */

export default function PlatformHealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get('/health');
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not run the health checks.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-checks while the page is open, because this is the screen you leave on a second monitor.
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !data) return <Loading what="Running the checks" />;

  const bad = (data?.checks ?? []).filter((c) => !c.ok);

  return (
    <Page
      title="System health"
      subtitle={data ? `Checked ${sinceNow(data.checkedAt)} · re-checks every minute` : ''}
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <ErrorNote message={error} onRetry={load} />

      <p
        className={`mt-4 flex items-center gap-2 rounded-xl p-4 text-body ${
          data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
        }`}
      >
        {data.ok ? <LuCircleCheck size={18} aria-hidden /> : <LuTriangleAlert size={18} aria-hidden />}
        <span className="font-semibold">
          {data.ok
            ? 'Everything is working.'
            : `${bad.length} thing${bad.length === 1 ? '' : 's'} need${bad.length === 1 ? 's' : ''} attention.`}
        </span>
      </p>

      <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {data.checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-3 p-3.5">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
              }`}
              aria-hidden
            >
              {c.ok ? <LuCircleCheck size={16} /> : <LuTriangleAlert size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-slate-900">{c.label}</p>
              <p className="text-desc text-slate-500">{c.detail}</p>
            </div>
            {!c.ok && c.link ? (
              <Link
                to={c.link}
                className="h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-desc font-semibold leading-9 text-slate-600 transition hover:bg-slate-50"
              >
                Go and look
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Stores" value={data.scale.stores} />
        <Stat label="Active this week" value={data.scale.activeStores} />
        <Stat label="Bills this week" value={data.scale.billsLast7Days} />
      </div>
    </Page>
  );
}

function Stat({ label, value }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-desc font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-h1 font-extrabold text-slate-900">{Number(value).toLocaleString('en-IN')}</p>
    </section>
  );
}
