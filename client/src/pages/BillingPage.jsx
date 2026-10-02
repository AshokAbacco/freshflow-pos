import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  LuCircleCheck,
  LuCreditCard,
  LuLoaderCircle,
  LuTriangleAlert,
} from "react-icons/lu";
import { SyncPill } from "../components/layout/AppShell";
import {
  IntervalToggle,
  PlanCard,
  SeatStepper,
} from "../components/pricing/PricingPlans";
import { Button } from "../components/ui/Button";
import { ErrorState, Spinner } from "../components/ui/States";
import { useApiQuery } from "../hooks/useApiQuery";
import { api, errorMessage } from "../lib/api";
import { formatDateTime, formatMoney } from "../lib/format";
import { openCheckout } from "../lib/razorpay";
import { useAuthStore } from "../store/authStore";
import { toast } from "../store/toastStore";

const STATUS_COPY = {
  TRIALING: { tone: "bg-brand-50 text-brand-800", label: "Free trial" },
  ACTIVE: { tone: "bg-brand-50 text-brand-800", label: "Active" },
  PAST_DUE: { tone: "bg-amber-50 text-amber-800", label: "Payment due" },
  CANCELLED: { tone: "bg-slate-100 text-slate-700", label: "Cancelled" },
  EXPIRED: { tone: "bg-rose-50 text-rose-700", label: "Ended" },
};

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3000;

/**
 * When the browser's confirmation call does not get through, the payment is not lost: Razorpay's
 * webhook activates the plan server-side within seconds. Poll that order rather than telling
 * someone who has just been charged that their payment failed.
 */
async function waitForWebhook(orderId) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const { data } = await api.get(`/billing/orders/${orderId}`);
      if (data.payment.status === "PAID") return "PAID";
      if (data.payment.status === "FAILED") return "FAILED";
    } catch {
      // Keep polling: a transient failure here says nothing about the payment.
    }
  }
  return "PENDING";
}

