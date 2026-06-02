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
    <div className="auth">
      <aside className="auth-aside">
        <div className="grid-bg" />
        <div className="topline">
          <span className="wordmark">Axon</span>
        </div>

        <div className="mid">
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Control plane access</span>
          <h2 style={{ marginTop: 14 }}>Sign in to the control plane.</h2>
          <p className="lede">
            Trigger commands, watch them stream, and review the audit trail for every machine your org operates.
          </p>

          <div className="term auth-proof" style={{ marginTop: 30, boxShadow: "var(--shadow)" }}>
            <div className="term-head">
              <span className="row gap-2" style={{ fontSize: "var(--t-xs)", color: "#8b95a4" }}>
                <span className="live-dot" />
                fleet · 14 agents online
              </span>
            </div>
            <div className="term-body">
              <div className="term-line"><span className="ts">14:22:07</span><span className="lvl c-ok">OK  </span><span>ord-web-03 · exit 0 · 1.49s</span></div>
              <div className="term-line"><span className="ts">14:21:55</span><span className="lvl c-acc">LEASE</span><span>billing-reconcile · owner worker-a</span></div>
              <div className="term-line"><span className="ts">14:21:40</span><span className="lvl c-info">INFO</span><span>sjc-cache-02 reconnected</span></div>
              <div className="term-line"><span className="ts">14:21:02</span><span className="lvl c-warn">WARN</span><span>fra-db-01 lease ttl &lt; 5s</span></div>
              <div className="term-line"><span className="ts">14:20:33</span><span className="lvl c-ok">OK  </span><span>nightly-backup · exit 0</span></div>
            </div>
          </div>

          <ul className="feats">
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span><b>Every action audited</b> — your sessions are recorded the same as any operator.</span>
            </li>
          </ul>
        </div>

        <div className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>
          © 2026 Axon · control plane v1
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-top-controls">
          <button className="btn btn-ghost btn-sm" onClick={toggle}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="auth-card">
          <div className="head">
            <h1>Sign in</h1>
            <p>Welcome back. Authenticate to reach your control plane.</p>
          </div>

          {error && (
            <div className="banner err" style={{ marginBottom: 16 }}>
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="login-email">Work email</label>
              <input
                className="input"
                id="login-email"
                type="email"
                placeholder="alice@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="field">
              <div className="label-row">
                <label className="label" htmlFor="login-pw">Password</label>
                <a href="#">Forgot?</a>
              </div>
              <input
                className="input"
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
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", height: 44, fontSize: "var(--t-base)" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <div className="auth-divider">or continue with</div>
            <div className="sso">
              <button type="button" className="btn btn-ghost" style={{ border: "1px solid var(--border-strong)" }}>
                SSO / SAML
              </button>
              <button type="button" className="btn btn-ghost" style={{ border: "1px solid var(--border-strong)" }}>
                GitHub
              </button>
            </div>
          </form>

          <p className="auth-foot">
            New to Axon? <Link to="/register">Create an organization →</Link>
          </p>
          <p className="auth-legal">
            Protected by org access policy. Sign-in events are written to your audit log.
          </p>
        </div>
      </main>
    </div>
  );
}
