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
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-ink">Axon</span>
          </div>

          <div className="my-auto max-w-sm">
            <span className="font-mono text-xs font-medium tracking-widest uppercase text-primary">Set up · 3 steps to first command</span>
            <h2 className="mt-3.5 text-3xl font-bold leading-tight tracking-tighter text-ink">Stand up a control plane for your fleet.</h2>
            <p className="mt-3.5 text-base text-ink-2 leading-relaxed">
              Create your org, drop one agent on a box, and run your first audited command. No inbound ports, no SSH keys.
            </p>

            <ol className="mt-7.5 flex flex-col gap-0">
              {[
                { n: "01", title: "Create your organization", sub: "Your isolated control plane & audit store." },
                { n: "02", title: "Install the agent",        sub: "curl -sSL axon.sh/install | sh" },
                { n: "03", title: "Run your first command",   sub: "Watch it stream. Find it in the audit log." },
              ].map((step, i) => (
                <li
                  key={step.n}
                  className={`flex gap-3.75 py-3.75 ${i < 2 ? "border-b border-edge" : ""}`}
                >
                  <span className="font-mono font-semibold text-primary flex-shrink-0">{step.n}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-base text-ink">{step.title}</div>
                    {i === 1 ? (
                      <div className="font-mono text-xs text-ink-2 mt-1.5 bg-surface-2 border border-edge rounded-sm px-2.5 py-1.75">
                        {step.sub}
                      </div>
                    ) : (
                      <div className="text-sm text-ink-2 mt-0.75">{step.sub}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
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
            <h1 className="text-2xl font-bold tracking-tight text-ink">Create your organization</h1>
            <p className="mt-2 text-base text-ink-2">You'll be the first operator and admin.</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-md border bg-danger/10 border-danger/35 text-ink">
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form className="flex flex-col gap-4.25" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.75">
                <label className="block text-sm font-medium text-ink-2" htmlFor="reg-name">Full name</label>
                <input
                  className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                  id="reg-name"
                  placeholder="Alice Nguyen"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.75">
                <label className="block text-sm font-medium text-ink-2" htmlFor="reg-org">Organization</label>
                <input
                  className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                  id="reg-org"
                  placeholder="Acme Inc"
                  value={form.orgName}
                  onChange={(e) => update("orgName", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.75">
              <label className="block text-sm font-medium text-ink-2" htmlFor="reg-email">Work email</label>
              <input
                className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                id="reg-email"
                type="email"
                placeholder="alice@acme.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-1.75">
              <label className="block text-sm font-medium text-ink-2" htmlFor="reg-pw">Password</label>
              <input
                className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10"
                id="reg-pw"
                type="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => { update("password", e.target.value); setPwScore(scorePassword(e.target.value)); }}
                autoComplete="new-password"
                required
              />
              <div className="flex gap-1.25 mt-2">
                <div className={`h-0.75 flex-1 rounded bg-edge transition-colors ${pwScore >= 1 ? "bg-danger" : ""}`} />
                <div className={`h-0.75 flex-1 rounded bg-edge transition-colors ${pwScore >= 2 ? "bg-warning" : ""}`} />
                <div className={`h-0.75 flex-1 rounded bg-edge transition-colors ${pwScore >= 3 ? "bg-primary" : ""}`} />
                <div className={`h-0.75 flex-1 rounded bg-edge transition-colors ${pwScore >= 4 ? "bg-success" : ""}`} />
              </div>
            </div>

            <label className="flex items-start gap-2.25 text-sm text-ink-2 leading-relaxed mt-1">
              <input
                type="checkbox"
                required
                className="mt-0.5 w-3.75 h-3.75 accent-primary cursor-pointer"
              />
              <span>
                {/* TODO: restore Terms / DPA links when those documents exist.
                    Linking a consent checkbox to "#" asks people to agree to
                    documents they cannot read. */}
                I understand that sign-in and execution events are recorded to the
                audit log, and that the record is immutable.
              </span>
            </label>

            <button
              className="w-full h-11 bg-primary text-white font-medium text-base rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            Already have an org? <Link to="/login" className="text-primary hover:text-primary-hover font-medium">Sign in →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
