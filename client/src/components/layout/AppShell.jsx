import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LuChartColumn,
  LuCreditCard,
  LuEllipsis,
  LuLogOut,
  LuMessageSquare,
  LuPackage,
  LuScanBarcode,
  LuSettings,
  LuShoppingCart,
  LuX,
} from "react-icons/lu";
import { BRAND } from "../../lib/brand";
import { useAuthStore } from "../../store/authStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/States";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { NotificationBell, useUnreadCount } from "./NotificationBell";
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
      className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-desc font-medium transition ${
        onGreen
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-white text-gray-700 ring-1 ring-black/10 hover:ring-brand/50"
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
          className={`rounded-full px-1.5 tabular ${onGreen ? "bg-white text-brand-700" : "bg-[#FF7B29] text-white"}`}
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
  const [navOpen, setNavOpen] = useState(false);
  // Shared with the sidebar bell, so the two badges can never disagree on screen.
  const { unread: unreadCount } = useUnreadCount();
  const items = NAV.filter((n) => n.roles.includes(user?.role));
  // A phone tab bar holds four comfortably; anything else moves into a More sheet.
  const tabItems = items.slice(0, 4);
  const overflowItems = items.slice(4);
  const roleLabel = user?.role === "ADMIN" ? "Admin" : "Cashier";

  /*
   * The till runs edge to edge: no rail, no tab bar, at any width. A cashier
   * works this one screen all day, and every pixel of it belongs to the
   * products. Everything else is still one tap away — the till's own menu
   * button opens the drawer below, through `openNav` on the outlet context.
   */
  const onTill = location.pathname.replace(/\/+$/, "") === "/app";

  // Leaving the till (or moving anywhere) closes the drawer behind you.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-[100dvh] bg-[#F8F4EE]">
      {/* Slim sidebar (tablet and up): icons with small labels */}
      <nav
        className={`w-[88px] shrink-0 flex-col border-r border-white/5 bg-[#151515] text-white ${
          onTill ? "hidden" : "hidden md:flex"
        }`}
        aria-label="Main"
      >
        {/* Brand */}
        <div className="flex h-[72px] items-center justify-center border-b border-white/5">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF7B29] text-white shadow-lg shadow-black/30"
            title={BRAND.fullName}
          >
            <LuShoppingCart size={20} aria-hidden />
          </span>
        </div>

        {/* Menu */}
        <ul className="mt-3 flex flex-1 flex-col gap-1 px-2.5">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  `group relative flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-medium transition-colors ${
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#FF7B29] transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden
                    />
                    <Icon
                      size={20}
                      className={
                        isActive
                          ? "text-[#FF7B29]"
                          : "text-white/55 group-hover:text-white"
                      }
                      aria-hidden
                    />
                    <span className={isActive ? "font-semibold" : ""}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Signed-in person */}
        <div className="border-t border-white/5 p-3">
          <div className="flex flex-col items-center gap-2">
            <NotificationBell />
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FF7B29]/15 text-desc font-bold text-[#FF9A57]"
              title={`${user?.name} (${roleLabel.toLowerCase()})`}
            >
              {initials(user?.name)}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LuLogOut aria-hidden />
            </button>
          </div>
        </div>
      </nav>

      <main
        className={`relative flex min-w-0 flex-1 flex-col ${
          onTill ? "" : "pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0"
        }`}
      >
        <SubscriptionBanner />
        <div className="min-h-0 flex-1">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<Spinner />}>
              <Outlet
                context={{
                  openSync: () => setSyncOpen(true),
                  openNav: () => setNavOpen(true),
                  signOut,
                }}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Phone tab bar */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-[#151515] pb-[env(safe-area-inset-bottom)] ${
          onTill ? "hidden" : "md:hidden"
        }`}
        aria-label="Main"
      >
        <ul className="flex h-16 items-stretch">
          {tabItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex h-full flex-col items-center justify-center gap-1 text-[11px] ${
                    isActive ? "font-semibold text-white" : "text-white/55"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        className="absolute top-0 h-1 w-8 rounded-b-full bg-[#FF7B29]"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      size={20}
                      className={isActive ? "text-[#FF7B29]" : ""}
                      aria-hidden
                    />
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
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-white/55"
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
            <NavLink
              to="/app/notifications"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 py-3 text-body text-slate-700"
            >
              <LuMessageSquare
                size={20}
                className="text-slate-400"
                aria-hidden
              />
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 ? (
                <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-ink">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </NavLink>
          </li>
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

      <NavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        items={items}
        user={user}
        organization={organization}
        roleLabel={roleLabel}
        unreadCount={unreadCount}
        onOpenSync={() => {
          setNavOpen(false);
          setSyncOpen(true);
        }}
        onSignOut={signOut}
      />

      <SyncCenter open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}

/* =========================================================
   Nav drawer
   The till hides the rail and the tab bar, so this is how a
   cashier reaches everything else. It slides in from the left,
   mirrors the rail's dark styling, and closes on Escape, on the
   backdrop, or as soon as the route changes.
   ========================================================= */
function NavDrawer({
  open,
  onClose,
  items,
  user,
  organization,
  roleLabel,
  unreadCount,
  onOpenSync,
  onSignOut,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const ROW =
    "flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium transition-colors";

  return (
    // Above the till's own modals, which sit at z-50.
    <div
      className="fixed inset-0 z-[70] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/50"
      />

      <div className="relative flex h-full w-[280px] max-w-[85vw] flex-col bg-[#151515] text-white shadow-2xl">
        {/* who is signed in */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FF7B29]/15 text-desc font-bold text-[#FF9A57]"
              aria-hidden
            >
              {initials(user?.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user?.name}</p>
              <p className="truncate text-desc text-white/50">
                {organization?.name
                  ? `${organization.name} · ${roleLabel}`
                  : roleLabel}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <LuX size={18} aria-hidden />
          </button>
        </div>

        {/* the same destinations as the rail */}
        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) =>
                  `${ROW} ${
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      className={isActive ? "text-[#FF7B29]" : ""}
                      aria-hidden
                    />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}

          <li>
            <NavLink
              to="/app/notifications"
              onClick={onClose}
              className={({ isActive }) =>
                `${ROW} ${
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                }`
              }
            >
              <LuMessageSquare size={20} aria-hidden />
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 ? (
                <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#FF7B29] px-1 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </NavLink>
          </li>

          <li>
            <button
              type="button"
              onClick={onOpenSync}
              className={`${ROW} w-full text-left text-white/60 hover:bg-white/[0.04] hover:text-white`}
            >
              <LuScanBarcode size={20} aria-hidden />
              Bill sync
            </button>
          </li>
        </ul>

        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={onSignOut}
            className={`${ROW} w-full text-left text-rose-300 hover:bg-rose-500/10`}
          >
            <LuLogOut size={20} aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
