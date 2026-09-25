import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { LuCircleCheck, LuCreditCard, LuTriangleAlert } from "react-icons/lu";
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

  const current = subscription.data?.subscription;
  const paymentsEnabled = subscription.data?.paymentsEnabled;

  useEffect(() => {
    if (current && !params.get("seats"))
      setSeats(Math.max(current.seatsUsed, current.seats || 3));
  }, [current, params]);

  const pay = async (tier) => {
    setError(null);
    setBusyTier(tier);
    try {
      const { data: order } = await api.post("/billing/checkout", {
        plan: tier,
        interval,
        seats,
      });
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
      subscription.refetch();
      payments.refetch();
      refreshSubscription();
    } catch (err) {
      if (err?.dismissed) toast.info("Payment cancelled. Nothing was charged.");
      else setError(errorMessage(err));
    } finally {
      setBusyTier(null);
    }
  };

  const status = STATUS_COPY[current?.status] ?? STATUS_COPY.EXPIRED;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-desc font-semibold italic text-[#FF7B29]">
              Your plan
            </p>
            <h1 className="truncate text-h1 font-extrabold tracking-tight text-gray-900">
              Billing
            </h1>
            <p className="truncate text-desc text-slate-500">
              {organization?.name}
            </p>
          </div>
          <SyncPill onClick={openSync} />
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
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
          <section className="rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-gray-900">
                    {current.planName}
                  </h2>
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
                <div className="rounded-lg bg-[#F8F4EE] px-3 py-2">
                  <p className="text-desc text-slate-500">Seats used</p>
                  <p className="font-extrabold text-gray-900 tabular">
                    {current.seatsUsed} / {current.seats}
                  </p>
                </div>
                <div className="rounded-lg bg-[#F8F4EE] px-3 py-2">
                  <p className="text-desc text-slate-500">Per user</p>
                  <p className="font-extrabold text-gray-900 tabular">
                    {formatMoney(current.pricePerUser, current.currency)}
                  </p>
                </div>
                <div className="col-span-2 rounded-lg bg-[#F8F4EE] px-3 py-2 sm:col-span-1">
                  <p className="text-desc text-slate-500">Billing</p>
                  <p className="font-extrabold text-gray-900">
                    {current.interval === "YEARLY" ? "Yearly" : "Monthly"}
                  </p>
                </div>
              </div>
            </div>

            {!current.active ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#FFF1E6] text-[#9A3F0B] p-3 text-desc">
                <LuTriangleAlert className="mt-0.5 shrink-0" aria-hidden />
                New products, categories and staff accounts are paused until you
                pick a plan. Bills taken on a till still upload, and all your
                data is exactly where you left it.
              </p>
            ) : null}
            {current.seatsLeft === 0 && current.active ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#F8F4EE] p-3 text-desc text-slate-600">
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

        {!paymentsEnabled && current ? (
          <p className="rounded-lg bg-white px-4 py-3 text-desc text-slate-600 ring-1 ring-black/5">
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
              <h2 className="font-extrabold text-gray-900">Choose a plan</h2>
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
                onSelect={paymentsEnabled ? pay : undefined}
              />
            ))}
          </div>
          <p className="mt-3 text-desc text-slate-500">
            Payments are handled by Razorpay. Prices exclude GST. Yearly plans
            are charged twelve months up front.
          </p>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 sm:p-5">
          <h2 className="font-extrabold text-gray-900">Payment history</h2>
          {payments.data?.payments?.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {payments.data.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
                    <LuCreditCard aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.plan === "CUSTOM" ? "Custom" : "Standard"}, {p.seats}{" "}
                      user{p.seats === 1 ? "" : "s"},{" "}
                      {p.interval === "YEARLY" ? "yearly" : "monthly"}
                    </p>
                    <p className="truncate text-desc text-slate-500">
                      {formatDateTime(p.createdAt)} · {p.reference}
                    </p>
                  </div>
                  <span className="font-extrabold text-[#FF7B29] tabular">
                    {formatMoney(p.amount, p.currency)}
                  </span>
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
