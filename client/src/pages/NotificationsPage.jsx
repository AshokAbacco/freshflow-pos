import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LuCheck,
  LuCircleAlert,
  LuInfo,
  LuLoaderCircle,
  LuMessageSquare,
  LuSend,
  LuTriangleAlert,
} from "react-icons/lu";
import { api, errorMessage } from "../lib/api";

/**
 * Everything the shop needs to know: alerts about its own plan, messages from the FreshFlow
 * team, and anything it has written back.
 *
 * The bell in the sidebar covers a quick glance from the register. This is the full page, and
 * it is what the phone's More menu opens: a dropdown panel inside a modal sheet would be a
 * poor way to read a long notice on a small screen.
 *
 * It also carries the "ask for help" box, which is the only way a shop can start a
 * conversation rather than only answer one.
 */

const when = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** Alerts first: they are about this shop and usually need doing something about. */
const TONE = {
  urgent: {
    box: "border-stock-out/30 bg-stock-outBg",
    icon: "text-stock-out",
    Icon: LuTriangleAlert,
  },
  warn: {
    box: "border-stock-low/30 bg-stock-lowBg",
    icon: "text-stock-low",
    Icon: LuCircleAlert,
  },
  info: {
    box: "border-surface-line bg-white",
    icon: "text-ink-muted",
    Icon: LuInfo,
  },
};

