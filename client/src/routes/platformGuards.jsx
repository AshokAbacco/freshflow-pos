import { useEffect } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import { LuLoaderCircle, LuShieldAlert } from "react-icons/lu";
import { usePlatformAuthStore } from "../store/platformAuthStore.js";

/**
 * Gate for /platform/*.
 *
 * Like the store-side guards, this is convenience rather than security: every platform API
 * route enforces the same rules with 401s and 403s, so a crafted request gets nowhere even
 * if someone edits the bundle.
 */
export function RequirePlatformAuth({ children }) {
  const { admin, restoring, restore } = usePlatformAuthStore();

  useEffect(() => {
    // One attempt per mount to trade the refresh cookie for a session.
    if (restoring) restore();
  }, [restoring, restore]);

  // Deciding before the refresh settles would sign the user out on every page reload.
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

  if (!admin) return <Navigate to="/platform/login" replace />;
  return children;
}

/** Role gate for sections only some platform roles may open. */
export function RequirePlatformRole({ roles }) {
  const admin = usePlatformAuthStore((s) => s.admin);
  const context = useOutletContext();

  if (!admin || !roles.includes(admin.role)) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
            <LuShieldAlert size={22} aria-hidden />
          </div>
          <h1 className="text-h2 font-bold text-slate-900">
            Not available to your role
          </h1>
          <p className="mt-2 text-desc leading-5 text-slate-500">
            This section needs{" "}
            {roles.length === 1 ? "the" : "one of these roles:"}{" "}
            {roles.map((r) => r.replace("_", " ").toLowerCase()).join(", ")}
            {roles.length === 1 ? " role" : ""}. Your account is{" "}
            {admin?.role.replace("_", " ").toLowerCase()}.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet context={context} />;
}
