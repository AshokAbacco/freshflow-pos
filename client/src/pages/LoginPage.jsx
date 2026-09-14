import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../lib/api";
import { useAuthStore } from "../store/authStore";

export default function LoginPage() {
  const { token, login, sessionMessage } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      const from = location.state?.from;
      navigate(user.role === "ADMIN" && from ? from : "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .bg-mint {
          background-color: #84e8cd;
        }
        /* 3D Sphere Gradients & Shadows */
        .sphere-teal {
          background: radial-gradient(circle at 30% 30%, #5eead4, #14b8a6, #0f766e);
          box-shadow: -10px 15px 30px rgba(0, 0, 0, 0.4), inset -5px -5px 15px rgba(0,0,0,0.2);
        }
        .sphere-yellow {
          background: radial-gradient(circle at 30% 30%, #fef08a, #f59e0b, #b45309);
          box-shadow: -8px 12px 20px rgba(0, 0, 0, 0.35), inset -3px -3px 10px rgba(0,0,0,0.1);
        }
        
        /* Glassmorphism Card */
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
      `}</style>

      {/* Outer container with overflow-hidden to prevent scrollbars from popping shapes */}
      <div className="min-h-[100dvh] w-full bg-mint flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden">
        {/* Main Wrapper - No overflow hidden here so spheres can pop out */}
        <div className="relative w-full max-w-[1050px] flex flex-col md:flex-row rounded-3xl shadow-2xl bg-white z-10">
          {/* ================= LEFT SIDE PANEL ================= */}
          <div className="relative w-full md:w-[48%] min-h-[500px] md:min-h-[650px] rounded-t-3xl md:rounded-tr-none md:rounded-l-3xl z-10">
            {/* 1. Clipped Background (Flat overlapping shapes) */}
            <div className="absolute inset-0 rounded-t-3xl md:rounded-tr-none md:rounded-l-3xl overflow-hidden bg-[#0a1128]">
              {/* Flat Yellow Circle (Top Left) */}
              <div className="absolute -left-16 -top-10 w-64 h-64 rounded-full bg-[#f59e0b]" />
              {/* Overlapping Dark Navy Circle */}
              <div className="absolute -left-12 top-4 w-48 h-48 rounded-full bg-[#0a1128] border-2 border-[#1e293b]" />

              {/* Large Teal Donut (Top Right) */}
              <div className="absolute -right-24 -top-16 w-64 h-64 rounded-full border-[45px] border-[#0d9488]" />

              {/* Abstract Triangles/Polygons */}
              <div className="absolute right-0 top-[30%] w-40 h-40 bg-[#0f766e] transform rotate-45 translate-x-1/2" />
              <div className="absolute left-[-20%] bottom-[30%] w-60 h-60 bg-[#14b8a6] rounded-full opacity-80" />

              {/* Concentric Teal Circles (Bottom Left) */}
              <div className="absolute -left-20 -bottom-20 w-72 h-72 rounded-full border-[30px] border-[#0d9488]" />
              <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-[#059669]" />

              {/* Large Bottom Right Circle */}
              <div className="absolute -right-16 -bottom-16 w-56 h-56 rounded-full bg-[#14b8a6]" />

              {/* Extra Layering Circles */}
              <div className="absolute right-4 bottom-1/4 w-32 h-32 rounded-full border-[20px] border-[#1e293b] mix-blend-overlay" />
            </div>

            {/* 2. Unclipped 3D Spheres (Popping in and out) */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top Left - Large popping out */}
              <div className="sphere-teal absolute -top-8 -left-8 w-[100px] h-[100px] rounded-full z-20" />
              {/* Top Middle - Small popping out */}
              <div className="sphere-yellow absolute -top-5 left-[45%] w-12 h-12 rounded-full z-20" />
              {/* Right Edge - Floating over split */}
              <div className="sphere-teal absolute top-[35%] -right-8 w-[70px] h-[70px] rounded-full z-20" />
              {/* Bottom Left - Small popping out */}
              <div className="sphere-teal absolute -bottom-6 -left-4 w-16 h-16 rounded-full z-20" />
              {/* Bottom Inner - Medium */}
              <div className="sphere-teal absolute bottom-12 left-16 w-[70px] h-[70px] rounded-full z-20" />
              {/* Center Inner - Yellow */}
              <div className="sphere-yellow absolute top-[25%] left-[30%] w-14 h-14 rounded-full z-20 opacity-90" />
            </div>

            {/* 3. Glass Card Content */}
            <div className="relative z-30 flex h-full items-center justify-center p-6 sm:p-10">
              <div className="glass-card relative w-full max-w-[340px] rounded-[1.5rem] p-8 text-white overflow-hidden">
                {/* Internal Glow Blurs (Mimics reference light bleed) */}
                <div className="absolute -left-12 top-1/4 w-48 h-48 bg-[#f59e0b] rounded-full mix-blend-screen filter blur-[60px] opacity-70 pointer-events-none" />
                <div className="absolute -right-12 bottom-1/4 w-48 h-48 bg-[#14b8a6] rounded-full mix-blend-screen filter blur-[60px] opacity-60 pointer-events-none" />

                {/* Card Text Content */}
                <div className="relative z-10">
                  <div className="inline-block border border-white/30 bg-white/5 rounded-md px-4 py-1.5 mb-10">
                    <span className="text-xs font-semibold tracking-widest text-white/90">
                      FRESHFLOW POS
                    </span>
                  </div>

                  <p className="text-[15px] font-medium text-white/90 mb-1">
                    We are
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-medium mb-5 leading-[1.1] tracking-tight">
                    The future of <br />
                    retail right now.
                  </h2>
                  <p className="text-[13px] leading-relaxed text-white/70 mb-12 max-w-[250px]">
                    10,000+ stores have joined our network.
                    <br />
                    We invite you to join the ecosystem.
                  </p>

                  <div className="mt-8">
                    <p className="text-[13px] text-white/70 mb-1">
                      Need help signing in?
                    </p>
                    <p className="text-[15px] font-semibold text-white/90 cursor-pointer hover:text-white">
                      Contact admin
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= RIGHT SIDE PANEL (FORM) ================= */}
          <div className="w-full md:w-[52%] bg-white rounded-b-3xl md:rounded-bl-none md:rounded-r-3xl flex flex-col justify-center px-8 py-12 md:px-16 md:py-20 z-10">
            <h1 className="text-3xl font-semibold text-slate-900 mb-8">
              Sign in
            </h1>

            <form onSubmit={submit} noValidate className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-semibold text-slate-700 mb-2"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[13px] font-semibold text-slate-700 mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>

              <div className="flex items-center pt-1 pb-2">
                <input
                  id="show-password"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                <label
                  htmlFor="show-password"
                  className="ml-2 block text-sm font-medium text-slate-600 cursor-pointer select-none"
                >
                  Show password
                </label>
              </div>

              {error || sessionMessage ? (
                <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600 border border-rose-100">
                  {error || sessionMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!email || !password || loading}
                className="w-full rounded-lg bg-[#20b2aa] py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#1c9c95] hover:shadow-lg hover:shadow-[#20b2aa]/30 disabled:opacity-50 flex justify-center items-center"
              >
                {loading ? "Signing in..." : "Sign in →"}
              </button>
            </form>

            {/* Divider */}
            <div className="relative mt-8 mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-slate-400 font-medium">
                  or
                </span>
              </div>
            </div>

            {/* Google Button */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