export default function NotificationsPage() {
  const [alerts, setAlerts] = useState([]);
  const [items, setItems] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [askText, setAskText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, mine] = await Promise.all([
        api.get("/notifications", { params: { limit: 50 } }),
        api.get("/notifications/replies"),
      ]);
      setItems(list.data.notifications ?? []);
      setAlerts(list.data.alerts ?? []);
      setReplies(mine.data.replies ?? []);
    } catch (err) {
      setError(errorMessage(err, "Could not load your messages."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openItem = async (item) => {
    const next = open === item.id ? null : item.id;
    setOpen(next);
    setReplyText("");
    setSent(null);
    if (next && !item.readAt) {
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      try {
        await api.post(`/notifications/${item.id}/read`);
      } catch {
        // The badge will correct itself on the next poll.
      }
    }
  };

  const reply = async (item) => {
    const body = replyText.trim();
    if (body.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/notifications/${item.id}/reply`, { body });
      setReplyText("");
      setSent(item.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Your reply did not send."));
    } finally {
      setBusy(false);
    }
  };

  const ask = async (event) => {
    event.preventDefault();
    const body = askText.trim();
    if (body.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/notifications/contact", { body });
      setAskText("");
      setSent("contact");
      await load();
    } catch (err) {
      setError(errorMessage(err, "That did not send."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl p-4">
        <h1 className="text-h1 font-bold text-ink">Notifications</h1>
        <p className="mt-0.5 text-desc text-ink-muted">
          Anything that needs your attention, and messages from the FreshFlow
          team.
        </p>

        {error ? (
          <p
            className="mt-3 rounded-lg bg-stock-outBg p-3 text-body text-stock-out"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading && !items ? (
          <p className="grid place-items-center gap-2 p-10 text-ink-faint">
            <LuLoaderCircle className="animate-spin" size={22} aria-hidden />
          </p>
        ) : (
          <>
            {alerts.length ? (
              <ul className="mt-4 space-y-2">
                {alerts.map((a) => {
                  const tone = TONE[a.tone] ?? TONE.info;
                  const Icon = tone.Icon;
                  return (
                    <li
                      key={a.id}
                      className={`rounded-2xl border p-3.5 ${tone.box}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon
                          size={18}
                          className={`mt-0.5 shrink-0 ${tone.icon}`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-body font-bold text-ink">
                            {a.title}
                          </p>
                          <p className="mt-0.5 text-body text-ink-soft">
                            {a.body}
                          </p>
                          {a.action ? (
                            <Link
                              to={a.action.to}
                              className="mt-2 inline-flex h-tap items-center rounded-xl bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-600"
                            >
                              {a.action.label}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {items?.length || alerts.length ? (
              <h2 className="mt-6 text-h2 font-bold text-ink">
                From the FreshFlow team
              </h2>
            ) : null}

            {!items?.length ? (
              <div className="mt-2 rounded-2xl border border-dashed border-surface-line p-8 text-center">
                <LuMessageSquare
                  size={24}
                  className="mx-auto text-ink-faint"
                  aria-hidden
                />
                <p className="mt-2 text-body font-semibold text-ink">
                  {alerts.length ? "No messages" : "Nothing to show"}
                </p>
                <p className="mt-1 text-desc text-ink-muted">
                  Notices about maintenance, pricing or new features will appear
                  here.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={`overflow-hidden rounded-2xl border ${
                      item.readAt
                        ? "border-surface-line bg-white"
                        : "border-brand-200 bg-brand-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      aria-expanded={open === item.id}
                      className="flex w-full items-start gap-2.5 p-3.5 text-left"
                    >
                      {!item.readAt ? (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                          aria-label="Unread"
                        />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-body ${
                            item.readAt ? "text-ink-soft" : "font-bold text-ink"
                          }`}
                        >
                          {item.subject}
                        </span>
                        <span className="mt-0.5 block text-desc text-ink-muted">
                          {when(item.sentAt)}
                        </span>
                      </span>
                    </button>

                    {open === item.id ? (
                      <div className="border-t border-surface-line p-3.5">
                        <p className="whitespace-pre-wrap text-body text-ink-soft">
                          {item.body}
                        </p>

                        {sent === item.id ? (
                          <p className="mt-3 flex items-center gap-1.5 text-body font-semibold text-stock-ok">
                            <LuCheck size={15} aria-hidden />
                            Sent. The team will come back to you.
                          </p>
                        ) : (
                          <div className="mt-3">
                            <label htmlFor={`r-${item.id}`} className="label">
                              Reply
                            </label>
                            <textarea
                              id={`r-${item.id}`}
                              rows={3}
                              value={replyText}
                              onChange={(event) =>
                                setReplyText(event.target.value)
                              }
                              placeholder="Write back if you need help with this."
                              className="w-full resize-none rounded-xl border border-surface-line p-2.5 text-body text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => reply(item)}
                              disabled={busy || replyText.trim().length < 2}
                              className="mt-2 flex h-tap items-center gap-2 rounded-xl bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-600 disabled:opacity-40"
                            >
                              {busy ? (
                                <LuLoaderCircle
                                  className="animate-spin"
                                  size={15}
                                  aria-hidden
                                />
                              ) : (
                                <LuSend size={15} aria-hidden />
                              )}
                              Send reply
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-6 rounded-2xl border border-surface-line bg-white p-4">
              <h2 className="text-h2 font-bold text-ink">Need help?</h2>
              <p className="mt-0.5 text-desc text-ink-muted">
                Write to the FreshFlow team. They will see it with your store
                name.
              </p>
              <form onSubmit={ask} className="mt-2">
                <textarea
                  rows={3}
                  value={askText}
                  onChange={(event) => setAskText(event.target.value)}
                  placeholder="What do you need a hand with?"
                  className="w-full resize-none rounded-xl border border-surface-line p-2.5 text-body text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || askText.trim().length < 2}
                  className="mt-2 flex h-tap items-center gap-2 rounded-xl bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-600 disabled:opacity-40"
                >
                  <LuSend size={15} aria-hidden />
                  Send
                </button>
                {sent === "contact" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-body font-semibold text-stock-ok">
                    <LuCheck size={15} aria-hidden />
                    Sent. They usually reply within a working day.
                  </p>
                ) : null}
              </form>
            </section>

            {replies.length ? (
              <section className="mt-4">
                <h2 className="text-h2 font-bold text-ink">
                  What you have sent
                </h2>
                <ul className="mt-2 space-y-2">
                  {replies.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-surface-line bg-white p-3.5"
                    >
                      <p className="whitespace-pre-wrap text-body text-ink-soft">
                        {r.body}
                      </p>
                      <p className="mt-1.5 text-desc text-ink-muted">
                        {when(r.createdAt)} ·{" "}
                        {r.handledAt
                          ? "answered by the team"
                          : "waiting for a reply"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
