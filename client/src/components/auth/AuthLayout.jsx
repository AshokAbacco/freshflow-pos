import { useState } from "react";
import { LuEye, LuEyeOff, LuLeaf } from "react-icons/lu";
import { BRAND } from "../../lib/brand";
import { SITE_IMAGES } from "../../lib/siteImages";
import { SiteHeader } from "../site/SiteHeader";
import { Photo, SITE_STYLES } from "../site/theme";

/**
 * Two-panel auth screen: photo with a green wash and the message on the left, form on the right.
 * The site nav bar sits on top so people can get back to Home, Pricing, etc.
 */
export function AuthLayout({
  heading,
  message,
  footnote,
  image = SITE_IMAGES.heroMain,
  children,
}) {
  return (
    <div className="sb-paper flex min-h-[100dvh] flex-col">
      <style>{SITE_STYLES}</style>
      <SiteHeader />

      <div className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8 sm:py-14">
        <LuLeaf
          className="absolute left-4 top-6 text-[#FF7B29]/15"
          size={110}
          aria-hidden
        />
        <LuLeaf
          className="absolute bottom-6 right-4 rotate-180 text-[#4CAF50]/15"
          size={130}
          aria-hidden
        />

        <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] md:grid-cols-[0.9fr_1.1fr]">
          {/* ---------- Photo panel ---------- */}
          <div className="relative min-h-[300px] overflow-hidden md:min-h-[640px]">
            <Photo
              src={image}
              alt=""
              eager
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#1B5E20] via-[#2E7D32]/85 to-[#4CAF50]/55"
              aria-hidden
            />
            <div
              className="sb-splash absolute -right-16 -top-16 h-48 w-48 bg-[#FF7B29]/90"
              aria-hidden
            />

            <div className="relative flex h-full flex-col justify-end p-8 text-white sm:p-10">
              <span className="mb-auto inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                <LuLeaf aria-hidden /> {BRAND.fullName}
              </span>
              <h2 className="mt-10 text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
                {heading}
              </h2>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/85">
                {message}
              </p>
              {footnote ? (
                <div className="mt-6 rounded-lg bg-black/20 p-4 text-sm text-white/85 backdrop-blur">
                  {footnote}
                </div>
              ) : null}
            </div>
          </div>

          {/* ---------- Form panel ---------- */}
          <div className="flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-14">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-gray-200 bg-[#FBFAF8] px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-[#4CAF50] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/20";

export function AuthField({ id, label, ...props }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[13px] font-bold text-gray-800"
      >
        {label}
      </label>
      <input id={id} className={INPUT} {...props} />
    </div>
  );
}

export function PasswordField({
  id = "password",
  label = "Password",
  ...props
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[13px] font-bold text-gray-800"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          className={`${INPUT} pr-12`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-1.5 my-auto grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:text-gray-700"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <LuEyeOff aria-hidden /> : <LuEye aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export function AuthSubmit({ loading, loadingLabel, children, ...props }) {
  return (
    <button
      type="submit"
      className="flex h-12 w-full items-center justify-center rounded-md bg-[#4CAF50] text-sm font-bold text-white shadow-lg shadow-[#4CAF50]/25 transition hover:bg-[#43a047] disabled:opacity-50 disabled:shadow-none"
      {...props}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

export function AuthError({ children }) {
  if (!children) return null;
  return (
    <div
      className="rounded-md border border-rose-100 bg-rose-50 p-3 text-sm text-rose-600"
      role="alert"
    >
      {children}
    </div>
  );
}
