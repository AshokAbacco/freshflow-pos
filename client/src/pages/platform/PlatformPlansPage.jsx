import { useCallback, useEffect, useState } from 'react';
import { LuArchive, LuPlus, LuRotateCcw } from 'react-icons/lu';
import { Card, Empty, ErrorNote, Loading, Page, Pill, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { inr } from '../../lib/platformFormat.js';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';

/*
 * What the business sells.
 *
 * A plan is retired, never deleted: stores are billing against these records. The count of
 * stores still on a plan is shown next to the retire button for exactly that reason.
 */

const blank = {
  code: '', name: '', blurb: '',
  limits: { users: '', products: '', billsPerMonth: '' },
  pricing: { monthly: { listPrice: '', price: '' }, yearly: { listPrice: '', price: '' } },
};

export default function PlatformPlansPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const isSuper = admin?.role === 'SUPER_ADMIN';

  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get('/plans');
      setPlans(response.data.plans);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the plans.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = (plan) => {
    setEditing(plan?.id ?? 'new');
    setDraft(plan ? {
      code: plan.code, name: plan.name, blurb: plan.blurb ?? '',
      limits: {
        users: plan.limits.users ?? '',
        products: plan.limits.products ?? '',
        billsPerMonth: plan.limits.billsPerMonth ?? '',
      },
      pricing: {
        monthly: { listPrice: plan.pricing.monthly.listPrice, price: plan.pricing.monthly.price },
        yearly: { listPrice: plan.pricing.yearly.listPrice, price: plan.pricing.yearly.price },
      },
    } : blank);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(null);
    // An empty limit box means unlimited, which is null rather than 0.
    const limits = Object.fromEntries(
      Object.entries(draft.limits).map(([k, v]) => [k, v === '' ? null : Number(v)]),
    );
    const body = {
      name: draft.name.trim(),
      blurb: draft.blurb.trim() || null,
      limits,
      pricing: {
        monthly: { listPrice: Number(draft.pricing.monthly.listPrice || 0), price: Number(draft.pricing.monthly.price || 0) },
        yearly: { listPrice: Number(draft.pricing.yearly.listPrice || 0), price: Number(draft.pricing.yearly.price || 0) },
      },
    };
    try {
      if (editing === 'new') await platformApi.post('/plans', { ...body, code: draft.code.trim().toUpperCase() });
      else await platformApi.patch(`/plans/${editing}`, body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not save that plan.'));
    } finally { setBusy(false); }
  };

  const retire = async (plan) => {
    const reason = window.prompt(
      plan.retiredAt
        ? `Bring "${plan.name}" back on sale. Why?`
        : `Retire "${plan.name}". ${plan.storesOnPlan} store${plan.storesOnPlan === 1 ? '' : 's'} will keep being billed on it. Why are you retiring it?`,
    );
    if (!reason || reason.trim().length < 5) return;
    setError(null);
    try {
      await platformApi.post(`/plans/${plan.id}/retire`, { retired: !plan.retiredAt, reason: reason.trim() });
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not change that plan.'));
    }
  };

  const limitText = (v) => (v === null || v === undefined ? 'unlimited' : v.toLocaleString('en-IN'));

  return (
    <Page
      title="Plans"
      subtitle={loading && !plans ? 'Loading…' : `${plans.length} plans`}
      actions={
        <>
          <ReloadButton onClick={load} busy={loading} />
          {isSuper ? (
            <button
              type="button"
              onClick={() => open(null)}
              className="flex h-10 items-center gap-2 rounded-lg bg-brand px-3 text-body font-bold text-ink transition hover:bg-brand-700"
            >
              <LuPlus size={16} aria-hidden />
              New plan
            </button>
          ) : null}
        </>
      }
    >
      <ErrorNote message={error} onRetry={load} />

      {loading && !plans ? (
        <Loading what="Loading plans" />
      ) : !plans.length ? (
        <Card><Empty title="No plans yet" /></Card>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <section
              key={p.id}
              className={`rounded-xl border bg-white p-4 ${p.retiredAt ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-h2 font-bold text-slate-900">{p.name}</h2>
                  <p className="font-mono text-desc text-slate-400">{p.code}</p>
                </div>
                {p.retiredAt ? (
                  <Pill className="bg-slate-100 text-slate-500">retired</Pill>
                ) : p.isPublic ? (
                  <Pill className="bg-emerald-50 text-emerald-700">on sale</Pill>
                ) : (
                  <Pill className="bg-slate-100 text-slate-600">hidden</Pill>
                )}
              </div>

              {p.blurb ? <p className="mt-1.5 text-desc text-slate-600">{p.blurb}</p> : null}

              <dl className="mt-3 space-y-1 text-body">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Monthly</dt>
                  <dd className="font-semibold text-slate-900">{inr(p.pricing.monthly.price, p.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Yearly</dt>
                  <dd className="font-semibold text-slate-900">
                    {inr(p.pricing.yearly.price, p.currency)}
                    <span className="text-desc font-normal text-slate-400"> /month</span>
                  </dd>
                </div>
              </dl>

              <dl className="mt-2 space-y-0.5 text-desc text-slate-500">
                <div className="flex justify-between"><dt>Staff accounts</dt><dd>{limitText(p.limits.users)}</dd></div>
                <div className="flex justify-between"><dt>Products</dt><dd>{limitText(p.limits.products)}</dd></div>
                <div className="flex justify-between"><dt>Bills a month</dt><dd>{limitText(p.limits.billsPerMonth)}</dd></div>
              </dl>

              <p className="mt-2 text-desc text-slate-500">
                {p.storesOnPlan} store{p.storesOnPlan === 1 ? '' : 's'} on this plan
              </p>

              {isSuper ? (
                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="h-9 flex-1 rounded-lg border border-slate-200 text-desc font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => retire(p)}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {p.retiredAt ? <LuRotateCcw size={13} aria-hidden /> : <LuArchive size={13} aria-hidden />}
                    {p.retiredAt ? 'Restore' : 'Retire'}
                  </button>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => !busy && setEditing(null)} aria-hidden />
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            className="scroll-thin relative max-h-[90vh] w-full max-w-lg animate-sheet-in overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lift sm:rounded-2xl"
          >
            <h2 className="text-h2 font-bold text-slate-900">
              {editing === 'new' ? 'New plan' : `Edit ${draft.name}`}
            </h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {editing === 'new' ? (
                <label className="block">
                  <span className="text-desc font-semibold text-slate-500">Code</span>
                  <input
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                    placeholder="STARTER"
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-body text-slate-900 focus:border-brand focus:outline-none"
                  />
                  <span className="text-desc text-slate-400">Cannot change once stores are on it.</span>
                </label>
              ) : null}
              <label className="block">
                <span className="text-desc font-semibold text-slate-500">Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-desc font-semibold text-slate-500">One-line description</span>
                <input
                  value={draft.blurb}
                  onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
                />
              </label>
            </div>

            <h3 className="mt-4 text-body font-bold text-slate-900">Price per staff account</h3>
            <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
              {['monthly', 'yearly'].map((interval) => (
                <div key={interval} className="rounded-lg border border-slate-200 p-2.5">
                  <p className="text-desc font-semibold capitalize text-slate-500">{interval}</p>
                  <label className="mt-1.5 block">
                    <span className="text-desc text-slate-500">Was</span>
                    <input
                      type="number" min="0"
                      value={draft.pricing[interval].listPrice}
                      onChange={(e) => setDraft({ ...draft, pricing: { ...draft.pricing, [interval]: { ...draft.pricing[interval], listPrice: e.target.value } } })}
                      className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
                    />
                  </label>
                  <label className="mt-1.5 block">
                    <span className="text-desc text-slate-500">Now</span>
                    <input
                      type="number" min="0"
                      value={draft.pricing[interval].price}
                      onChange={(e) => setDraft({ ...draft, pricing: { ...draft.pricing, [interval]: { ...draft.pricing[interval], price: e.target.value } } })}
                      className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
                    />
                  </label>
                </div>
              ))}
            </div>

            <h3 className="mt-4 text-body font-bold text-slate-900">Limits</h3>
            <p className="text-desc text-slate-500">Leave a box empty for unlimited.</p>
            <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
              {[['users', 'Staff accounts'], ['products', 'Products'], ['billsPerMonth', 'Bills a month']].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-desc font-semibold text-slate-500">{label}</span>
                  <input
                    type="number" min="1"
                    value={draft.limits[key]}
                    onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [key]: e.target.value } })}
                    placeholder="unlimited"
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={busy}
                className="h-11 flex-1 rounded-lg border border-slate-200 text-body font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={busy || !draft.name.trim() || (editing === 'new' && !draft.code.trim())}
                className="h-11 flex-1 rounded-lg bg-brand text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40">
                {busy ? 'Saving…' : 'Save plan'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}
