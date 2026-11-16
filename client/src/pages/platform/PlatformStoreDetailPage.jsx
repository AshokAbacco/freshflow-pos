import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  LuArrowLeft,
  LuBan,
  LuCalendarPlus,
  LuCircleAlert,
  LuCirclePlay,
  LuLoaderCircle,
  LuMail,
  LuPhone,
  LuPin,
  LuPlus,
  LuRefreshCw,
  LuTags,
  LuTrash2,
  LuTriangleAlert,
} from "react-icons/lu";
import StoreActionDialog from "../../components/platform/StoreActionDialog.jsx";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import {
  BUSINESS_LABEL,
  PAYMENT_STYLE,
  ROLE_LABEL,
  STATE_LABEL,
  STATE_STYLE,
  inr,
  sinceNow,
  telHref,
  when,
  whenExact,
} from "../../lib/platformFormat.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

/*
 * One store, everything about it, and the five things a super admin can do to it.
 *
 * The header answers "can this shop sell right now, and why" before anything else, because
 * that is the question on the phone. Everything below it is evidence for that answer.
 */

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "payments", label: "Payments" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
];

export default function PlatformStoreDetailPage() {
  const { id } = useParams();
  const admin = usePlatformAuthStore((s) => s.admin);

  const [data, setData] = useState(null);
  const [users, setUsers] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");
  const [action, setAction] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  // Raising a chase from the store you are already looking at, which is where the thought
  // usually occurs -- not after navigating away to the follow-ups list.
  const [chaseOpen, setChaseOpen] = useState(false);
  const [chase, setChase] = useState({
    title: "",
    dueInDays: 3,
    priority: "NORMAL",
  });
  const [chaseBusy, setChaseBusy] = useState(false);

  const isSuper = admin?.role === "SUPER_ADMIN";
  const seesMoney = admin?.role !== "SUPPORT";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get(`/stores/${id}`);
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, "Could not load this store."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // The heavier tabs load when they are first opened, not on page load.
  useEffect(() => {
    if (tab === "people" && !users) {
      platformApi
        .get(`/stores/${id}/users`)
        .then((r) => setUsers(r.data.users))
        .catch(() => setUsers([]));
    }
    if (tab === "activity" && !activity) {
      platformApi
        .get(`/stores/${id}/activity`)
        .then((r) => setActivity(r.data.entries))
        .catch(() => setActivity([]));
    }
  }, [tab, id, users, activity]);

  const addNote = async (event) => {
    event.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    setNoteBusy(true);
    try {
      await platformApi.post(`/stores/${id}/notes`, { body });
      setNoteDraft("");
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "The note was not saved."));
    } finally {
      setNoteBusy(false);
    }
  };

  const addFollowUp = async (event) => {
    event.preventDefault();
    if (chase.title.trim().length < 3) return;
    setChaseBusy(true);
    setError(null);
    try {
      await platformApi.post("/follow-ups", {
        organizationId: id,
        title: chase.title.trim(),
        type: "SUPPORT_ISSUE",
        priority: chase.priority,
        dueAt: new Date(
          Date.now() + Number(chase.dueInDays) * 86400000,
        ).toISOString(),
      });
      setChase({ title: "", dueInDays: 3, priority: "NORMAL" });
      setChaseOpen(false);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "That follow-up was not saved."));
    } finally {
      setChaseBusy(false);
    }
  };

  const deleteNote = async (noteId) => {
    try {
      await platformApi.delete(`/stores/${id}/notes/${noteId}`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, "The note was not removed."));
    }
  };

  if (loading && !data) {
    return (
      <div className="grid place-items-center gap-2 p-16 text-slate-400">
        <LuLoaderCircle className="animate-spin" size={22} aria-hidden />
        <p className="text-desc">Loading this store…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <LuTriangleAlert
          size={28}
          className="mx-auto text-rose-500"
          aria-hidden
        />
        <p className="mt-2 text-body font-semibold text-slate-800">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            to="/platform/stores"
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-body font-semibold leading-10 text-slate-600"
          >
            Back to stores
          </Link>
          <button
            type="button"
            onClick={load}
            className="h-10 rounded-lg bg-slate-900 px-4 text-body font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const {
    store,
    entitlement,
    subscription,
    usage,
    payments,
    timeline,
    notes,
    followUps,
  } = data;
  const suspended = entitlement.state === "SUSPENDED";
  const cancelled = entitlement.state === "CANCELLED";

  return (
    <div className="mx-auto w-full max-w-[1100px] p-4 lg:p-6">
      <Link
        to="/platform/stores"
        className="inline-flex items-center gap-1.5 text-desc font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <LuArrowLeft size={14} aria-hidden />
        All stores
      </Link>

      {/* Can this shop sell right now, and why. */}
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-extrabold text-slate-900">
              {store.name}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-desc font-semibold ${
                STATE_STYLE[entitlement.state] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {STATE_LABEL[entitlement.state] ?? entitlement.state}
            </span>
          </div>
          <p className="mt-1 text-desc text-slate-500">
            {[
              BUSINESS_LABEL[store.businessType] ?? store.businessType,
              [store.city, store.region].filter(Boolean).join(", "),
              `Joined ${when(store.createdAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            aria-label="Reload"
            title="Reload"
          >
            <LuRefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
              aria-hidden
            />
          </button>
        </div>
      </header>

      {/*
       * The banner follows the state, not just "can it write". A store in grace or past due
       * can still take bills, but it is days from stopping -- showing that on a green
       * everything-is-fine banner is how a renewal gets missed.
       */}
      <p
        className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-body ${
          !entitlement.canWrite
            ? "bg-rose-50 text-rose-800"
            : entitlement.state === "GRACE_PERIOD" ||
                entitlement.state === "PAST_DUE"
              ? "bg-amber-50 text-amber-900"
              : "bg-emerald-50 text-emerald-800"
        }`}
      >
        {entitlement.canWrite && entitlement.state === "ACTIVE" ? null : (
          <LuCircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
        )}
        <span>
          {entitlement.canWrite
            ? `This store can take bills${
                entitlement.daysLeft !== null
                  ? ` for another ${entitlement.daysLeft} days`
                  : ""
              }.`
            : "This store cannot take new bills."}
          {entitlement.reason ? ` ${entitlement.reason}` : ""}
          {" Reading, reports and data export stay available either way."}
        </span>
      </p>

      {/* The actions. Only a super admin sees them, and the API refuses the rest regardless. */}
      {isSuper ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            onClick={() => setAction("extend")}
            icon={LuCalendarPlus}
            disabled={!subscription}
          >
            Extend
          </ActionButton>
          <ActionButton
            onClick={() => setAction("change-plan")}
            icon={LuTags}
            disabled={!subscription}
          >
            Change plan
          </ActionButton>
          {suspended ? (
            <ActionButton
              onClick={() => setAction("reactivate")}
              icon={LuCirclePlay}
              tone="good"
            >
              Reactivate
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() => setAction("suspend")}
              icon={LuBan}
              tone="danger"
              disabled={!subscription}
            >
              Suspend
            </ActionButton>
          )}
          {!cancelled ? (
            <ActionButton
              onClick={() => setAction("cancel")}
              icon={LuTrash2}
              tone="danger"
              disabled={!subscription}
            >
              Cancel
            </ActionButton>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-desc text-slate-400">
          Changing a subscription needs a super admin account.
        </p>
      )}

      {error ? (
        <p
          className="mt-3 rounded-lg bg-rose-50 p-2.5 text-desc text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.filter((t) => t.key !== "payments" || seesMoney).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-body font-semibold transition ${
              tab === t.key
                ? "border-brand text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.key === "notes" && notes.length ? (
              <span className="ml-1 text-desc text-slate-400">
                {notes.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="py-4">
        {tab === "overview" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel title="Subscription">
              {subscription ? (
                <dl className="space-y-1.5">
                  <Row
                    label="Plan"
                    value={`${subscription.plan} · ${subscription.interval.toLowerCase()}`}
                  />
                  <Row
                    label="Staff accounts"
                    value={`${usage.users} of ${usage.seats} used`}
                  />
                  {seesMoney ? (
                    <Row
                      label="Price"
                      value={`${inr(subscription.pricePerUser, subscription.currency)} per account`}
                    />
                  ) : null}
                  {subscription.trialEndsAt ? (
                    <Row
                      label="Trial ends"
                      value={when(subscription.trialEndsAt)}
                    />
                  ) : null}
                  <Row
                    label="Current period ends"
                    value={when(subscription.currentPeriodEnd)}
                  />
                  {subscription.graceEndsAt ? (
                    <Row
                      label="Grace ends"
                      value={when(subscription.graceEndsAt)}
                    />
                  ) : null}
                  {subscription.suspendedAt ? (
                    <Row
                      label="Suspended"
                      value={`${when(subscription.suspendedAt)}${
                        subscription.suspendedReason
                          ? ` — ${subscription.suspendedReason}`
                          : ""
                      }`}
                    />
                  ) : null}
                  {subscription.cancelledAt ? (
                    <Row
                      label="Cancelled"
                      value={when(subscription.cancelledAt)}
                    />
                  ) : null}
                  <Row
                    label="Stored status"
                    value={subscription.storedStatus}
                    hint="What the column says. The state above is computed from the dates and wins."
                  />
                </dl>
              ) : (
                <p className="text-body text-slate-500">
                  This store has no subscription row at all, so it cannot sell.
                  It was most likely created outside the normal signup.
                </p>
              )}
            </Panel>

            <Panel title="Usage">
              <dl className="space-y-1.5">
                <Row
                  label="Staff accounts"
                  value={usage.users.toLocaleString("en-IN")}
                />
                <Row
                  label="Seats spare"
                  value={usage.seatsLeft.toLocaleString("en-IN")}
                />
                <Row
                  label="Products"
                  value={usage.products.toLocaleString("en-IN")}
                />
                <Row
                  label="Bills this month"
                  value={usage.billsThisMonth.toLocaleString("en-IN")}
                />
                <Row
                  label="Last active"
                  value={sinceNow(store.lastActiveAt)}
                  hint={when(store.lastActiveAt)}
                />
              </dl>
            </Panel>

            <Panel title="Shop details">
              <dl className="space-y-1.5">
                {store.legalName ? (
                  <Row label="Registered name" value={store.legalName} />
                ) : null}
                {store.gstin ? <Row label="GSTIN" value={store.gstin} /> : null}
                {store.address ? (
                  <Row label="Address" value={store.address} />
                ) : null}
                {store.phone ? (
                  <Row
                    label="Shop phone"
                    value={
                      <a
                        href={telHref(store.phone)}
                        className="text-brand-700 hover:underline"
                      >
                        {store.phone}
                      </a>
                    }
                  />
                ) : null}
                {!store.legalName &&
                !store.gstin &&
                !store.address &&
                !store.phone ? (
                  <p className="text-body text-slate-500">
                    The shop has not filled in its details yet.
                  </p>
                ) : null}
              </dl>
            </Panel>

            <Panel
              title={`Open follow-ups${followUps.length ? ` (${followUps.length})` : ""}`}
            >
              <button
                type="button"
                onClick={() => setChaseOpen((v) => !v)}
                aria-expanded={chaseOpen}
                className="mb-2 flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <LuPlus size={13} aria-hidden />
                Add a follow-up
              </button>

              {chaseOpen ? (
                <form
                  onSubmit={addFollowUp}
                  className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                >
                  <label
                    htmlFor="chase"
                    className="text-desc font-semibold text-slate-500"
                  >
                    What needs chasing?
                  </label>
                  <input
                    id="chase"
                    autoFocus
                    value={chase.title}
                    onChange={(event) =>
                      setChase({ ...chase, title: event.target.value })
                    }
                    placeholder="e.g. Call back about the second till"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                  <div className="mt-2 flex items-end gap-2">
                    <label className="flex-1">
                      <span className="text-desc text-slate-500">
                        Due in (days)
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={chase.dueInDays}
                        onChange={(event) =>
                          setChase({ ...chase, dueInDays: event.target.value })
                        }
                        className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
                      />
                    </label>
                    <label className="flex-1">
                      <span className="text-desc text-slate-500">Priority</span>
                      <select
                        value={chase.priority}
                        onChange={(event) =>
                          setChase({ ...chase, priority: event.target.value })
                        }
                        className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
                      >
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={chase.title.trim().length < 3 || chaseBusy}
                      className="h-10 shrink-0 rounded-lg bg-brand px-3 text-desc font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
                    >
                      {chaseBusy ? "Saving…" : "Add"}
                    </button>
                  </div>
                </form>
              ) : null}

              {followUps.length ? (
                <ul className="space-y-2">
                  {followUps.map((f) => (
                    <li key={f.id} className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          f.priority === "HIGH" ? "bg-rose-500" : "bg-amber-500"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-body text-slate-800">{f.title}</p>
                        <p className="text-desc text-slate-500">
                          Due {sinceNow(f.dueAt)}
                          {f.assignee?.name
                            ? ` · ${f.assignee.name}`
                            : " · unassigned"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-slate-500">Nothing to chase.</p>
              )}
            </Panel>
          </div>
        ) : null}

        {tab === "people" ? (
          !users ? (
            <Loading />
          ) : !users.length ? (
            <Empty>No staff accounts on this store.</Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-slate-900">
                        {u.name}
                        {!u.isActive ? (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-desc font-semibold text-slate-500">
                            deactivated
                          </span>
                        ) : null}
                      </p>
                      <p className="text-desc text-slate-500">
                        {ROLE_LABEL[u.role] ?? u.role} · last signed in{" "}
                        {sinceNow(u.lastLoginAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {u.phone ? (
                        <a
                          href={telHref(u.phone)}
                          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                          aria-label={`Call ${u.name}`}
                          title={u.phone}
                        >
                          <LuPhone size={14} aria-hidden />
                        </a>
                      ) : null}
                      <a
                        href={`mailto:${u.email}`}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        aria-label={`Email ${u.name}`}
                        title={u.email}
                      >
                        <LuMail size={14} aria-hidden />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {tab === "payments" && seesMoney ? (
          !payments.length ? (
            <Empty>This store has never been charged.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-desc font-semibold text-slate-500">
                    <th className="px-3 py-2.5">When</th>
                    <th className="px-3 py-2.5">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Method</th>
                    <th className="px-3 py-2.5">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td
                        className="px-3 py-2.5 text-body text-slate-700"
                        title={whenExact(p.createdAt)}
                      >
                        {when(p.paidAt ?? p.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-body text-slate-900">
                        {inr(p.amount, p.currency)}
                        {p.amountRefunded > 0 ? (
                          <span className="block text-desc text-slate-500">
                            {inr(p.amountRefunded, p.currency)} refunded
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-desc font-semibold ${
                            PAYMENT_STYLE[p.status] ??
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {p.status.toLowerCase()}
                        </span>
                        {p.failureReason ? (
                          <span className="block text-desc text-rose-700">
                            {p.failureReason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-body text-slate-600">
                        {p.method ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-desc text-slate-500">
                        {p.paymentId ?? p.orderId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "timeline" ? (
          !timeline.length ? (
            <Empty>Nothing has happened to this subscription yet.</Empty>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300 ring-4 ring-[#F6F7F9]"
                    aria-hidden
                  />
                  <p className="text-body font-semibold text-slate-900">
                    {e.type.replace(/_/g, " ").toLowerCase()}
                    {e.fromPlan && e.toPlan && e.fromPlan !== e.toPlan ? (
                      <span className="font-normal text-slate-500">
                        {" "}
                        — {e.fromPlan} to {e.toPlan}
                      </span>
                    ) : null}
                  </p>
                  {e.reason ? (
                    <p className="text-body text-slate-600">{e.reason}</p>
                  ) : null}
                  <p
                    className="text-desc text-slate-400"
                    title={whenExact(e.createdAt)}
                  >
                    {e.actorLabel} · {sinceNow(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )
        ) : null}

        {tab === "notes" ? (
          <div>
            <form
              onSubmit={addNote}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <label
                htmlFor="note"
                className="text-desc font-semibold text-slate-500"
              >
                Add an internal note
              </label>
              <textarea
                id="note"
                rows={2}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="What the shop said, what you promised, what to check next time."
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-desc text-slate-400">
                  Only platform staff can see these.
                </p>
                <button
                  type="submit"
                  disabled={!noteDraft.trim() || noteBusy}
                  className="flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
                >
                  {noteBusy ? (
                    <LuLoaderCircle
                      className="animate-spin"
                      size={15}
                      aria-hidden
                    />
                  ) : null}
                  Save note
                </button>
              </div>
            </form>

            {notes.length ? (
              <ul className="mt-3 space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start gap-2">
                      {n.pinned ? (
                        <LuPin
                          size={14}
                          className="mt-1 shrink-0 text-amber-600"
                          aria-hidden
                        />
                      ) : null}
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-body text-slate-800">
                        {n.body}
                      </p>
                      {isSuper || n.authorLabel?.includes(admin?.email) ? (
                        <button
                          type="button"
                          onClick={() => deleteNote(n.id)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete this note"
                        >
                          <LuTrash2 size={14} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    <p
                      className="mt-1.5 text-desc text-slate-400"
                      title={whenExact(n.createdAt)}
                    >
                      {n.authorLabel} · {sinceNow(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No notes yet.</Empty>
            )}
          </div>
        ) : null}

        {tab === "activity" ? (
          !activity ? (
            <Loading />
          ) : !activity.length ? (
            <Empty>Nothing has been done to this store from the panel.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {activity.map((a) => (
                <li key={a.id} className="p-3">
                  <p className="text-body text-slate-900">
                    <span className="font-semibold">{a.action}</span>
                    {a.reason ? (
                      <span className="text-slate-600"> — {a.reason}</span>
                    ) : null}
                  </p>
                  <p
                    className="text-desc text-slate-400"
                    title={whenExact(a.createdAt)}
                  >
                    {a.actorLabel}
                    {a.actorRole
                      ? ` (${ROLE_LABEL[a.actorRole] ?? a.actorRole})`
                      : ""}{" "}
                    · {sinceNow(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {action ? (
        <StoreActionDialog
          action={action}
          store={store}
          subscription={subscription}
          usage={usage}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            setActivity(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ActionButton({ onClick, icon: Icon, children, tone, disabled }) {
  const styles =
    tone === "danger"
      ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
      : tone === "good"
        ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-body font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      <Icon size={15} aria-hidden />
      {children}
    </button>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-h2 font-bold text-slate-900">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-body text-slate-500" title={hint}>
        {label}
      </dt>
      <dd className="text-body font-semibold text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

const Loading = () => (
  <div className="grid place-items-center p-10 text-slate-400">
    <LuLoaderCircle className="animate-spin" size={20} aria-hidden />
  </div>
);

const Empty = ({ children }) => (
  <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-body text-slate-500">
    {children}
  </p>
);
