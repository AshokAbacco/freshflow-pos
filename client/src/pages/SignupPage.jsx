import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  LuArrowRight,
  LuCheck,
  LuGift,
  LuPackage,
  LuSettings,
  LuShoppingCart,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import {
  AuthError,
  AuthField,
  AuthSubmit,
  PasswordField,
} from "../components/auth/AuthLayout";
import { SiteHeader } from "../components/site/SiteHeader";
import { Eyebrow } from "../components/site/theme";
import { errorMessage } from "../lib/api";
import { BRAND } from "../lib/brand";
import { useAuthStore } from "../store/authStore";
import { useCatalogStore } from "../store/catalogStore";
import { toast } from "../store/toastStore";

// The setup screen after sign-up stays up at least this long, so it can be read.
const MIN_SETUP_SCREEN_MS = 3000;
// Never hold someone on the setup screen longer than this, even on a slow connection.
const MAX_SETUP_SCREEN_MS = 10000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Transparent PNG in /public, shown whole on the light left panel.
const SIGNUP_IMAGE = "/signup-img.png";

const PERKS = [
  "One month free, no card needed",
  "Your own products and categories",
  "Bills keep working without internet",
];

// Gentle float for the labels on the photo; switched off for people who prefer less motion.
const FLOAT_CSS = `
  @keyframes sb-signup-float {
    0%, 100% { transform: translateY(0) rotate(var(--tilt, 0deg)); }
    50% { transform: translateY(-10px) rotate(var(--tilt, 0deg)); }
  }
  .sb-signup-float { animation: sb-signup-float 5s ease-in-out infinite; transform: rotate(var(--tilt, 0deg)); }
  @media (prefers-reduced-motion: reduce) { .sb-signup-float { animation: none; } }
`;

