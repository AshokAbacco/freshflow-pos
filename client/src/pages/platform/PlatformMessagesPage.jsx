import { useCallback, useEffect, useState } from 'react';
import { LuEye, LuSend, LuTrash2 } from 'react-icons/lu';
import { Card, Empty, ErrorNote, Loading, Page, Pill, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { STATE_LABEL, STATE_ORDER, sinceNow, whenExact } from '../../lib/platformFormat.js';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';

/*
 * Messages to stores, read inside their own app.
 *
 * Compose and send are two steps on purpose: writing to every shop on the platform should not
 * happen on a stray keystroke. The audience is previewed with a real count before anything
 * goes out, and a sent message can never be unsent or deleted.
 */

export default function PlatformMessagesPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const isSuper = admin?.role === 'SUPER_ADMIN';

  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ subject: '', body: '', state: '', businessType: '', city: '' });
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get('/messages');
      setMessages(response.data.messages);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the messages.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Only the filters actually filled in; an empty object means every store. */
  const audienceOf = (d) => {
    const a = {};
    if (d.state) a.state = [d.state];
    if (d.businessType) a.businessType = [d.businessType];
    if (d.city.trim()) a.city = d.city.trim();
    return a;
  };

  // Re-counts as the filters change, so "who will get this" is never a guess.
  useEffect(() => {
    if (!composing) return undefined;
    const timer = setTimeout(async () => {
      try {
        const response = await platformApi.post('/messages/preview', { audience: audienceOf(draft) });
        setPreview(response.data);
      } catch { setPreview(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [composing, draft.state, draft.businessType, draft.city]);

  const saveDraft = async (event) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await platformApi.post('/messages', {
        subject: draft.subject.trim(),
        body: draft.body.trim(),
        audience: audienceOf(draft),
      });
      setComposing(false);
      setDraft({ subject: '', body: '', state: '', businessType: '', city: '' });
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not save that message.'));
    } finally { setBusy(false); }
  };

  const send = async (message) => {
    const ok = window.confirm(
      `Send "${message.subject}" now?\n\nIt will appear in every matching store's app. This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await platformApi.post(`/messages/${message.id}/send`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not send that message.'));
    } finally { setBusy(false); }
  };

  const remove = async (message) => {
    setError(null);
    try {
      await platformApi.delete(`/messages/${message.id}`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not delete that draft.'));
    }
  };

  return (
    <Page
      wide
      title="Messages"
      subtitle={loading && !messages ? 'Loading…' : `${messages.length} messages · read inside each store's app`}
      actions={
        <>
          <ReloadButton onClick={load} busy={loading} />
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="h-10 rounded-lg bg-brand px-3 text-body font-bold text-ink transition hover:bg-brand-700"
          >
            Write a message
          </button>
        </>
      }
    >
      <ErrorNote message={error} onRetry={load} />

      {composing ? (
        <form onSubmit={saveDraft} className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-h2 font-bold text-slate-900">New message</h2>

          <label className="mt-3 block">
            <span className="text-desc font-semibold text-slate-500">Subject</span>
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="Scheduled maintenance on Sunday"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="mt-3 block">
            <span className="text-desc font-semibold text-slate-500">Message</span>
            <textarea
              rows={5}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Write it as the shopkeeper will read it, in plain words."
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>

          <h3 className="mt-3 text-body font-bold text-slate-900">Who gets it</h3>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">State</span>
              <select
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
              >
                <option value="">Every store</option>
                {STATE_ORDER.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">Business type</span>
              <select
                value={draft.businessType}
                onChange={(e) => setDraft({ ...draft, businessType: e.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
              >
                <option value="">Any type</option>
                {['KIRANA','SUPERMARKET','MINI_MART','HYPERMARKET','WHOLESALE','OTHER'].map((t) => (
                  <option key={t} value={t}>{t.replace('_',' ').toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-desc font-semibold text-slate-500">City</span>
              <input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                placeholder="Any city"
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
              />
            </label>
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-body text-slate-600">
            <LuEye size={15} aria-hidden />
            {preview
              ? `${preview.count} store${preview.count === 1 ? '' : 's'} match${preview.count === 1 ? 'es' : ''} this${
                  preview.sample.length ? `: ${preview.sample.map((s) => s.name).slice(0, 3).join(', ')}${preview.count > 3 ? '…' : ''}` : ''
                }`
              : 'Counting…'}
          </p>

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setComposing(false)}
              className="h-11 rounded-lg border border-slate-200 px-4 text-body font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy || draft.subject.trim().length < 3 || draft.body.trim().length < 3}
              className="h-11 rounded-lg bg-slate-900 px-4 text-body font-bold text-white transition hover:bg-slate-800 disabled:opacity-40">
              Save as draft
            </button>
          </div>
          <p className="mt-1.5 text-desc text-slate-400">Saving does not send it. You send it from the list.</p>
        </form>
      ) : null}

      <Card>
        {loading && !messages ? (
          <Loading what="Loading messages" />
        ) : !messages.length ? (
          <Empty title="No messages yet">Write one to tell every shop about maintenance, a price change or a new feature.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-body font-semibold text-slate-900">{m.subject}</p>
                    {m.status === 'SENT'
                      ? <Pill className="bg-emerald-50 text-emerald-700">sent</Pill>
                      : <Pill className="bg-amber-50 text-amber-700">draft</Pill>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-desc text-slate-600">{m.body}</p>
                  <p className="mt-1 text-desc text-slate-400" title={m.sentAt ? whenExact(m.sentAt) : whenExact(m.createdAt)}>
                    {m.createdByLabel}
                    {m.status === 'SENT'
                      ? ` · sent to ${m.recipients} store${m.recipients === 1 ? '' : 's'} ${sinceNow(m.sentAt)}${m.readCount ? ` · ${m.readCount} opened` : ''}`
                      : ` · written ${sinceNow(m.createdAt)}`}
                  </p>
                </div>

                {m.status === 'DRAFT' && isSuper ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => remove(m)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Delete this draft">
                      <LuTrash2 size={14} aria-hidden />
                    </button>
                    <button type="button" onClick={() => send(m)} disabled={busy}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40">
                      <LuSend size={13} aria-hidden />
                      Send
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
