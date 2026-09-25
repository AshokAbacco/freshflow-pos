import { Link, Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { LuShieldAlert } from 'react-icons/lu';
import { useAuthStore } from '../store/authStore';

export function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** UI-side role gate. The API enforces the same rule with 403s, so this is convenience, not security. */
export function RequireRole({ roles }) {
  const role = useAuthStore((s) => s.user?.role);
  // Nested outlets do not inherit context automatically; pass the shell's context through.
  const context = useOutletContext();
  if (!roles.includes(role)) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600">
            <LuShieldAlert size={22} aria-hidden />
          </div>
          <h1>This area is for store admins</h1>
          <p className="mt-2 text-desc text-slate-500">
            Reports, analytics, inventory and settings need an admin account. You can keep selling from the register.
          </p>
          <Link to="/app" className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-5 font-semibold text-white hover:bg-brand-700">
            Back to register
          </Link>
        </div>
      </div>
    );
  }
  return <Outlet context={context} />;
}
