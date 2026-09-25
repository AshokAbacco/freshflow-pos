import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LuCheck, LuKeyRound, LuShoppingCart, LuWifiOff } from "react-icons/lu";
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
const LOGIN_IMAGE = "/login-img.png";

// Gentle float for the labels on the photo; switched off for people who prefer less motion.
const FLOAT_CSS = `
  @keyframes sb-login-float {
    0%, 100% { transform: translateY(0) rotate(var(--tilt, 0deg)); }
    50% { transform: translateY(-10px) rotate(var(--tilt, 0deg)); }
  }
  .sb-login-float { animation: sb-login-float 5s ease-in-out infinite; transform: rotate(var(--tilt, 0deg)); }
  @media (prefers-reduced-motion: reduce) { .sb-login-float { animation: none; } }
`;

const HIGHLIGHTS = [
  "Keeps billing offline",
  "UPI QR for the exact amount",
  "Today's sales at a glance",
];

export default function LoginPage() {
  const { token, login, sessionMessage } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // "/" is now the public home page, so signed-in users go to the register instead.
  if (token) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      const from = location.state?.from;
      navigate(user.role === "ADMIN" && from ? from : "/app", {
        replace: true,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Laptops and up: exactly one screen tall, nothing to scroll. Phones scroll normally.
    <div className="flex min-h-[100dvh] flex-col bg-white lg:h-[100dvh]">
      <SiteHeader />

      <main className="grid flex-1 lg:min-h-0 lg:grid-cols-2">
        {/* ================= Photo side ================= */}
        {/*
          The photo is a transparent PNG, so it sits on a plain light panel and is shown whole
          (object-contain), standing on the bottom edge.
        */}
        <section className="relative flex h-56 flex-col overflow-hidden bg-[#F7F2EC] sm:h-72 lg:h-auto lg:min-h-0">
          <div className="hidden px-12 pt-10 lg:block xl:px-16">
            <p className="font-serif text-base italic text-[#FF7B29]">
              Good to see you again
            </p>
            <h2 className="mt-1 max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 xl:text-5xl">
              Welcome back to your counter.
            </h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {HIGHLIGHTS.map((h) => (
                <li
                  key={h}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-black/5"
                >
                  <LuCheck className="text-[#4CAF50]" aria-hidden /> {h}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-h-0 flex-1">
            <style>{FLOAT_CSS}</style>
            {/* Floating labels beside the person (illustrative figures) */}
            <div
              className="sb-login-float absolute bottom-[52%] left-[7%] z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-[0_22px_40px_-16px_rgba(0,0,0,0.4)] ring-1 ring-black/5 backdrop-blur lg:flex"
              style={{ "--tilt": "-4deg" }}
              aria-hidden
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#4CAF50] text-white">
                <LuCheck size={18} />
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] font-medium text-gray-500">
                  Paid by UPI
                </span>
                <span className="block text-base font-extrabold text-gray-900">
                  ₹754.00
                </span>
              </span>
            </div>
            <div
              className="sb-login-float absolute bottom-[34%] right-[7%] z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-[0_22px_40px_-16px_rgba(0,0,0,0.4)] ring-1 ring-black/5 backdrop-blur lg:flex"
              style={{ "--tilt": "4deg", animationDelay: "-2.5s" }}
              aria-hidden
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FFF1E6] text-[#FF7B29]">
                <LuWifiOff size={18} />
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] font-medium text-gray-500">
                  Internet down
                </span>
                <span className="block text-sm font-extrabold text-gray-900">
                  Still billing
                </span>
              </span>
            </div>
            <img
              src={LOGIN_IMAGE}
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
              {/* Panel grooves and a light sweep give the front some depth */}
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
                  {BRAND.name}
                </span>
                <span className="block text-xs font-medium text-white/75">
                  Billing counter by {BRAND.company}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ================= Form side ================= */}
        {/* On phones the form slides up over the bottom of the photo, like an app sheet. */}
        <section className="relative -mt-6 flex justify-center rounded-t-3xl bg-white px-5 py-8 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.25)] sm:px-10 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:rounded-none lg:px-16 lg:py-6 lg:shadow-none">
          <div className="my-auto w-full max-w-md">
            <Eyebrow>Welcome back</Eyebrow>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Sign in to your account
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Use the email and password your store admin gave you.
            </p>

            <form
              onSubmit={submit}
              noValidate
              className="mt-7 space-y-4 lg:mt-6"
            >
              <AuthField
                id="email"
                label="Email address"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@store.com"
              />
              <PasswordField
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />

              <AuthError>{error || sessionMessage}</AuthError>

              <AuthSubmit
                disabled={!email || !password || loading}
                loading={loading}
                loadingLabel="Signing in..."
              >
                Sign in
              </AuthSubmit>
            </form>

            <div className="mt-5 flex items-start gap-3 rounded-lg border border-dashed border-gray-200 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-[#FF7B29]">
                <LuKeyRound aria-hidden />
              </span>
              <div className="text-sm">
                <p className="font-bold text-gray-900">Forgot your password?</p>
                <p className="mt-0.5 text-gray-500">
                  Ask your store admin to reset it for you.
                </p>
              </div>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs font-medium text-gray-400 lg:my-5">
              <span className="h-px flex-1 bg-gray-200" aria-hidden />
              New to {BRAND.name}?
              <span className="h-px flex-1 bg-gray-200" aria-hidden />
            </div>

            <Link
              to="/signup"
              className="flex h-12 w-full items-center justify-center rounded-md border-2 border-[#FF7B29] text-sm font-bold text-[#FF7B29] transition hover:bg-[#FF7B29] hover:text-white"
            >
              Start your free month
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
