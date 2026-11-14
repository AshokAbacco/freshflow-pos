import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  LuEye,
  LuEyeOff,
  LuLoaderCircle,
  LuLock,
  LuTriangleAlert,
} from "react-icons/lu";
import { platformErrorMessage } from "../../lib/platformApi.js";
import { usePlatformAuthStore } from "../../store/platformAuthStore.js";

/**
 * Sign-in for platform staff.
 *
 * Deliberately sober and dark, with none of the store app's photography or marketing copy.
 * That is not decoration: someone who lands here should be able to tell at a glance that this
 * is the company's back office and not a shop's till, because the two have very different
 * consequences for getting something wrong.
 */
export default function PlatformLoginPage() {
  const { admin, restoring, sessionMessage, signIn, restore } =
    usePlatformAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Platform sign-in";
  }, []);

  /*
   * Someone arriving here with a live refresh cookie should be sent straight into the panel
   * rather than asked to type their password again, so this page starts the restore too.
   * restore() is single-flight, so this does not duplicate the guard's call.
   */
  useEffect(() => {
    if (restoring) restore();
  }, [restoring, restore]);

  // Wait for the refresh attempt before deciding anything, or a reload would bounce a
  // perfectly good session back to this page.
  if (restoring) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#0F1115]">
        <LuLoaderCircle
          className="animate-spin text-white/40"
          size={28}
          aria-hidden
        />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (admin) return <Navigate to="/platform" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate("/platform", { replace: true });
    } catch (err) {
      setError(platformErrorMessage(err, "Could not sign you in. Try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0F1115] text-white">
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-ink"
              aria-hidden
            >
              <LuLock size={18} />
            </span>
            <div>
              <h1 className="text-h2 font-extrabold tracking-tight text-white">
                Platform admin
              </h1>
              <p className="text-desc text-white/50">FreshFlow back office</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="platform-email"
                className="mb-1.5 block text-desc font-semibold text-white/70"
              >
                Work email
              </label>
              <input
                id="platform-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoFocus
                className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 text-body text-white placeholder:text-white/30 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
                placeholder="you@abaccotech.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="platform-password"
                className="mb-1.5 block text-desc font-semibold text-white/70"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="platform-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 pr-11 text-body text-white placeholder:text-white/30 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white/80"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <LuEyeOff size={16} aria-hidden />
                  ) : (
                    <LuEye size={16} aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {error || sessionMessage ? (
              <p
                className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2.5 text-desc text-rose-300"
                role="alert"
              >
                <LuTriangleAlert
                  className="mt-0.5 shrink-0"
                  size={14}
                  aria-hidden
                />
                {error || sessionMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!email || !password || loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-body font-bold text-ink transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {loading ? (
                <LuLoaderCircle
                  className="animate-spin"
                  size={16}
                  aria-hidden
                />
              ) : null}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-desc leading-5 text-white/40">
            This is the software company’s back office, not a store login. If
            you run a shop, sign in at{" "}
            <a
              href="/login"
              className="font-semibold text-white/70 underline hover:text-white"
            >
              the store sign-in
            </a>{" "}
            instead.
          </p>

          <p className="mt-4 rounded-lg border border-white/10 px-3 py-2.5 text-desc leading-5 text-white/40">
            No account yet? A super admin creates one from the server with{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">
              npm run admin:set
            </code>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
