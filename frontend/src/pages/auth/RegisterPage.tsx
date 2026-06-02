import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { authAPI } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { toast } from "../../stores/toastStore";

function scorePassword(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score;
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "", email: "", password: "", orgName: "", orgDescription: "",
  });
  const [pwScore, setPwScore]   = useState(0);
  const [error,   setError]     = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate        = useNavigate();
  const { login }       = useAuthStore();
  const { theme, toggle } = useThemeStore();

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.register(form);
      login(res.data.user);
      toast.success("Organization created", "Welcome to Axon");
      navigate("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Registration failed";
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
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Set up · 3 steps to first command</span>
          <h2 style={{ marginTop: 14 }}>Stand up a control plane for your fleet.</h2>
          <p className="lede">
            Create your org, drop one agent on a box, and run your first audited command. No inbound ports, no SSH keys.
          </p>

          <ol style={{ listStyle: "none", marginTop: 30, display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { n: "01", title: "Create your organization", sub: "Your isolated control plane & audit store." },
              { n: "02", title: "Install the agent",        sub: "curl -sSL axon.sh/install | sh" },
              { n: "03", title: "Run your first command",   sub: "Watch it stream. Find it in the audit log." },
            ].map((step, i) => (
              <li
                key={step.n}
                style={{
                  display: "flex", gap: 15, padding: "15px 0",
                  borderBottom: i < 2 ? "1px solid var(--border)" : undefined,
                }}
              >
                <span className="mono" style={{ color: "var(--accent)", fontWeight: 600 }}>{step.n}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--t-base)", color: "var(--text)" }}>{step.title}</div>
                  {i === 1 ? (
                    <div
                      className="mono"
                      style={{
                        fontSize: "var(--t-xs)", color: "var(--text-muted)", marginTop: 6,
                        background: "var(--surface-2)", border: "1px solid var(--border)",
                        borderRadius: "var(--r-sm)", padding: "7px 10px",
                      }}
                    >
                      {step.sub}
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--t-sm)", color: "var(--text-muted)", marginTop: 3 }}>{step.sub}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
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
            <h1>Create your organization</h1>
            <p>You'll be the first operator and admin.</p>
          </div>

          {error && (
            <div className="banner err" style={{ marginBottom: 16 }}>
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-row">
              <div className="field">
                <label className="label" htmlFor="reg-name">Full name</label>
                <input
                  className="input"
                  id="reg-name"
                  placeholder="Alice Nguyen"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="reg-org">Organization</label>
                <input
                  className="input"
                  id="reg-org"
                  placeholder="Acme Inc"
                  value={form.orgName}
                  onChange={(e) => update("orgName", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="reg-email">Work email</label>
              <input
                className="input"
                id="reg-email"
                type="email"
                placeholder="alice@acme.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="reg-pw">Password</label>
              <input
                className="input"
                id="reg-pw"
                type="password"
                placeholder="At least 12 characters"
                value={form.password}
                onChange={(e) => { update("password", e.target.value); setPwScore(scorePassword(e.target.value)); }}
                autoComplete="new-password"
                required
              />
              <div className={"strength s" + pwScore}>
                <i /><i /><i /><i />
              </div>
            </div>

            <label className="checkrow">
              <input type="checkbox" required />
              <span>
                I agree to the <a href="#" style={{ color: "var(--accent)" }}>Terms</a> and{" "}
                <a href="#" style={{ color: "var(--accent)" }}>Data Processing Addendum</a>. I understand
                sign-in and execution events are recorded to the audit log.
              </span>
            </label>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", height: 44, fontSize: "var(--t-base)" }}
            >
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>

          <p className="auth-foot">
            Already have an org? <Link to="/login">Sign in →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
