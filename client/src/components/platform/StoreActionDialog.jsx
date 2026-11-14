import { useEffect, useId, useRef, useState } from "react";
import { LuCircleAlert, LuLoaderCircle, LuX } from "react-icons/lu";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";
import { inr } from "../../lib/platformFormat.js";

/**
 * The one dialog behind every subscription action: extend, change plan, suspend, reactivate,
 * cancel.
 *
 * All five share the same shape -- say what will happen, make the operator type why, then do it
 * once -- so they share one component. The reason box is not a formality: the server refuses an
 * action without one, and the text ends up on the store's timeline and in the audit log, which
 * is what makes "who gave this shop another month?" answerable six months later.
 */

const PLAN_PRICES = {
  STANDARD: { MONTHLY: 650, YEARLY: 550 },
  CUSTOM: { MONTHLY: 1000, YEARLY: 800 },
  TRIAL: { MONTHLY: 0, YEARLY: 0 },
};

const EXTEND_PRESETS = [7, 15, 30, 90];

/** Copy per action. `danger` styles the confirm button and the summary strip. */
const ACTIONS = {
  extend: {
    title: "Extend this subscription",
    verb: "Extend",
    path: "extend",
    blurb:
      "Adds paid time without taking a payment. Use it when money arrived outside Razorpay, or as a goodwill gesture.",
  },
  "change-plan": {
    title: "Change the plan",
    verb: "Save the new plan",
    path: "change-plan",
    blurb:
      "Changes what this store pays from its next renewal. It does not charge or refund anything now.",
  },
  suspend: {
    title: "Suspend this store",
    verb: "Suspend",
    path: "suspend",
    danger: true,
    blurb:
      "The till stops taking new bills immediately. Past bills, reports and data export stay available, and a payment will not lift this — only a reactivation will.",
  },
  reactivate: {
    title: "Lift the suspension",
    verb: "Reactivate",
    path: "reactivate",
    blurb:
      "Removes the suspension. It does not add time: if the plan lapsed while the store was suspended, it comes back expired and will need extending or a payment.",
  },
  cancel: {
    title: "Cancel this subscription",
    verb: "Cancel the subscription",
    path: "cancel",
    danger: true,
    blurb:
      "The store stops selling at the end of today. Their data stays, and they can still sign in to read and export it.",
  },
};

