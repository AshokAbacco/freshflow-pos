import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LuChartColumn,
  LuLeaf,
  LuLogOut,
  LuPackage,
  LuScanBarcode,
  LuSettings,
} from "react-icons/lu";
import { useAuthStore } from "../../store/authStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Spinner } from "../ui/States";
import { SyncCenter, useSyncSummary } from "./SyncCenter";

const NAV = [
  {
    to: "/",
    label: "Register",
    icon: LuScanBarcode,
    end: true,
    roles: ["CASHIER", "ADMIN"],
  },
  { to: "/reports", label: "Reports", icon: LuChartColumn, roles: ["ADMIN"] },
  { to: "/inventory", label: "Inventory", icon: LuPackage, roles: ["ADMIN"] },
  { to: "/settings", label: "Settings", icon: LuSettings, roles: ["ADMIN"] },
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
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-all shadow-sm shrink-0 max-w-full overflow-hidden ${
        onGreen
          ? "bg-white/20 text-white hover:bg-white/30 border border-white/20"
          : "bg-white text-gray-700 hover:bg-green-50 border border-green-100 hover:border-green-200 hover:text-green-800"
      }`}
      aria-label={`Sync status: ${label}${count ? `, ${count} bills waiting` : ""}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full shadow-sm ${failed ? "bg-rose-500" : dot} ${syncing ? "animate-pulse" : ""}`}
        aria-hidden
      />
      <span className="hidden sm:inline truncate">{label}</span>
      {count > 0 ? (
        <span
          className={`rounded-full px-1.5 py-0.5 tabular-nums shrink-0 ${onGreen ? "bg-white text-green-800" : "bg-amber-500 text-white"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [syncOpen, setSyncOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user?.role));

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    // Fixed container: w-full and overflow-hidden prevent any horizontal scrolling entirely
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F9FCF9] text-gray-800 font-sans selection:bg-green-200">
      {/* Tablet / desktop rail */}
      <nav
        className="hidden w-[88px] shrink-0 flex-col items-center border-r border-green-100/60 bg-white/70 backdrop-blur-xl py-6 md:flex shadow-sm z-20"
        aria-label="Main"
      >
        <div
          className="mb-8 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-green-700 text-white shadow-md shadow-green-700/20"
          title="FreshFlow"
        >
          <LuLeaf size={24} aria-hidden />
        </div>

        <ul className="flex flex-1 flex-col gap-3 w-full px-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="w-full">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex w-full flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] transition-all overflow-hidden ${
                    isActive
                      ? "bg-green-50 font-bold text-green-700 shadow-sm border border-green-100/50"
                      : "font-medium text-gray-500 hover:bg-white hover:text-green-700 hover:shadow-sm border border-transparent"
                  }`
                }
              >
                <Icon size={22} aria-hidden className="shrink-0" />
                <span className="truncate w-full text-center px-1">
                  {label}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-center gap-4 mt-auto">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-100 text-sm font-bold text-green-800 border border-green-200 shadow-sm"
            title={`${user?.name} (${user?.role?.toLowerCase()})`}
          >
            {initials(user?.name)}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LuLogOut size={20} aria-hidden />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-[calc(70px+env(safe-area-inset-bottom))] md:pb-0 scroll-thin">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense
            fallback={
              <div className="h-full grid place-items-center">
                <Spinner />
              </div>
            }
          >
            <Outlet context={{ openSync: () => setSyncOpen(true), signOut }} />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-green-100/80 bg-white/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.04)]"
        aria-label="Main"
      >
        <ul className="flex h-[70px] items-stretch justify-around px-1 w-full">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1 min-w-0 overflow-hidden">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] sm:text-xs transition-colors overflow-hidden ${
                    isActive
                      ? "font-bold text-green-700"
                      : "font-medium text-gray-500 hover:text-green-600"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        className="absolute top-0 h-1 w-12 rounded-b-full bg-green-600 shadow-[0_2px_8px_rgba(22,101,52,0.4)]"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      size={22}
                      aria-hidden
                      className={`shrink-0 ${isActive ? "mt-1" : ""}`}
                    />
                    <span className="truncate w-full text-center px-1">
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="flex-1 min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={signOut}
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] sm:text-xs font-medium text-gray-500 hover:text-rose-600 transition-colors overflow-hidden"
            >
              <LuLogOut size={22} aria-hidden className="shrink-0" />
              <span className="truncate w-full text-center px-1">Sign out</span>
            </button>
          </li>
        </ul>
      </nav>

      <SyncCenter open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}
