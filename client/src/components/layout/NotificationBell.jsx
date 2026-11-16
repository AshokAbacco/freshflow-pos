import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuBell,
  LuCheck,
  LuCircleAlert,
  LuLoaderCircle,
  LuSend,
  LuX,
} from "react-icons/lu";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

/**
 * Where messages from the FreshFlow team reach the shop.
 *
 * The bell lives in the shell so it is visible from the register, which is the only screen a
 * cashier ever looks at. The count is polled rather than pushed: a till that is offline for an
 * hour should quietly catch up when it reconnects, and a websocket for a handful of notices a
 * month is not worth the reconnect logic.
 *
 * Opening a message marks it read; replying marks it read too, since you plainly read it.
 */

const when = (value) => {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/**
 * The unread count, polled.
 *
 * Shared by the bell and by the Messages row in the phone's More sheet so there is one timer
 * and one number, rather than two that can disagree on screen.
 */
export function useUnreadCount() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      // Anything wanting attention, not only unread messages: an expiring plan with no new
      // message would otherwise show a bell with nothing on it.
      setUnread(data.total ?? data.unread ?? 0);
    } catch {
      // A till with no connection is the normal case, not an error worth showing.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { unread, setUnread, refresh };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { unread, setUnread, refresh: pollCount } = useUnreadCount();
  const [items, setItems] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/notifications", {
        params: { limit: 30 },
      });
      setItems(data.notifications ?? []);
      setAlerts(data.alerts ?? []);
      setUnread(
        (data.unread ?? 0) +
          (data.alerts ?? []).filter((a) => a.tone !== "info").length,
      );
    } catch {
      setError("Could not load your messages. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Click outside and Escape both close the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (item) => {
    const next = expanded === item.id ? null : item.id;
    setExpanded(next);
    setReplyText("");
    setSent(false);
    if (next && !item.readAt) {
      // Optimistic: the badge should drop the moment it is opened, not after a round trip.
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnread((n) => Math.max(0, n - 1));
      try {
        await api.post(`/notifications/${item.id}/read`);
      } catch {
        pollCount();
      }
    }
  };

  const markAllRead = async () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
    try {
      await api.post("/notifications/read-all");
    } catch {
      pollCount();
    }
  };

  const sendReply = async (item) => {
    const body = replyText.trim();
    if (body.length < 2) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/notifications/${item.id}/reply`, { body });
      setReplyText("");
      setSent(true);
    } catch {
      setError("Your reply did not send. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          unread
            ? `Notifications, ${unread} needing attention`
            : "Notifications"
        }
        title="Notifications"
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
      >
        <LuBell aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          /*
           * The bell sits at the bottom of the sidebar, so on desktop the panel is anchored to
           * its bottom edge and grows upward. Anchored to the top it opened downward and ran
           * straight off the end of the screen.
           */
          className="fixed inset-x-2 bottom-20 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-surface-line bg-white shadow-modal md:absolute md:inset-x-auto md:bottom-0 md:left-full md:top-auto md:ml-3 md:max-h-[min(70vh,520px)] md:w-[380px]"
        >
          <div className="flex items-center gap-2 border-b border-surface-line px-3 py-2.5">
            <p className="flex-1 text-body font-bold text-ink">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-lg px-2 py-1 text-desc font-semibold text-ink-muted transition hover:bg-surface-sunk"
              >
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-surface-sunk"
            >
              <LuX size={16} aria-hidden />
            </button>
          </div>

          <div className="scroll-thin max-h-[calc(70vh-48px)] overflow-y-auto">
            {loading && !items ? (
              <p className="grid place-items-center gap-2 p-8 text-ink-faint">
                <LuLoaderCircle
                  className="animate-spin"
                  size={20}
                  aria-hidden
                />
              </p>
            ) : error ? (
              <p className="flex items-start gap-2 p-4 text-body text-ink-soft">
                <LuCircleAlert
                  size={16}
                  className="mt-0.5 shrink-0 text-stock-out"
                  aria-hidden
                />
                {error}
              </p>
            ) : !items?.length && !alerts.length ? (
              <div className="p-8 text-center">
                <p className="text-body font-semibold text-ink">No messages</p>
                <p className="mt-1 text-desc text-ink-muted">
                  Notices from the FreshFlow team will appear here.
                </p>
              </div>
            ) : (
              <>
                {alerts.length ? (
                  <ul className="divide-y divide-surface-line border-b border-surface-line">
                    {alerts.map((a) => (
                      <li
                        key={a.id}
                        className={
                          a.tone === "urgent"
                            ? "bg-stock-outBg"
                            : a.tone === "warn"
                              ? "bg-stock-lowBg"
                              : ""
                        }
                      >
                        <div className="px-3 py-2.5">
                          <p className="text-body font-bold text-ink">
                            {a.title}
                          </p>
                          <p className="mt-0.5 text-desc text-ink-soft">
                            {a.body}
                          </p>
                          {a.action ? (
                            <Link
                              to={a.action.to}
                              onClick={() => setOpen(false)}
                              className="mt-1.5 inline-block text-desc font-bold text-brand-700 hover:underline"
                            >
                              {a.action.label}
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ul className="divide-y divide-surface-line">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={item.readAt ? "" : "bg-brand-50"}
                    >
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        aria-expanded={expanded === item.id}
                        className="w-full px-3 py-2.5 text-left transition hover:bg-surface-sunk"
                      >
                        <div className="flex items-start gap-2">
                          {!item.readAt ? (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                              aria-label="Unread"
                            />
                          ) : (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0"
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-body ${
                                item.readAt
                                  ? "text-ink-soft"
                                  : "font-bold text-ink"
                              }`}
                            >
                              {item.subject}
                            </span>
                            <span className="mt-0.5 block text-desc text-ink-muted">
                              {when(item.sentAt)}
                            </span>
                          </span>
                        </div>
                      </button>

                      {expanded === item.id ? (
                        <div className="px-3 pb-3">
                          <p className="whitespace-pre-wrap rounded-lg bg-surface-sunk p-2.5 text-body text-ink-soft">
                            {item.body}
                          </p>

                          {sent ? (
                            <p className="mt-2 flex items-center gap-1.5 text-desc font-semibold text-stock-ok">
                              <LuCheck size={14} aria-hidden />
                              Sent. The team will see it.
                            </p>
                          ) : (
                            <div className="mt-2">
                              <label
                                htmlFor={`reply-${item.id}`}
                                className="label"
                              >
                                Reply
                              </label>
                              <textarea
                                id={`reply-${item.id}`}
                                rows={2}
                                value={replyText}
                                onChange={(event) =>
                                  setReplyText(event.target.value)
                                }
                                placeholder="Write back if you need help with this."
                                className="w-full resize-none rounded-lg border border-surface-line p-2 text-body text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => sendReply(item)}
                                disabled={
                                  sending || replyText.trim().length < 2
                                }
                                className="mt-1.5 flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-600 disabled:opacity-40"
                              >
                                {sending ? (
                                  <LuLoaderCircle
                                    className="animate-spin"
                                    size={13}
                                    aria-hidden
                                  />
                                ) : (
                                  <LuSend size={13} aria-hidden />
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
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