export default function StoreActionDialog({
  action,
  store,
  subscription,
  usage,
  onClose,
  onDone,
}) {
  const config = ACTIONS[action];
  const reasonId = useId();
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);
  const [plan, setPlan] = useState(subscription?.plan ?? "STANDARD");
  const [interval, setInterval] = useState(subscription?.interval ?? "MONTHLY");
  const [seats, setSeats] = useState(subscription?.seats ?? 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [action]);

  // Escape closes, and focus stays inside while it is open: this dialog can suspend a business,
  // so it should not be possible to tab onto the page behind and click something else.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  if (!config) return null;

  const trimmed = reason.trim();
  // Mirrors the server's rule so the operator finds out before the round trip, not after.
  const reasonOk = trimmed.length >= 5;

  const seatsNumber = Number(seats) || 0;
  const activeUsers = usage?.users ?? 0;
  const seatsTooFew = action === "change-plan" && seatsNumber < activeUsers;
  const newPrice = PLAN_PRICES[plan]?.[interval] ?? 0;

  const canSubmit = reasonOk && !busy && !seatsTooFew;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const body = { reason: trimmed };
    if (action === "extend") body.days = Number(days);
    if (action === "change-plan") {
      body.plan = plan;
      body.interval = interval;
      body.seats = seatsNumber;
    }

    try {
      await platformApi.post(`/stores/${store.id}/${config.path}`, body);
      onDone?.();
    } catch (err) {
      setError(platformErrorMessage(err, "The change did not go through."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50"
        onClick={() => !busy && onClose()}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${reasonId}-title`}
        className="relative w-full max-w-lg animate-sheet-in rounded-t-2xl bg-white shadow-lift sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-black/5 p-4">
          <div className="min-w-0 flex-1">
            <h2
              id={`${reasonId}-title`}
              className="text-h2 font-bold text-slate-900"
            >
              {config.title}
            </h2>
            <p className="mt-0.5 truncate text-desc text-slate-500">
              {store.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <LuX size={18} aria-hidden />
          </button>
        </div>

        <form
          onSubmit={submit}
          className="scroll-thin max-h-[70vh] overflow-y-auto p-4"
        >
          <p
            className={`rounded-lg p-3 text-body ${
              config.danger
                ? "bg-rose-50 text-rose-800"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {config.blurb}
          </p>

          {action === "extend" ? (
            <fieldset className="mt-4">
              <legend className="text-desc font-semibold text-slate-500">
                How much longer
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXTEND_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    ref={preset === 30 ? firstFieldRef : undefined}
                    onClick={() => setDays(preset)}
                    aria-pressed={Number(days) === preset}
                    className={`h-10 min-w-[72px] rounded-lg border px-3 text-body font-semibold transition ${
                      Number(days) === preset
                        ? "border-brand bg-brand text-ink"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {preset} days
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-desc text-slate-500">
                or
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  className="h-10 w-24 rounded-lg border border-slate-200 px-2 text-body text-slate-900 focus:border-brand focus:outline-none"
                  aria-label="Days to extend by"
                />
                days
              </label>
              {subscription?.currentPeriodEnd &&
              new Date(subscription.currentPeriodEnd) < new Date() ? (
                <p className="mt-2 text-desc text-slate-500">
                  This plan has already lapsed, so the extension runs from
                  today.
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {action === "change-plan" ? (
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor={`${reasonId}-plan`}
                  className="text-desc font-semibold text-slate-500"
                >
                  Plan
                </label>
                <select
                  id={`${reasonId}-plan`}
                  ref={firstFieldRef}
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
                >
                  <option value="STANDARD">Standard</option>
                  <option value="CUSTOM">Custom</option>
                  <option value="TRIAL">Trial</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${reasonId}-interval`}
                    className="text-desc font-semibold text-slate-500"
                  >
                    Billed
                  </label>
                  <select
                    id={`${reasonId}-interval`}
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`${reasonId}-seats`}
                    className="text-desc font-semibold text-slate-500"
                  >
                    Staff accounts
                  </label>
                  <input
                    id={`${reasonId}-seats`}
                    type="number"
                    min="1"
                    max="500"
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                    aria-describedby={
                      seatsTooFew ? `${reasonId}-seats-error` : undefined
                    }
                    className={`mt-1 h-11 w-full rounded-lg border px-2.5 text-body text-slate-900 focus:outline-none ${
                      seatsTooFew
                        ? "border-rose-400 focus:border-rose-500"
                        : "border-slate-200 focus:border-brand"
                    }`}
                  />
                </div>
              </div>

              {seatsTooFew ? (
                <p
                  id={`${reasonId}-seats-error`}
                  className="flex gap-1.5 text-desc text-rose-700"
                >
                  <LuCircleAlert
                    size={14}
                    className="mt-0.5 shrink-0"
                    aria-hidden
                  />
                  <span>
                    This store has {activeUsers} active staff accounts. Give it
                    at least that many seats, or deactivate someone first.
                  </span>
                </p>
              ) : (
                <p className="text-desc text-slate-500">
                  {inr(newPrice)} per staff account, per{" "}
                  {interval === "YEARLY" ? "month, billed yearly" : "month"}
                  {seatsNumber > 0
                    ? ` — ${inr(newPrice * seatsNumber)} per ${interval === "YEARLY" ? "month" : "month"}`
                    : ""}
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-4">
            <label
              htmlFor={reasonId}
              className="text-desc font-semibold text-slate-500"
            >
              Why are you doing this?
            </label>
            <textarea
              id={reasonId}
              ref={
                action === "suspend" ||
                action === "cancel" ||
                action === "reactivate"
                  ? firstFieldRef
                  : undefined
              }
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Goes on the store's timeline and the audit log, e.g. “Paid ₹7,800 by bank transfer, ref NEFT4471”"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-desc text-slate-400">
              {trimmed.length < 5
                ? "At least 5 characters. Write it for whoever reads this in six months."
                : "Recorded against your name."}
            </p>
          </div>

          {error ? (
            <p
              className="mt-3 flex gap-1.5 rounded-lg bg-rose-50 p-2.5 text-desc text-rose-800"
              role="alert"
            >
              <LuCircleAlert
                size={14}
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>{error}</span>
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-11 flex-1 rounded-lg border border-slate-200 text-body font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Keep as it is
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-body font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                config.danger
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-brand text-ink hover:bg-brand-700"
              }`}
            >
              {busy ? (
                <LuLoaderCircle
                  className="animate-spin"
                  size={16}
                  aria-hidden
                />
              ) : null}
              {busy ? "Working…" : config.verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
