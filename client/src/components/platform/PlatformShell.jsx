import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LuBell,
  LuBuilding2,
  LuChartColumn,
  LuClipboardList,
  LuCreditCard,
  LuFileClock,
  LuGauge,
  LuInbox,
  LuLayoutDashboard,
  LuLoaderCircle,
  LuLogOut,
  LuMenu,
  LuMessageSquare,
  LuSettings,
  LuShieldCheck,
  LuTags,
  LuUsers,
  LuWebhook,
  LuX,
} from 'react-icons/lu';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';
import PlatformSearch from './PlatformSearch.jsx';

/*
 * The navigation from the brief, in full. Sections that are not built yet are listed but not
 * linked, marked "soon" -- so the shape of the panel is visible without any item pretending to
 * work. A dead link that silently does nothing is worse than an honest label.
 */
const MONEY_ROLES = ['SUPER_ADMIN', 'FINANCE'];

const NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/platform', end: true, label: 'Dashboard', icon: LuLayoutDashboard },
      { to: '/platform/follow-ups', label: 'Follow-ups', icon: LuClipboardList },
      { to: '/platform/inbox', label: 'Inbox', icon: LuInbox },
    ],
  },
  {
    group: 'Customers',
    items: [
      { to: '/platform/stores', label: 'Stores', icon: LuBuilding2 },
      { to: '/platform/users', label: 'Users', icon: LuUsers },
      { to: '/platform/messages', label: 'Messages', icon: LuMessageSquare },
    ],
  },
  {
    group: 'Money & records',
    items: [
      { to: '/platform/plans', label: 'Plans', icon: LuTags },
      { to: '/platform/payments', label: 'Payments', icon: LuCreditCard, roles: MONEY_ROLES },
      { to: '/platform/webhooks', label: 'Webhooks', icon: LuWebhook, roles: MONEY_ROLES },
      { to: '/platform/reports', label: 'Reports', icon: LuChartColumn, roles: MONEY_ROLES },
    ],
  },
  {
    group: 'Platform',
    items: [
      { to: '/platform/team', label: 'Team', icon: LuShieldCheck, roles: ['SUPER_ADMIN'] },
      { to: '/platform/settings', label: 'Settings', icon: LuSettings },
      { to: '/platform/audit', label: 'Audit log', icon: LuFileClock, roles: MONEY_ROLES },
      { to: '/platform/health', label: 'System health', icon: LuGauge },
    ],
  },
];

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super admin',
  SUPPORT: 'Support',
  FINANCE: 'Finance',
};

export function PlatformShell() {
  const { admin, signOut } = usePlatformAuthStore();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  const leave = async () => {
    await signOut();
    navigate('/platform/login', { replace: true });
  };

  const sidebar = (
    <nav className="flex h-full flex-col bg-[#0F1115] text-white" aria-label="Platform sections">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-ink" aria-hidden>
          <LuShieldCheck size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-extrabold leading-tight">Platform admin</p>
          <p className="truncate text-desc text-white/40">Super Market back office</p>
        </div>
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/50 hover:bg-white/10 lg:hidden"
          aria-label="Close the menu"
        >
          <LuX size={18} aria-hidden />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mt-3 first:mt-0">
            <p className="px-2 pb-1.5 text-desc font-semibold text-white/35">{group}</p>
            <ul className="space-y-0.5">
              {items
                .filter(({ roles }) => !roles || roles.includes(admin?.role))
                .map(({ to, end, label, icon: Icon, soon }) => (
                <li key={label}>
                  {soon ? (
                    <span
                      className="flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2 text-body text-white/25"
                      title="Not built yet"
                    >
                      <Icon size={16} className="shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{label}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-desc font-semibold text-white/30">
                        soon
                      </span>
                    </span>
                  ) : (
                    <NavLink
                      to={to}
                      end={end}
                      onClick={() => setNavOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2 py-2 text-body transition ${
                          isActive
                            ? 'bg-brand text-ink font-bold'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      <Icon size={16} className="shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{label}</span>
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-desc font-bold"
            aria-hidden
          >
            {admin?.name?.[0]?.toUpperCase() ?? '?'}
          </span>
          <NavLink
            to="/platform/account"
            onClick={() => setNavOpen(false)}
            className="min-w-0 flex-1 rounded-lg px-1 py-0.5 transition hover:bg-white/10"
            title="Your account"
          >
            <p className="truncate text-desc font-semibold">{admin?.name}</p>
            <p className="truncate text-desc text-white/40">{ROLE_LABEL[admin?.role] ?? admin?.role}</p>
          </NavLink>
          <button
            type="button"
            onClick={leave}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LuLogOut size={16} aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-[100dvh] bg-[#F6F7F9]">
      <aside className="hidden w-[240px] shrink-0 lg:block">{sidebar}</aside>

      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[260px]">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
         * The search box lives in the header on every screen size, because it is how a support
         * call starts: the caller gives a phone number or an order id before anything else.
         */}
        <header className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5 lg:px-4">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open the menu"
          >
            <LuMenu size={18} aria-hidden />
          </button>

          <PlatformSearch />

          <span
            className="ml-auto hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-desc font-semibold text-slate-600 sm:inline"
            title={`Signed in as ${admin?.name}`}
          >
            {ROLE_LABEL[admin?.role] ?? admin?.role}
          </span>
        </header>

        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center p-10 text-slate-400">
                <LuLoaderCircle className="animate-spin" size={22} aria-hidden />
                <span className="sr-only">Loading</span>
              </div>
            }
          >
            <Outlet context={{ admin }} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
