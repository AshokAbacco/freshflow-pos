import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuCircleAlert, LuLoaderCircle, LuShieldCheck } from "react-icons/lu";
import { platformApi, platformErrorMessage } from "../../lib/platformApi.js";

/**
 * Where an invite or reset link lands.
 *
 * The Team page hands out links to `/platform/reset?token=…`, and until this existed they
 * went nowhere — the catch-all route bounced them to the store app. An invited colleague
 * would have had no way in at all.
 *
 * Styled like the sign-in page, on the dark panel background, because that is what the person
 * following the link has been told they are joining.
 */

export default function PlatformResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  // Mirrors the server rule, so the person is told before submitting.
  const strong =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password);

  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(
      () => navigate("/platform/login", { replace: true }),
      2500,
    );
    return () => clearTimeout(timer);
  }, [done, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!strong || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await platformApi.post(
        "/auth/reset",
        { token, password },
        { skipPlatformAuthRetry: true },
      );
      setDone(true);
    } catch (err) {
      setError(platformErrorMessage(err, "That link could not be used."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#0F1115] p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-ink"
            aria-hidden
          >
            <LuShieldCheck size={18} />
          </span>
          <div>
            <p className="text-body font-extrabold text-white">
              Platform admin
            </p>
            <p className="text-desc text-white/40">FreshFlow back office</p>
          </div>
        </div>

        {!token ? (
          <div className="mt-6 rounded-xl bg-white/5 p-4">
            <h1 className="text-h2 font-bold text-white">
              This link is incomplete
            </h1>
            <p className="mt-1.5 text-desc leading-5 text-white/50">
              It is missing its token. Ask whoever invited you for a fresh link
              — they expire, and each one works only once.
            </p>
            <Link
              to="/platform/login"
              className="mt-4 inline-block text-desc font-semibold text-brand-300 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : done ? (
          <div className="mt-6 rounded-xl bg-white/5 p-4">
            <h1 className="text-h2 font-bold text-white">Password set</h1>
            <p className="mt-1.5 text-desc leading-5 text-white/50">
              Taking you to sign in. Use your email address and the password you
              just chose.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 rounded-xl bg-white/5 p-4">
            <h1 className="text-h2 font-bold text-white">
              Choose your password
            </h1>
            <p className="mt-1.5 text-desc leading-5 text-white/50">
              This link works once. Nobody else has seen this password,
              including whoever invited you.
            </p>

            <label
              htmlFor="pw"
              className="mt-4 block text-desc font-semibold text-white/60"
            >
              New password
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-body text-white placeholder:text-white/25 focus:border-brand focus:outline-none"
            />

            <label
              htmlFor="pw2"
              className="mt-3 block text-desc font-semibold text-white/60"
            >
              Type it again
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={`mt-1 h-11 w-full rounded-lg border bg-white/5 px-3 text-body text-white placeholder:text-white/25 focus:outline-none ${
                confirm && confirm !== password
                  ? "border-rose-400"
                  : "border-white/10 focus:border-brand"
              }`}
            />

            <p className="mt-2 text-desc leading-4 text-white/40">
              {confirm && confirm !== password
                ? "The two passwords do not match."
                : "At least 12 characters, with a capital, a lower-case letter and a digit."}
            </p>

            {error ? (
              <p
                className="mt-3 flex gap-1.5 rounded-lg bg-rose-500/15 p-2.5 text-desc text-rose-200"
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

            <button
              type="submit"
              disabled={busy || !strong || password !== confirm}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-body font-bold text-ink transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {busy ? (
                <LuLoaderCircle
                  className="animate-spin"
                  size={16}
                  aria-hidden
                />
              ) : null}
              {busy ? "Setting it…" : "Set my password"}
            </button>

            <Link
              to="/platform/login"
              className="mt-3 block text-center text-desc font-semibold text-white/40 hover:text-white/70"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
