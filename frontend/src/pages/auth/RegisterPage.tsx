import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sun, Moon, Eye, EyeOff, ShieldCheck, CheckCircle2, Server, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { authAPI } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { toast } from "../../stores/toastStore";
import AxonBrand from "../../components/brand/AxonBrand";

function scorePassword(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score;
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    orgName: "",
    orgDescription: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [pwScore, setPwScore] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthStore();
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
      toast.success("Organization created", "Welcome to Axon control plane");
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
        <div className="relative z-10 flex flex-col h-full justify-between">
          <AxonBrand />

          <div className="my-auto max-w-sm">
            <span className="font-mono text-xs font-medium tracking-widest uppercase text-primary">Stand up a control plane</span>
            <h2 className="mt-3.5 text-3xl font-bold leading-tight tracking-tighter text-ink text-balance">
              Deterministic server execution for your engineering fleet.
            </h2>
            <p className="mt-3.5 text-base text-ink-2 leading-relaxed text-pretty">
              Create an organization workspace, deploy lightweight agents, and execute audited operations with zero open inbound ports.
            </p>

            <ol className="mt-7.5 flex flex-col gap-0">
              {[
                { n: "01", icon: ShieldCheck, title: "Create Organization", sub: "Initialize your isolated tenant partition." },
                { n: "02", icon: Server, title: "Deploy Agent", sub: "Outbound TLS tunnel with monotonic generation fencing." },
                { n: "03", icon: CheckCircle2, title: "Review Before Running", sub: "Exact-server targeting and immutable audit trail." },
              ].map((step, i) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.n}
                    className={`flex gap-3.5 py-3.5 ${i < 2 ? "border-b border-edge" : ""}`}
                  >
                    <span className="font-mono font-semibold text-primary flex-shrink-0 text-sm mt-0.5">{step.n}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
                        <Icon size={14} className="text-primary" />
                        {step.title}
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5 text-pretty">{step.sub}</div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-7 pt-4 border-t border-edge flex items-center gap-2 text-xs font-mono text-muted">
              <Lock size={13} className="text-success" />
              <span>Cryptographic attempt journaling active</span>
            </div>
          </div>

          <div className="font-mono text-xs text-muted flex items-center justify-between">
            <span>© 2026 Axon · control plane v1</span>
            <div className="flex gap-3">
              <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-ink transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 sm:px-10 py-12 relative">
        <div className="absolute top-5 right-6 z-10">
          <button
            className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-ink-2 hover:text-ink hover:bg-surface transition-colors"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggle}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Create organization</h1>
            <p className="mt-2 text-sm text-ink-2 text-pretty">
              Set up your team workspace. You will be the primary administrator.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 flex items-center gap-3 px-4 py-3 rounded-md border bg-danger/10 border-danger/35 text-ink text-sm"
              role="alert"
            >
              <span className="flex-1">{error}</span>
            </motion.div>
          )}

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="block text-sm font-medium text-ink-2" htmlFor="reg-name">Your Name</label>
                <input
                  className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  id="reg-name"
                  placeholder="Alice Nguyen"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="block text-sm font-medium text-ink-2" htmlFor="reg-org">Organization</label>
                <input
                  className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  id="reg-org"
                  placeholder="Acme Cloud"
                  value={form.orgName}
                  onChange={(e) => update("orgName", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="block text-sm font-medium text-ink-2" htmlFor="reg-email">Work Email</label>
              <input
                className="w-full bg-bg border border-edge rounded-sm h-10 px-3 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                id="reg-email"
                type="email"
                placeholder="alice@acme.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="block text-sm font-medium text-ink-2" htmlFor="reg-pw">Password</label>
              <div className="relative">
                <input
                  className="w-full bg-bg border border-edge rounded-sm h-10 pl-3 pr-10 font-ui text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  id="reg-pw"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(e) => {
                    update("password", e.target.value);
                    setPwScore(scorePassword(e.target.value));
                  }}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex gap-1.5 mt-1.5" aria-label="Password strength meter">
                <div className={`h-1 flex-1 rounded-sm bg-edge transition-colors ${pwScore >= 1 ? "bg-danger" : ""}`} />
                <div className={`h-1 flex-1 rounded-sm bg-edge transition-colors ${pwScore >= 2 ? "bg-warning" : ""}`} />
                <div className={`h-1 flex-1 rounded-sm bg-edge transition-colors ${pwScore >= 3 ? "bg-primary" : ""}`} />
                <div className={`h-1 flex-1 rounded-sm bg-edge transition-colors ${pwScore >= 4 ? "bg-success" : ""}`} />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-ink-2 leading-relaxed mt-2">
              <input
                type="checkbox"
                required
                className="mt-0.5 w-4 h-4 accent-primary cursor-pointer rounded"
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" className="text-primary hover:underline font-medium">Terms of Service</Link>{" "}
                and acknowledge the{" "}
                <Link to="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>.
                I understand execution events are immutably audited.
              </span>
            </label>

            <button
              className="w-full h-11 bg-primary text-white font-medium text-sm rounded-sm hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-1"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating Organization…" : "Create organization"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            Already have an organization?{" "}
            <Link to="/login" className="text-primary hover:text-primary-hover font-medium underline-offset-2 hover:underline">
              Sign in →
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
