import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuCheck, LuGift, LuShoppingCart, LuStore } from "react-icons/lu";
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

  if (token) return <Navigate to="/app" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(form);
      const plan = params.get("plan");
      navigate(
        plan
          ? `/app/billing?plan=${plan}&interval=${params.get("interval") || "MONTHLY"}&seats=${params.get("seats") || 3}`
          : "/app",
        { replace: true },
      );
    } catch (err) {
      setError(errorMessage(err));
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
