import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LuChartColumn,
  LuCreditCard,
  LuEllipsis,
  LuLeaf,
  LuLogOut,
  LuPackage,
  LuScanBarcode,
  LuSettings,
} from "react-icons/lu";
import { useAuthStore } from "../../store/authStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/States";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { SyncCenter, useSyncSummary } from "./SyncCenter";

const NAV = [
  {
    to: "/app",
    label: "Register",
    icon: LuScanBarcode,
    end: true,
    roles: ["CASHIER", "ADMIN"],
  },
  {
    to: "/app/reports",
    label: "Reports",
    icon: LuChartColumn,
    roles: ["ADMIN"],
  },
  {
    to: "/app/inventory",
    label: "Inventory",
    icon: LuPackage,
    roles: ["ADMIN"],
  },
  {
    to: "/app/billing",
    label: "Billing",
    icon: LuCreditCard,
    roles: ["ADMIN"],
  },
  {
    to: "/app/settings",
    label: "Settings",
    icon: LuSettings,
    roles: ["ADMIN"],
  },
];

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function SyncPill({ onClick, tone = "light" }) {
  const { label, dot, pending, failed, syncing } = useSyncSummary();
  const count = pending + failed;
  const onGreen = tone === "onBrand";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-desc font-semibold transition ${
        onGreen
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
      aria-label={`Sync status: ${label}${count ? `, ${count} bills waiting` : ""}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${failed ? "bg-rose-400" : dot} ${syncing ? "animate-pulse" : ""}`}
        aria-hidden
      />
      <span className="hidden sm:inline">{label}</span>
      {count ? (
        <span
          className={`rounded-full px-1.5 tabular ${onGreen ? "bg-white text-brand-700" : "bg-amber-500 text-white"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [syncOpen, setSyncOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user?.role));
  // A phone tab bar holds four comfortably; anything else moves into a More sheet.
  const tabItems = items.slice(0, 4);
  const overflowItems = items.slice(4);

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-[100dvh] bg-slate-50">
      {/* Tablet / desktop rail */}
      <nav
        className="hidden w-[76px] shrink-0 flex-col items-center border-r border-slate-200/80 bg-white py-4 md:flex"
        aria-label="Main"
      >
        <div
          className="mb-6 grid h-10 w-10 place-items-center rounded-2xl bg-brand text-ink"
          title="FreshFlow"
        >
          <LuLeaf size={20} aria-hidden />
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex w-[60px] flex-col items-center gap-1 rounded-2xl py-2 text-desc transition ${
                    isActive
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`
                }
              >
                <Icon size={20} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-3">
          <div
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-desc font-semibold text-slate-700"
            title={`${user?.name} (${user?.role?.toLowerCase()})`}
          >
            {initials(user?.name)}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Sign out"
            title="Sign out"
          >
            <LuLogOut aria-hidden />
          </button>
        </div>
      </nav>

      <main className="relative flex min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <SubscriptionBanner />
        <div className="min-h-0 flex-1">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<Spinner />}>
              <Outlet
                context={{ openSync: () => setSyncOpen(true), signOut }}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Phone tab bar */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        <ul className="flex h-16 items-stretch">
          {tabItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex h-full flex-col items-center justify-center gap-1 text-desc ${isActive ? "font-semibold text-brand-700" : "text-slate-500"}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        className="absolute top-0 h-0.5 w-10 rounded-full bg-brand"
                        aria-hidden
                      />
                    ) : null}
                    <Icon size={20} aria-hidden />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-desc text-slate-500"
            >
              <LuEllipsis size={20} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={user?.name}
        description={organization?.name}
      >
        <ul className="divide-y divide-slate-100">
          {overflowItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 py-3 text-body text-slate-700"
              >
                <Icon size={20} className="text-slate-400" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setSyncOpen(true);
              }}
              className="flex w-full items-center gap-3 py-3 text-left text-body text-slate-700"
            >
              <LuScanBarcode size={20} className="text-slate-400" aria-hidden />
              Bill sync
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 py-3 text-left text-body text-rose-600"
            >
              <LuLogOut size={20} aria-hidden />
              Sign out
            </button>
          </li>
        </ul>
      </Modal>

      <SyncCenter open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}