export default function SignupPage() {
  const { token, signup } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    storeName: "",
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set once the store is created: first the setup screen, then the "your store is ready" screen.
  const [created, setCreated] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  // True from the moment this page submits a sign-up. The auth store saves the new token before
  // `signup()` returns, so without this the "already signed in" redirect below would fire in that
  // gap and skip the setup screen.
  const signingUp = useRef(false);

  const plan = params.get("plan");
  const nextPath = plan
    ? `/app/billing?plan=${plan}&interval=${params.get("interval") || "MONTHLY"}&seats=${params.get("seats") || 3}`
    : "/app";

  // Both are checked before the token redirect: signing up also signs in, and these screens must
  // stay up until the person chooses where to go.
  if (created && !setupDone)
    return (
      <AccountSetupScreen created={created} onDone={() => setSetupDone(true)} />
    );

  if (created)
    return (
      <SignupSuccess
        created={created}
        onContinue={(path) => navigate(path, { replace: true })}
        nextPath={nextPath}
        hasPlan={Boolean(plan)}
      />
    );

  // Someone who is already signed in and opens /signup goes to the app instead.
  if (token && !signingUp.current) return <Navigate to="/app" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    signingUp.current = true;
    try {
      const result = await signup({
        ...form,
        storeName: form.storeName.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      setCreated({
        storeName: form.storeName.trim(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        // Present when the auth store passes the server response through; optional.
        setup: result?.setup ?? null,
      });
      toast.success(
        result?.setup
          ? `Your account has been created. ${result.setup.products} products are ready in your store.`
          : "Your account has been created. Welcome aboard!",
      );
      window.scrollTo({ top: 0 });
    } catch (err) {
      signingUp.current = false;
      const message = errorMessage(err);
      setError(message);
      toast.error(`Could not create your account: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const valid =
    form.storeName.trim().length > 1 &&
    form.name.trim().length > 1 &&
    form.email.includes("@") &&
    form.password.length >= 8;

  return (
    // Laptops and up: one screen tall; the form side scrolls on its own if a screen is short.
    // Phones scroll normally.
    <div className="flex min-h-[100dvh] flex-col bg-white lg:h-[100dvh]">
      <SiteHeader />

      <main className="grid flex-1 lg:min-h-0 lg:grid-cols-2">
        {/* ================= Photo side ================= */}
        <section className="relative flex h-56 flex-col overflow-hidden bg-[#F7F2EC] sm:h-72 lg:h-auto lg:min-h-0">
          <div className="hidden px-12 pt-10 lg:block xl:px-16">
            <p className="font-serif text-base italic text-[#FF7B29]">
              Open your store today
            </p>
            <h2 className="mt-1 max-w-lg text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 xl:text-5xl">
              Set up your store in a minute.
            </h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {PERKS.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-black/5"
                >
                  <LuCheck className="text-[#4CAF50]" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-h-0 flex-1">
            <style>{FLOAT_CSS}</style>
            {/* Floating labels beside the person */}
            <div
              className="sb-signup-float absolute bottom-[52%] left-[7%] z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-[0_22px_40px_-16px_rgba(0,0,0,0.4)] ring-1 ring-black/5 backdrop-blur lg:flex"
              style={{ "--tilt": "-4deg" }}
              aria-hidden
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#4CAF50] text-white">
                <LuStore size={18} />
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] font-medium text-gray-500">
                  Store created
                </span>
                <span className="block text-sm font-extrabold text-gray-900">
                  Ready to bill
                </span>
              </span>
            </div>
            <div
              className="sb-signup-float absolute bottom-[34%] right-[7%] z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-[0_22px_40px_-16px_rgba(0,0,0,0.4)] ring-1 ring-black/5 backdrop-blur lg:flex"
              style={{ "--tilt": "4deg", animationDelay: "-2.5s" }}
              aria-hidden
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FFF1E6] text-[#FF7B29]">
                <LuGift size={18} />
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] font-medium text-gray-500">
                  Free trial
                </span>
                <span className="block text-sm font-extrabold text-gray-900">
                  30 days, no card
                </span>
              </span>
            </div>

            <img
              src={SIGNUP_IMAGE}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain object-bottom"
            />
          </div>

          {/*
            A 3D shop counter in front of the photo: a counter-top seen slightly from above, and a green
            front panel with the brand on it. It covers the bottom edge of the image so it never shows.
            On phones the form sheet overlaps this edge instead.
          */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden flex-col items-center lg:flex"
            aria-hidden
          >
            <div
              className="h-14 w-[84%] rounded-t-2xl border-b-[3px] border-[#D8CCB6] bg-gradient-to-b from-[#FFFDF8] to-[#EFE7DA] ring-1 ring-black/5"
              style={{
                transform: "perspective(500px) rotateX(50deg)",
                transformOrigin: "bottom",
              }}
            />
            <div className="relative -mt-px flex h-24 w-[84%] items-center justify-center gap-3 overflow-hidden border-t-4 border-[#FF7B29] bg-gradient-to-b from-[#4CAF50] to-[#2E7D32] xl:h-28">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 64px)",
                }}
              />
              <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white/15 to-transparent" />
              <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-[#2E7D32] shadow-md">
                <LuShoppingCart size={18} />
              </span>
              <span className="relative leading-tight text-white">
                <span className="block text-lg font-extrabold tracking-tight">
                  Your counter, ready today
                </span>
                <span className="block text-xs font-medium text-white/75">
                  {BRAND.name} by {BRAND.company}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ================= Form side ================= */}
        {/* On phones the form slides up over the bottom of the photo, like an app sheet. */}
        <section className="relative -mt-6 flex justify-center rounded-t-3xl bg-white px-5 py-8 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.25)] sm:px-10 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:rounded-none lg:px-16 lg:py-6 lg:shadow-none">
          <div className="my-auto w-full max-w-md">
            <Eyebrow>One month free</Eyebrow>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Create your store
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              No card needed. Cancel by simply not paying.
            </p>

            {/* Perks as a compact list on phones, where the left-side text is hidden */}
            <ul className="mt-4 space-y-1.5 lg:hidden">
              {PERKS.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#E8F5E9] text-[#4CAF50]">
                    <LuCheck size={12} aria-hidden />
                  </span>
                  {p}
                </li>
              ))}
            </ul>

            <form
              onSubmit={submit}
              noValidate
              className="mt-6 space-y-4 lg:mt-5"
            >
              <AuthField
                id="storeName"
                label="Store name"
                value={form.storeName}
                onChange={set("storeName")}
                placeholder="Sharma Super Market"
                autoComplete="organization"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <AuthField
                  id="name"
                  label="Your name"
                  value={form.name}
                  onChange={set("name")}
                  autoComplete="name"
                  placeholder="Priya Sharma"
                />
                <AuthField
                  id="phone"
                  label="Mobile (optional)"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                  placeholder="98765 43210"
                />
              </div>
              <AuthField
                id="email"
                label="Email address"
                type="email"
                inputMode="email"
                value={form.email}
                onChange={set("email")}
                autoComplete="username"
                placeholder="you@store.com"
              />
              <PasswordField
                value={form.password}
                onChange={set("password")}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />

              <AuthError>{error}</AuthError>

              <AuthSubmit
                disabled={!valid || loading}
                loading={loading}
                loadingLabel="Creating store..."
              >
                Create store
              </AuthSubmit>
            </form>

            <p className="mt-5 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-bold text-[#FF7B29] hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

/* =========================================================
   Account setup screen
   Shown for at least 3 seconds right after the account is
   created. While it is up, the new store's products are
   loaded so the counter opens ready to bill.
   ========================================================= */
const SETUP_CSS = `
  @keyframes sb-setup-spin { to { transform: rotate(360deg); } }
  @keyframes sb-setup-progress { from { width: 4%; } to { width: 100%; } }
  @keyframes sb-setup-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  .sb-setup-spin { animation: sb-setup-spin 0.9s linear infinite; }
  .sb-setup-progress { animation: sb-setup-progress ${MIN_SETUP_SCREEN_MS}ms ease-out forwards; }
  .sb-setup-pulse { animation: sb-setup-pulse 1.2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .sb-setup-spin, .sb-setup-pulse { animation: none; }
    .sb-setup-progress { animation-duration: 1ms; }
  }
`;

function AccountSetupScreen({ created, onDone }) {
  const { storeName, name, setup } = created;
  const steps = [
    "Creating your account",
    setup
      ? `Adding ${setup.products} products in ${setup.categories} categories`
      : "Adding your starter products and categories",
    `Starting your ${setup?.trialDays ?? 30}-day free trial`,
    "Preparing your billing counter",
  ];

  // Index of the step in progress; every step before it shows as done. Step 0 is already done.
  const [active, setActive] = useState(1);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const remaining = steps.length - 1;
    const timer = setInterval(
      () => setActive((a) => Math.min(a + 1, steps.length - 1)),
      MIN_SETUP_SCREEN_MS / remaining,
    );

    // Wait for both: the minimum display time, and the store's products loading
    // (capped, so a slow network never traps anyone here).
    Promise.all([
      sleep(MIN_SETUP_SCREEN_MS),
      Promise.race([
        Promise.resolve(
          useCatalogStore.getState().load({ silent: true }),
        ).catch(() => {}),
        sleep(MAX_SETUP_SCREEN_MS),
      ]),
    ]).then(() => {
      if (cancelled) return;
      clearInterval(timer);
      setActive(steps.length); // all done
      setTimeout(() => !cancelled && onDoneRef.current(), 500);
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Runs once per mount; steps.length is fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = active >= steps.length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F7F2EC]">
      <style>{SETUP_CSS}</style>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div
          role="status"
          aria-live="polite"
          aria-busy={!allDone}
          className="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-[0_22px_40px_-24px_rgba(0,0,0,0.35)] ring-1 ring-black/5 sm:p-8"
        >
          <span className="relative mx-auto grid h-16 w-16 place-items-center">
            {allDone ? (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#4CAF50] text-white shadow-md">
                <LuCheck size={30} aria-hidden />
              </span>
            ) : (
              <>
                <span
                  className="sb-setup-spin absolute inset-0 rounded-full border-4 border-[#FFE3CF] border-t-[#FF7B29]"
                  aria-hidden
                />
                <LuStore size={24} className="text-[#FF7B29]" aria-hidden />
              </>
            )}
          </span>

          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Your new account has been created successfully!
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 sm:text-base">
            {allDone
              ? `All set, ${name}. ${storeName} is ready.`
              : `Please wait a moment, ${name}. We're setting up ${storeName} for you. This only takes a few seconds.`}
          </p>

          <div
            className="mt-6 h-2 overflow-hidden rounded-full bg-[#FFF1E6]"
            aria-hidden
          >
            <div className="sb-setup-progress h-full rounded-full bg-gradient-to-r from-[#FF7B29] to-[#4CAF50]" />
          </div>

          <ul className="mt-6 space-y-2.5 text-left">
            {steps.map((label, i) => {
              const done = i < active;
              const current = i === active;
              return (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      done
                        ? "bg-[#4CAF50] text-white"
                        : current
                          ? "border-2 border-[#FF7B29]"
                          : "border-2 border-gray-200"
                    }`}
                  >
                    {done ? (
                      <LuCheck size={14} aria-hidden />
                    ) : current ? (
                      <span className="sb-setup-pulse h-2 w-2 rounded-full bg-[#FF7B29]" />
                    ) : null}
                  </span>
                  <span
                    className={
                      done
                        ? "font-semibold text-gray-900"
                        : current
                          ? "font-semibold text-[#FF7B29]"
                          : "text-gray-400"
                    }
                  >
                    {label}
                    {current && "…"}
                    <span className="sr-only">
                      {done
                        ? " (done)"
                        : current
                          ? " (in progress)"
                          : " (waiting)"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-xs text-gray-400">
            Please don't close or refresh this page.
          </p>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   Sign-up success
   Shown right after the store is created: confirms what was
   set up and tells the owner what to do first.
   ========================================================= */
function SignupSuccess({ created, onContinue, nextPath, hasPlan }) {
  const { storeName, name, email, setup } = created;
  const trialDays = setup?.trialDays ?? 30;
  const trialEnds = new Date(
    Date.now() + trialDays * 86_400_000,
  ).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const catalogLine = setup
    ? `${setup.products} ready-made products in ${setup.categories} categories`
    : "Ready-made products and categories";

  const done = [
    {
      icon: LuStore,
      title: `${storeName} is set up`,
      text: `You are the store admin. Sign in any time with ${email}.`,
    },
    {
      icon: LuPackage,
      title: catalogLine,
      text: "Fruits, vegetables, dairy, staples, snacks and stationery, with prices you can change.",
    },
    {
      icon: LuGift,
      title: `${trialDays}-day free trial started`,
      text: `Free until ${trialEnds}. No card needed.`,
    },
  ];

  const next = [
    {
      icon: LuPackage,
      title: "Add your stock",
      text: "Every product starts at 0 in stock. Open Inventory, set the quantities you have, and edit or remove items you don't sell.",
      path: "/app/inventory",
    },
    {
      icon: LuSettings,
      title: "Fill in your store details",
      text: "Add your GSTIN, address and UPI ID in Settings so they print on bills and the UPI QR works.",
      path: "/app/settings",
    },
    {
      icon: LuUsers,
      title: "Add your cashiers",
      text: "Create a login for each person who will bill at the counter.",
      path: "/app/settings",
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F7F2EC]">
      <SiteHeader />
      <main className="flex flex-1 justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-2xl">
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-white p-6 shadow-[0_22px_40px_-24px_rgba(0,0,0,0.35)] ring-1 ring-black/5 sm:p-8"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#4CAF50] text-white shadow-md">
              <LuCheck size={28} aria-hidden />
            </span>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Your account has been created
            </h1>
            <p className="mt-2 text-base leading-7 text-gray-600">
              Welcome, {name}! {storeName} is ready on {BRAND.name}, and you are
              signed in.
            </p>

            <ul className="mt-6 space-y-3">
              {done.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-xl bg-[#E8F5E9]/60 p-3.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#2E7D32] ring-1 ring-[#4CAF50]/20">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="text-sm">
                    <span className="block font-bold text-gray-900">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-gray-600">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <h2 className="mt-8 text-lg font-extrabold text-gray-900">
              Before your first bill
            </h2>
            <ol className="mt-3 space-y-2">
              {next.map(({ icon: Icon, title, text, path }, i) => (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => onContinue(path)}
                    className="flex w-full items-start gap-3 rounded-xl border border-gray-200 p-3.5 text-left transition hover:border-[#FF7B29] hover:bg-[#FFF1E6]/50"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-xs font-extrabold text-[#FF7B29]">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="flex items-center gap-1.5 font-bold text-gray-900">
                        <Icon size={15} aria-hidden /> {title}
                      </span>
                      <span className="mt-0.5 block text-gray-600">{text}</span>
                    </span>
                    <LuArrowRight
                      className="mt-1 shrink-0 text-gray-400"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onContinue(nextPath)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-[#FF7B29] text-sm font-bold text-white transition hover:bg-[#e96a1b]"
              >
                {hasPlan ? "Continue to choose your plan" : "Go to my counter"}
                <LuArrowRight aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onContinue("/app/inventory")}
                className="flex h-12 flex-1 items-center justify-center rounded-md border-2 border-[#FF7B29] text-sm font-bold text-[#FF7B29] transition hover:bg-[#FF7B29] hover:text-white"
              >
                Add stock first
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
