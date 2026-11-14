import { useCallback, useEffect, useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { ErrorNote, Loading, Page, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { sinceNow } from '../../lib/platformFormat.js';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';

/*
 * The handful of numbers that change how the platform treats paying customers.
 *
 * Each one is rendered from the server's own schema -- label, help text, range -- so the form
 * cannot drift from what the API will accept, and a setting added on the server appears here
 * without touching this file.
 */

export default function PlatformSettingsPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const isSuper = admin?.role === 'SUPER_ADMIN';

  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get('/settings');
      setSettings(response.data.settings);
      setDraft(Object.fromEntries(response.data.settings.map((s) => [s.key, s.value])));
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the settings.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 3000);
    return () => clearTimeout(t);
  }, [done]);

  const dirty = settings?.some((s) => String(draft[s.key]) !== String(s.value));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError(null);
    // Only what actually changed, so an untouched setting is never written.
    const changed = Object.fromEntries(
      settings.filter((s) => String(draft[s.key]) !== String(s.value)).map((s) => [s.key, draft[s.key]]),
    );
    try {
      await platformApi.patch('/settings', changed);
      setDone(true);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not save those settings.'));
    } finally { setSaving(false); }
  };

  if (loading && !settings) return <Loading what="Loading settings" />;

  return (
    <Page
      title="Settings"
      subtitle="How the platform treats stores. Changes take effect immediately."
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      {done ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-body text-emerald-800">
          <LuCheck size={16} aria-hidden /> Saved.
        </p>
      ) : null}

      <ErrorNote message={error} onRetry={load} />

      {!isSuper ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-body text-slate-600">
          You can see these, but changing them needs a super admin account.
        </p>
      ) : null}

      <form onSubmit={save} className="mt-4 rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {settings.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[220px] flex-1">
                <label htmlFor={s.key} className="text-body font-semibold text-slate-900">{s.label}</label>
                <p className="text-desc text-slate-500">{s.help}</p>
                <p className="text-desc text-slate-400">
                  {s.isDefault
                    ? 'Never changed — using the default.'
                    : `Changed ${sinceNow(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ''}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  id={s.key}
                  type={s.type === 'number' ? 'number' : 'text'}
                  min={s.min} max={s.max} maxLength={s.maxLength}
                  disabled={!isSuper}
                  value={draft[s.key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
                  className="h-11 w-40 rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                />
                {s.unit ? <span className="text-desc text-slate-500">{s.unit}</span> : null}
              </div>
            </li>
          ))}
        </ul>

        {isSuper ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
            <p className="text-desc text-slate-400">
              {dirty ? 'Unsaved changes.' : 'Everything is saved.'}
            </p>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="h-11 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : null}
      </form>
    </Page>
  );
}
