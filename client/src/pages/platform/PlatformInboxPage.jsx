import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuCheck,
  LuLoaderCircle,
  LuMessagesSquare,
  LuReply,
  LuUndo2,
} from "react-icons/lu";
import {
  Card,
  Chip,
  Empty,
  ErrorNote,
  Loading,
  Page,
  Pagination,
  ReloadButton,
} from "../../components/platform/ui.jsx";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import { sinceNow, whenExact } from "../../lib/platformFormat.js";

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
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [thread, setThread] = useState(null);

  const query = params.toString();
  const handled = params.get("handled") === "true";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/inbox?${query}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load the inbox."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) => {
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
  };

  /*
   * Sending an answer also closes the question: replying IS dealing with it, and asking the
   * operator to click twice is how a thread ends up answered but still sitting in the list.
   */
  const sendReply = async (reply) => {
    const body = replyText.trim();
    if (body.length < 2) return;
    setBusy(reply.id);
    setError(null);
    try {
      await platformApi.post(`/inbox/${reply.id}/reply`, { body });
      setReplyingTo(null);
      setReplyText("");
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That reply did not send."));
    } finally {
      setBusy(null);
    }
  };

  /** The whole back-and-forth with one shop, so an answer has its context. */
  const openThread = async (reply) => {
    if (thread?.storeId === reply.store?.id) {
      setThread(null);
      return;
    }
    setThread({ storeId: reply.store?.id, loading: true, items: [] });
    try {
      const response = await platformApi.get(`/inbox/thread/${reply.store.id}`);
      setThread({
        storeId: reply.store.id,
        loading: false,
        items: response.data.thread,
      });
    } catch {
      setThread(null);
    }
  };

  const toggle = async (reply) => {
    setBusy(reply.id);
    setError(null);
    try {
      await platformApi.post(`/inbox/${reply.id}/handled`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That did not go through."));
    } finally {
      setBusy(null);
    }
  };

  const replies = data?.replies ?? [];

  return (
    <Page
      wide
      title="Inbox"
      subtitle={
        loading && !data
          ? "Loading…"
          : data.waiting
            ? `${data.waiting} waiting for an answer`
            : "Nothing waiting"
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip on={!handled} onClick={() => setFilter("handled", "")}>
          Waiting{data?.waiting ? ` (${data.waiting})` : ""}
        </Chip>
        <Chip on={handled} onClick={() => setFilter("handled", "true")}>
          Answered
        </Chip>
      </div>

      <ErrorNote message={error} onRetry={load} />

      <Card>
        {loading && !data ? (
          <Loading what="Loading the inbox" />
        ) : !replies.length ? (
          <Empty title={handled ? "Nothing answered yet" : "Inbox clear"}>
            {handled
              ? "Replies you have dealt with show here."
              : "When a shop writes back, it appears here."}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {replies.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-body text-slate-800">
                    {r.body}
                  </p>
                  <p className="mt-1 text-desc text-slate-500">
                    {r.authorLabel} at{" "}
                    {r.store ? (
                      <Link
                        to={`/platform/stores/${r.store.id}`}
                        className="font-semibold text-slate-700 hover:text-brand-700 hover:underline"
                      >
                        {r.store.name}
                      </Link>
                    ) : (
                      "a removed store"
                    )}
                    {r.inReplyTo ? ` · about "${r.inReplyTo.subject}"` : ""}
                    {" · "}
                    <span title={whenExact(r.createdAt)}>
                      {sinceNow(r.createdAt)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {r.store ? (
                    <button
                      type="button"
                      onClick={() => openThread(r)}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50"
                      title="See the whole conversation with this store"
                    >
                      <LuMessagesSquare size={13} aria-hidden />
                      Thread
                    </button>
                  ) : null}
                  {!r.handledAt ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(replyingTo === r.id ? null : r.id);
                        setReplyText("");
                      }}
                      aria-expanded={replyingTo === r.id}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-700"
                    >
                      <LuReply size={13} aria-hidden />
                      Reply
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggle(r)}
                    disabled={busy === r.id}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-desc font-bold transition disabled:opacity-40 ${
                      r.handledAt
                        ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {r.handledAt ? (
                      <LuUndo2 size={13} aria-hidden />
                    ) : (
                      <LuCheck size={13} aria-hidden />
                    )}
                    {r.handledAt ? "Reopen" : "Close"}
                  </button>
                </div>

                {replyingTo === r.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendReply(r);
                    }}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                  >
                    <label
                      htmlFor={`reply-${r.id}`}
                      className="text-desc font-semibold text-slate-500"
                    >
                      Reply to {r.store?.name ?? "this store"}
                    </label>
                    <textarea
                      id={`reply-${r.id}`}
                      rows={3}
                      autoFocus
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="They will see this in their app and can write back."
                      className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="text-desc text-slate-400">
                        Sending also closes this one.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="h-9 rounded-lg px-3 text-desc font-semibold text-slate-500 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={
                            replyText.trim().length < 2 || busy === r.id
                          }
                          className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
                        >
                          {busy === r.id ? (
                            <LuLoaderCircle
                              className="animate-spin"
                              size={13}
                              aria-hidden
                            />
                          ) : null}
                          Send reply
                        </button>
                      </div>
                    </div>
                  </form>
                ) : null}

                {thread?.storeId === r.store?.id && r.store ? (
                  <div className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-desc font-semibold text-slate-500">
                      Conversation with {r.store.name}
                    </p>
                    {thread.loading ? (
                      <p className="py-3 text-center text-desc text-slate-400">
                        Loading…
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {thread.items.map((t) => (
                          <li
                            key={`${t.side}-${t.id}`}
                            className={`rounded-lg p-2.5 ${
                              t.side === "platform"
                                ? "ml-8 bg-brand/10"
                                : "mr-8 bg-slate-50"
                            }`}
                          >
                            {t.subject ? (
                              <p className="text-desc font-bold text-slate-700">
                                {t.subject}
                              </p>
                            ) : null}
                            <p className="whitespace-pre-wrap text-body text-slate-800">
                              {t.body}
                            </p>
                            <p className="mt-1 text-desc text-slate-400">
                              {t.side === "platform" ? "us" : t.who} ·{" "}
                              {sinceNow(t.at)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Pagination
        page={Number(params.get("page") ?? 1)}
        pageSize={data?.pageSize ?? 50}
        total={data?.total ?? 0}
        busy={loading}
        onPage={(p) => setFilter("page", p)}
      />
    </Page>
  );
}
