import { lazy, useEffect } from "react";
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
import { useAuthStore } from "./store/authStore";

// Admin areas load on demand, so a cashier's till never downloads them.
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster />
    </>
  );
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
