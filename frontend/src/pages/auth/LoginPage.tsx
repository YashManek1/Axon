import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { authAPI } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { toast } from "../../stores/toastStore";

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const navigate      = useNavigate();
  const { login }     = useAuthStore();
  const { theme, toggle } = useThemeStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      login(res.data.user);
      toast.success("Welcome back", "Signed in successfully");
      navigate("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-bg">
      <aside className="hidden lg:flex flex-col relative border-r border-edge bg-surface px-12 py-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-60 z-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(26,40,68,0.30) 1px, transparent 1px), linear-gradient(90deg, rgba(26,40,68,0.30) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-ink">Axon</span>
          </div>

          <div className="mt-auto mb-auto max-w-sm">
            <span className="font-mono text-xs font-medium tracking-widest uppercase text-primary">Control plane access</span>
            <h2 className="mt-3.5 text-3xl font-bold leading-tight tracking-tighter text-ink">Sign in to the control plane.</h2>
            <p className="mt-3.5 text-base text-ink-2 leading-relaxed">
              Trigger commands, watch them stream, and review the audit trail for every machine your org operates.
            </p>

            <div className="mt-7.5 bg-term-bg border border-edge rounded-md overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(0,0,0,.4), 0 8px 28px -12px rgba(0,0,0,.7)" }}>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-edge bg-opacity-2 backdrop-blur">
                <span className="flex items-center gap-1 font-mono text-xs text-ink-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  fleet · example activity
                </span>
              </div>
              <div className="py-3 px-3.5 max-h-32 overflow-hidden">
                <div className="flex gap-3 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                  <span className="text-muted flex-shrink-0">14:22:07</span><span className="text-success flex-shrink-0">OK  </span><span>ord-web-03 · exit 0 · 1.49s</span>
                </div>
                <div className="flex gap-3 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                  <span className="text-muted flex-shrink-0">14:21:55</span><span className="text-primary flex-shrink-0">LEASE</span><span>billing-reconcile · owner worker-a</span>
                </div>
                <div className="flex gap-3 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                  <span className="text-muted flex-shrink-0">14:21:40</span><span className="text-info flex-shrink-0">INFO</span><span>sjc-cache-02 reconnected</span>
                </div>
                <div className="flex gap-3 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                  <span className="text-muted flex-shrink-0">14:21:02</span><span className="text-warning flex-shrink-0">WARN</span><span>fra-db-01 lease ttl &lt; 5s</span>
                </div>
                <div className="flex gap-3 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                  <span className="text-muted flex-shrink-0">14:20:33</span><span className="text-success flex-shrink-0">OK  </span><span>nightly-backup · exit 0</span>
                </div>
              </div>
            </div>

            <ul className="mt-7 flex flex-col gap-3.25">
              <li className="flex gap-3 items-start text-sm text-ink-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary flex-shrink-0 mt-0.25">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <span><b className="font-semibold text-ink">Every action audited</b> — your sessions are recorded the same as any operator.</span>
              </li>
            </ul>
          </div>

          <div className="font-mono text-xs text-muted">
            © 2026 Axon · control plane v1
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-10 py-12 relative">
        <div className="absolute top-5 right-6 z-5">
          <button
            className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-ink-2 hover:text-ink hover:bg-surface transition-colors"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggle}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in</h1>
            <p className="mt-2 text-base text-ink-2">Welcome back. Authenticate to reach your control plane.</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-md border bg-danger/10 border-danger/35 text-ink">
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form className="flex flex-col gap-4.25" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.75">
              <label className="block text-sm font-medium text-ink-2" htmlFor="login-email">Work email</label>
              <input
                className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                id="login-email"
                type="email"
                placeholder="alice@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-1.75">
              <div className="flex justify-between items-baseline">
                <label className="block text-sm font-medium text-ink-2" htmlFor="login-pw">Password</label>
                {/* TODO: restore this link once password reset exists. A dead "Forgot?"
                      promises account recovery that the product cannot perform. */}
              </div>
              <input
                className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                id="login-pw"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              className="w-full h-11 bg-primary text-white font-medium text-base rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <div className="flex items-center gap-3.5 my-1">
              <div className="h-px bg-edge flex-1" />
              <span className="text-xs text-muted">or continue with</span>
              <div className="h-px bg-edge flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-edge text-ink-2 hover:border-primary hover:text-ink transition-colors bg-transparent"
              >
                SSO / SAML
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-edge text-ink-2 hover:border-primary hover:text-ink transition-colors bg-transparent"
              >
                GitHub
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            New to Axon? <Link to="/register" className="text-primary hover:text-primary-hover font-medium">Create an organization →</Link>
          </p>
          <p className="mt-6.5 text-center text-xs text-muted leading-relaxed">
            Protected by org access policy. Sign-in events are written to your audit log.
          </p>
        </div>
      </main>
    </div>
  );
}