export default function BillingPage() {
  const { openSync } = useOutletContext();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);

  const plans = useApiQuery("/public/plans", null);
  const subscription = useApiQuery("/billing/subscription", null);
  const payments = useApiQuery("/billing/payments", null);

  const [interval, setIntervalValue] = useState(
    params.get("interval") === "YEARLY" ? "YEARLY" : "MONTHLY",
  );
  const [seats, setSeats] = useState(Number(params.get("seats")) || 3);
  const [busyTier, setBusyTier] = useState(null);
  const [error, setError] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);

  const current = subscription.data?.subscription;
  const paymentsEnabled = subscription.data?.paymentsEnabled;
  const paymentMode = subscription.data?.paymentMode;

  useEffect(() => {
    if (current && !params.get("seats"))
      setSeats(Math.max(current.seatsUsed, current.seats || 3));
  }, [current, params]);

  const applied = () => {
    subscription.refetch();
    payments.refetch();
    refreshSubscription();
  };

  const pay = async (tier) => {
    setError(null);
    setPendingOrder(null);
    setBusyTier(tier);

    let orderId = null;
    try {
      const { data: order } = await api.post("/billing/checkout", {
        plan: tier,
        interval,
        seats,
      });
      orderId = order.orderId;

      const handover = await openCheckout({
        order,
        customer: {
          name: user?.name,
          email: user?.email,
          storeName: organization?.name,
        },
        description: `${tier === "STANDARD" ? "Standard" : "Custom"} plan, ${seats} user${seats === 1 ? "" : "s"}`,
      });

      await api.post("/billing/verify", handover);
      toast.success("Payment received. Your plan is active.");
      applied();
    } catch (err) {
      if (err?.dismissed) {
        toast.info("Payment cancelled. Nothing was charged.");
        setBusyTier(null);
        return;
      }

      /*
       * The money may already have left the customer's account: either Razorpay reported a
       * problem after authorization, or our own confirmation call never completed. Either way,
       * wait for the webhook before saying anything about failure.
       */
      const mayHavePaid = err?.unconfirmed || !err?.response;
      if (orderId && mayHavePaid) {
        setPendingOrder(orderId);
        setBusyTier(null);
        const outcome = await waitForWebhook(orderId);
        setPendingOrder(null);
        if (outcome === "PAID") {
          toast.success("Payment confirmed. Your plan is active.");
          applied();
        } else if (outcome === "FAILED") {
          setError(
            "That payment did not go through. Nothing was charged to your plan.",
          );
        } else {
          setError(
            "Your payment is still being confirmed by the bank. This usually settles within a few minutes — " +
              "reload this page to check. Do not pay again; if it does not clear, contact support with the " +
              `reference ${orderId}.`,
          );
        }
        return;
      }

      setError(errorMessage(err));
    } finally {
      setBusyTier(null);
    }
  };

  const status = STATUS_COPY[current?.status] ?? STATUS_COPY.EXPIRED;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1>Billing</h1>
            <p className="truncate text-desc text-slate-500">
              {organization?.name}
            </p>
          </div>
          <SyncPill onClick={openSync} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
        {subscription.loading && !current ? (
          <Spinner label="Loading your plan" />
        ) : null}
        {subscription.error ? (
          <ErrorState
            message={subscription.error}
            onRetry={subscription.refetch}
          />
        ) : null}

        {current ? (
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2>{current.planName}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-desc font-semibold ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>
                <p className="mt-1 text-desc text-slate-500">
                  {current.active
                    ? `${current.isTrial ? "Free until" : "Renews on"} ${current.renewsOn ? formatDateTime(current.renewsOn).split(",")[0] : "—"}, ${current.daysLeft} day${current.daysLeft === 1 ? "" : "s"} left`
                    : "Choose a plan below to carry on using the register."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-desc text-slate-500">Seats used</p>
                  <p className="font-semibold tabular">
                    {current.seatsUsed} / {current.seats}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-desc text-slate-500">Per user</p>
                  <p className="font-semibold tabular">
                    {formatMoney(current.pricePerUser, current.currency)}
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl bg-slate-50 px-3 py-2 sm:col-span-1">
                  <p className="text-desc text-slate-500">Billing</p>
                  <p className="font-semibold">
                    {current.interval === "YEARLY" ? "Yearly" : "Monthly"}
                  </p>
                </div>
              </div>
            </div>

            {!current.active ? (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-desc text-amber-800">
                <LuTriangleAlert className="mt-0.5 shrink-0" aria-hidden />
                New products, categories and staff accounts are paused until you
                pick a plan. Bills taken on a till still upload, and all your
                data is exactly where you left it.
              </p>
            ) : null}
            {current.seatsLeft === 0 && current.active ? (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-desc text-slate-600">
                <LuCircleCheck
                  className="mt-0.5 shrink-0 text-brand"
                  aria-hidden
                />
                Every seat on your plan is in use. Add seats below to invite
                more staff.
              </p>
            ) : null}
          </section>
        ) : null}

        {pendingOrder ? (
          <section className="rounded-3xl bg-amber-50 p-4 sm:p-5" role="status">
            <div className="flex items-start gap-3">
              <LuLoaderCircle
                className="mt-0.5 shrink-0 animate-spin text-amber-700"
                aria-hidden
              />
              <div className="min-w-0">
                <h2 className="text-amber-900">Confirming your payment</h2>
                <p className="mt-1 text-desc text-amber-800">
                  Your bank has the payment and we are waiting for confirmation.
                  This usually takes a few seconds. Please do not pay again or
                  close this page.
                </p>
                <p className="mt-1 text-desc text-amber-700 tabular">
                  Reference {pendingOrder}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {paymentsEnabled && paymentMode === "test" ? (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-desc text-slate-600">
            Razorpay is in <strong>test mode</strong>. Payments here use test
            cards and no real money moves. Swap in your live keys when you are
            ready to charge customers.
          </p>
        ) : null}

        {!paymentsEnabled && current ? (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-desc text-slate-600">
            Online payment is not switched on for this deployment yet. Add your
            Razorpay keys to the server environment (
            <span className="font-mono">RAZORPAY_KEY_ID</span> and{" "}
            <span className="font-mono">RAZORPAY_KEY_SECRET</span>) to accept
            payments here.
          </p>
        ) : null}

        <section>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2>Choose a plan</h2>
              <p className="text-desc text-slate-500">
                Priced per staff account. You pay only for active people.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <IntervalToggle interval={interval} onChange={setIntervalValue} />
              <SeatStepper
                seats={seats}
                onChange={setSeats}
                min={Math.max(1, current?.seatsUsed ?? 1)}
                label="Seats"
              />
            </div>
          </div>

          {error ? (
            <p
              className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-desc text-rose-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {(plans.data?.plans ?? []).map((plan) => (
              <PlanCard
                key={plan.tier}
                plan={plan}
                interval={interval}
                seats={seats}
                currency={current?.currency}
                highlight={plan.tier === "STANDARD"}
                currentLabel={
                  current?.plan === plan.tier && current?.interval === interval
                    ? "Current plan"
                    : null
                }
                busy={busyTier === plan.tier}
                cta={
                  paymentsEnabled
                    ? `Pay ${formatMoney(plan.intervals[interval].price * seats * (interval === "YEARLY" ? 12 : 1))}`
                    : "Payments not set up"
                }
                onSelect={paymentsEnabled && !pendingOrder ? pay : undefined}
              />
            ))}
          </div>
          <p className="mt-3 text-desc text-slate-500">
            Payments are handled by Razorpay. Prices exclude GST. Yearly plans
            are charged twelve months up front.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
          <h2>Payment history</h2>
          {payments.data?.payments?.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {payments.data.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <LuCreditCard
                    className="shrink-0 text-slate-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.plan === "CUSTOM" ? "Custom" : "Standard"}, {p.seats}{" "}
                      user{p.seats === 1 ? "" : "s"},{" "}
                      {p.interval === "YEARLY" ? "yearly" : "monthly"}
                    </p>
                    <p className="truncate text-desc text-slate-500">
                      {formatDateTime(p.paidAt ?? p.createdAt)} ·{" "}
                      {p.method ? `${p.method.toUpperCase()} · ` : ""}
                      {p.reference}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-semibold tabular">
                      {formatMoney(p.amount, p.currency)}
                    </span>
                    {p.amountRefunded > 0 ? (
                      <p className="text-desc text-amber-700 tabular">
                        {formatMoney(p.amountRefunded, p.currency)} refunded
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-desc font-medium ${
                      p.status === "PAID"
                        ? "bg-brand-50 text-brand-700"
                        : p.status === "FAILED"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.status === "PAID"
                      ? "Paid"
                      : p.status === "FAILED"
                        ? "Failed"
                        : "Started"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-desc text-slate-500">
              No payments yet. Your free trial does not need one.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
