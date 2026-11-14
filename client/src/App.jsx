import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/ui/Toaster";
import AboutPage from "./pages/AboutPage";
import FeaturesPage from "./pages/FeaturesPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import PricingPage from "./pages/PricingPage";
import ServicesPage from "./pages/ServicesPage";
import SignupPage from "./pages/SignupPage";
import { RequireAuth, RequireRole } from "./routes/guards";
import {
  RequirePlatformAuth,
  RequirePlatformRole,
} from "./routes/platformGuards";
import { useAuthStore } from "./store/authStore";

// Admin areas load on demand, so a cashier's till never downloads them.
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));

/*
 * The platform back office. Loaded on demand so a cashier's till never downloads it, and kept
 * on its own /platform branch: it has its own accounts, its own tokens and its own shell, and
 * shares nothing with the store app above.
 */
const PlatformLoginPage = lazy(
  () => import("./pages/platform/PlatformLoginPage"),
);
const PlatformShell = lazy(() =>
  import("./components/platform/PlatformShell").then((m) => ({
    default: m.PlatformShell,
  })),
);
const PlatformDashboardPage = lazy(
  () => import("./pages/platform/PlatformDashboardPage"),
);
const PlatformStoresPage = lazy(
  () => import("./pages/platform/PlatformStoresPage"),
);
const PlatformStoreDetailPage = lazy(
  () => import("./pages/platform/PlatformStoreDetailPage"),
);
const PlatformFollowUpsPage = lazy(
  () => import("./pages/platform/PlatformFollowUpsPage"),
);
const PlatformUsersPage = lazy(
  () => import("./pages/platform/PlatformUsersPage"),
);
const PlatformPaymentsPage = lazy(
  () => import("./pages/platform/PlatformPaymentsPage"),
);
const PlatformWebhooksPage = lazy(
  () => import("./pages/platform/PlatformWebhooksPage"),
);
const PlatformAuditPage = lazy(
  () => import("./pages/platform/PlatformAuditPage"),
);
const PlatformAccountPage = lazy(
  () => import("./pages/platform/PlatformAccountPage"),
);
const PlatformTeamPage = lazy(
  () => import("./pages/platform/PlatformTeamPage"),
);
const PlatformPlansPage = lazy(
  () => import("./pages/platform/PlatformPlansPage"),
);
const PlatformMessagesPage = lazy(
  () => import("./pages/platform/PlatformMessagesPage"),
);
const PlatformInboxPage = lazy(
  () => import("./pages/platform/PlatformInboxPage"),
);
const PlatformReportsPage = lazy(
  () => import("./pages/platform/PlatformReportsPage"),
);
const PlatformSettingsPage = lazy(
  () => import("./pages/platform/PlatformSettingsPage"),
);
const PlatformHealthPage = lazy(
  () => import("./pages/platform/PlatformHealthPage"),
);

export default function App() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <>
      <ScrollToTop />

      <Routes>
        {/* Public site */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* The application */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<PosPage />} />

          <Route element={<RequireRole roles={["ADMIN"]} />}>
            <Route path="reports" element={<ReportsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="billing" element={<BillingPage />} />
          </Route>
        </Route>

        {/* Platform back office */}
        <Route
          path="/platform/login"
          element={
            <Suspense fallback={<PlatformLoading />}>
              <PlatformLoginPage />
            </Suspense>
          }
        />
        <Route
          path="/platform"
          element={
            <RequirePlatformAuth>
              <Suspense fallback={<PlatformLoading />}>
                <PlatformShell />
              </Suspense>
            </RequirePlatformAuth>
          }
        >
          <Route index element={<PlatformDashboardPage />} />
          <Route path="stores" element={<PlatformStoresPage />} />
          <Route path="stores/:id" element={<PlatformStoreDetailPage />} />
          <Route path="follow-ups" element={<PlatformFollowUpsPage />} />
          <Route path="users" element={<PlatformUsersPage />} />
          <Route path="account" element={<PlatformAccountPage />} />
          <Route path="plans" element={<PlatformPlansPage />} />
          <Route path="messages" element={<PlatformMessagesPage />} />
          <Route path="inbox" element={<PlatformInboxPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
          <Route path="health" element={<PlatformHealthPage />} />
          <Route element={<RequirePlatformRole roles={["SUPER_ADMIN"]} />}>
            <Route path="team" element={<PlatformTeamPage />} />
          </Route>
          {/* The money screens and the audit log are refused to SUPPORT by the API. This
              guard is a layout route (it renders an Outlet), so the pages nest inside it
              rather than being passed as children. */}
          <Route
            element={<RequirePlatformRole roles={["SUPER_ADMIN", "FINANCE"]} />}
          >
            <Route path="payments" element={<PlatformPaymentsPage />} />
            <Route path="webhooks" element={<PlatformWebhooksPage />} />
            <Route path="audit" element={<PlatformAuditPage />} />
            <Route path="reports" element={<PlatformReportsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster />
    </>
  );
}

/** Dark to match the panel, so a reload does not flash the store app's white. */
function PlatformLoading() {
  return <div className="min-h-[100dvh] bg-[#0F1115]" aria-busy="true" />;
}

/* =========================================================
   Scroll To Top
   Automatically scrolls the page to the top whenever
   the route/path changes.
   ========================================================= */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [pathname]);

  return null;
}
