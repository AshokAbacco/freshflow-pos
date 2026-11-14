import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCheck, LuUndo2 } from 'react-icons/lu';
import { Card, Chip, Empty, ErrorNote, Loading, Page, Pagination, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { sinceNow, whenExact } from '../../lib/platformFormat.js';

/*
 * What stores have written back.
 *
 * Oldest first, deliberately: the shop that has been waiting longest gets answered first.
 * Sorting newest-first would quietly bury anyone who did not shout.
 */

export default function PlatformInboxPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const query = params.toString();
  const handled = params.get('handled') === 'true';

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await platformApi.get(`/inbox?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the inbox.'));
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value) next.delete(key); else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  };

  const toggle = async (reply) => {
    setBusy(reply.id); setError(null);
    try {
      await platformApi.post(`/inbox/${reply.id}/handled`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'That did not go through.'));
    } finally { setBusy(null); }
  };

  const replies = data?.replies ?? [];

  return (
    <Page
      wide
      title="Inbox"
      subtitle={
        loading && !data ? 'Loading…'
          : data.waiting ? `${data.waiting} waiting for an answer`
          : 'Nothing waiting'
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip on={!handled} onClick={() => setFilter('handled', '')}>
          Waiting{data?.waiting ? ` (${data.waiting})` : ''}
        </Chip>
        <Chip on={handled} onClick={() => setFilter('handled', 'true')}>Answered</Chip>
      </div>

      <ErrorNote message={error} onRetry={load} />

      <Card>
        {loading && !data ? (
          <Loading what="Loading the inbox" />
        ) : !replies.length ? (
          <Empty title={handled ? 'Nothing answered yet' : 'Inbox clear'}>
            {handled ? 'Replies you have dealt with show here.' : 'When a shop writes back, it appears here.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {replies.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-body text-slate-800">{r.body}</p>
                  <p className="mt-1 text-desc text-slate-500">
                    {r.authorLabel} at{' '}
                    {r.store ? (
                      <Link to={`/platform/stores/${r.store.id}`} className="font-semibold text-slate-700 hover:text-brand-700 hover:underline">
                        {r.store.name}
                      </Link>
                    ) : 'a removed store'}
                    {r.inReplyTo ? ` · about "${r.inReplyTo.subject}"` : ''}
                    {' · '}
                    <span title={whenExact(r.createdAt)}>{sinceNow(r.createdAt)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(r)}
                  disabled={busy === r.id}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-desc font-bold transition disabled:opacity-40 ${
                    r.handledAt
                      ? 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {r.handledAt ? <LuUndo2 size={13} aria-hidden /> : <LuCheck size={13} aria-hidden />}
                  {r.handledAt ? 'Reopen' : 'Mark answered'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Pagination
        page={Number(params.get('page') ?? 1)}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        busy={loading}
        onPage={(p) => setFilter('page', p)}
      />
    </Page>
  );
}
