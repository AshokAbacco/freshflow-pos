import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LuArrowRight, LuMail, LuMapPin, LuMenu, LuX } from "react-icons/lu";
import { BRAND } from "../../lib/brand";
import { useAuthStore } from "../../store/authStore";
import { BrandMark } from "./BrandMark";

export const SITE_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/features", label: "Features" },
  { to: "/services", label: "Services" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
];

export const SUPPORT_EMAIL = `support@${BRAND.domain}`;
export const LOCATION = "Bengaluru, Karnataka, India";

const DARK_BTN =
  "inline-flex h-10 items-center justify-center rounded-md bg-[#222] px-5 text-sm font-semibold text-white transition hover:bg-black";

export function SiteHeader() {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      {/* Contact bar */}
      <div className="hidden border-b border-gray-100 bg-[#FDF9F3] md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-1.5 text-xs font-medium text-gray-500">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-1.5 hover:text-[#4CAF50]"
          >
            <LuMail className="text-[#4CAF50]" aria-hidden /> {SUPPORT_EMAIL}
          </a>
          <span className="inline-flex items-center gap-1.5">
            <LuMapPin className="text-[#4CAF50]" aria-hidden /> {LOCATION}
          </span>
          {!token ? (
            <Link
              to="/signup"
              className="ml-auto inline-flex items-center gap-1 font-semibold text-[#FF7B29] hover:underline"
            >
              One month free, no card needed <LuArrowRight aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <nav
        className="mx-auto flex h-16 max-w-7xl items-stretch gap-4 pr-4 sm:pr-6 md:h-[72px] lg:pl-6"
        aria-label="Site"
      >
        <BrandMark variant="block" />

        <ul className="ml-auto hidden items-center gap-7 lg:flex">
          {SITE_LINKS.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative py-2 text-[15px] font-bold transition-colors ${
                    isActive
                      ? "text-[#4CAF50]"
                      : "text-gray-800 hover:text-[#4CAF50]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {label}
                    <span
                      className={`absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#FF7B29] transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden
                    />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-4 lg:ml-6">
          <div className="hidden items-center gap-4 sm:flex">
            {token ? (
              <Link to="/app" className={DARK_BTN}>
                Open register
              </Link>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="text-sm font-bold text-gray-800 hover:text-[#4CAF50]"
                >
                  Sign in
                </NavLink>
                <Link to="/signup" className={DARK_BTN}>
                  Start free
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full text-gray-800 hover:bg-gray-100 lg:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <LuX size={22} aria-hidden />
            ) : (
              <LuMenu size={22} aria-hidden />
            )}
          </button>
        </div>
      </nav>

      {/* Phone / tablet menu */}
      <div
        id="site-menu"
        className={`absolute inset-x-0 top-full overflow-hidden border-b border-gray-100 bg-white transition-all duration-300 lg:hidden ${
          open
            ? "max-h-[520px] opacity-100 shadow-xl"
            : "pointer-events-none max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-6 pt-3 sm:px-6">
          <ul className="flex flex-col gap-1">
            {SITE_LINKS.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `block rounded-md px-4 py-3 text-base font-bold ${
                      isActive
                        ? "bg-[#FDF9F3] text-[#4CAF50]"
                        : "text-gray-800 hover:bg-gray-50"
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:hidden">
            {token ? (
              <Link to="/app" className={`${DARK_BTN} col-span-2`}>
                Open register
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 text-sm font-semibold text-gray-900"
                >
                  Sign in
                </Link>
                <Link to="/signup" className={DARK_BTN}>
                  Start free
                </Link>
              </>
            )}
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-4 flex items-center gap-2 px-1 text-sm text-gray-500"
          >
            <LuMail className="text-[#4CAF50]" aria-hidden /> {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </header>
  );
}
