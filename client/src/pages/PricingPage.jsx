import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuArrowRight, LuCheck, LuPlus } from "react-icons/lu";
import {
  IntervalToggle,
  PlanCard,
  SeatStepper,
} from "../components/pricing/PricingPlans";
import { CtaBand, PageIntro, SiteLayout } from "../components/site/SiteFooter";
import { CARD, Eyebrow, Photo } from "../components/site/theme";
import { ErrorState, Spinner } from "../components/ui/States";
import { useApiQuery } from "../hooks/useApiQuery";
import { SITE_IMAGES } from "../lib/siteImages";
import { useAuthStore } from "../store/authStore";

const FAQ = [
  [
    "What counts as a user?",
    "Every staff account that can sign in: each cashier and each admin. You can deactivate someone to free their seat at any time.",
  ],
  [
    "What happens after the free month?",
    "Billing pauses until you choose a plan. Your data stays put, and bills already taken on a till still upload.",
  ],
  [
    "Can I change plans later?",
    "Yes. Pick a new plan or seat count in Billing and pay the difference from that point.",
  ],
  [
    "How do I pay?",
    "Through Razorpay: UPI, cards, net banking and wallets. Payment is verified before your plan changes.",
  ],
];

export default function PricingPage() {
  const { data, loading, error, refetch } = useApiQuery("/public/plans", null);
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const [interval, setIntervalValue] = useState("MONTHLY");
  const [seats, setSeats] = useState(3);

  const choose = (tier) => {
    if (token && isAdmin)
      navigate(`/app/billing?plan=${tier}&interval=${interval}&seats=${seats}`);
    else navigate(`/signup?plan=${tier}&interval=${interval}&seats=${seats}`);
  };

  return (
    <SiteLayout>
      <PageIntro
        crumb="Pricing"
        eyebrow="Simple plans"
        title="Pay for the People at the Counter"
      >
        Every plan starts with one month free. After that you pay per staff
        account, and only for the ones you keep active.
      </PageIntro>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Controls sit on a card that overlaps the banner */}
        <div
          data-reveal
          className={`sb-reveal relative z-10 -mt-8 flex flex-col items-center justify-center gap-4 p-4 sm:flex-row sm:gap-8 ${CARD}`}
        >
          <IntervalToggle interval={interval} onChange={setIntervalValue} />
          <span className="hidden h-8 w-px bg-gray-200 sm:block" aria-hidden />
          <SeatStepper seats={seats} onChange={setSeats} />
        </div>

        {loading && !data ? <Spinner label="Loading plans" /> : null}
        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        {data ? (
          <>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {/* Free trial, styled like the dark promo cards on the home page */}
              <div className="relative flex flex-col overflow-hidden rounded-xl bg-[#111] p-7 text-white shadow-xl">
                <Photo
                  src={SITE_IMAGES.tomatoes}
                  alt=""
                  className="absolute -right-14 -top-14 h-36 w-36 rounded-full object-cover opacity-60"
                />
                <div className="relative pr-14">
                  <Eyebrow light>Start here</Eyebrow>
                  <h2 className="mt-2 text-2xl font-extrabold">Free Trial</h2>
                  <p className="mt-1 text-sm text-white/60">
                    The whole thing, on your counter, for a month.
                  </p>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-5xl font-extrabold tabular-nums text-[#FF7B29]">
                      ₹0
                    </span>
                    <span className="pb-1.5 text-sm text-white/60">
                      for {data.trial.days} days
                    </span>
                  </div>
                </div>
                <ul className="relative mt-6 flex-1 space-y-2.5 text-sm text-white/85">
                  {[
                    `Up to ${data.trial.seats} staff accounts`,
                    "Every register feature, no limits on bills",
                    "Reports, stock and offline selling included",
                    "No card needed to start",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <LuCheck
                        className="mt-0.5 shrink-0 text-[#4CAF50]"
                        aria-hidden
                      />
                      {t}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate("/signup")}
                  className="relative mt-7 inline-flex h-12 items-center justify-center gap-1.5 rounded bg-[#FF7B29] text-sm font-bold hover:bg-[#f06a17]"
                >
                  Start free <LuArrowRight aria-hidden />
                </button>
              </div>

              {data.plans.map((plan) => (
                <PlanCard
                  key={plan.tier}
                  plan={plan}
                  interval={interval}
                  seats={seats}
                  highlight={plan.tier === "STANDARD"}
                  cta={
                    token && isAdmin
                      ? `Choose ${plan.name}`
                      : "Start free, then pay"
                  }
                  onSelect={choose}
                />
              ))}
            </div>

            <p className="mt-5 text-center text-xs text-gray-500">
              Prices are per user per month in Indian rupees, excluding GST.
              Yearly plans are charged twelve months up front.
            </p>
          </>
        ) : null}
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-20 grid max-w-6xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div data-reveal className="sb-reveal">
          <Eyebrow>Good to know</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Questions People Ask
          </h2>
          <div className="relative mt-8 hidden aspect-square w-64 lg:block">
            <div
              className="sb-splash absolute inset-0 bg-[#4CAF50]"
              aria-hidden
            />
            <div className="absolute inset-[9%] overflow-hidden rounded-full border-8 border-white shadow-xl">
              <Photo
                src={SITE_IMAGES.heroAlt}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {FAQ.map(([q, a], i) => (
            <details
              key={q}
              data-reveal
              className={`sb-reveal group p-5 open:ring-[#4CAF50]/40 ${CARD}`}
              style={{ "--d": `${i * 80}ms` }}
              open={i === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
                {q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E8F5E9] text-[#4CAF50] transition group-open:rotate-45 group-open:bg-[#4CAF50] group-open:text-white">
                  <LuPlus aria-hidden />
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-gray-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand />
    </SiteLayout>
  );
}
