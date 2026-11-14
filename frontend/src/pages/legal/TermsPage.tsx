import { Link } from "react-router-dom";
import { ArrowLeft, Scale, CheckSquare, AlertTriangle, Moon, Sun } from "lucide-react";
import AxonBrand from "../../components/brand/AxonBrand";
import { useThemeStore } from "../../stores/themeStore";

export default function TermsPage() {
  const { theme, toggle } = useThemeStore();

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-ui antialiased">
      <header className="border-b border-edge bg-surface/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <AxonBrand />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={14} /> Back to Overview
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="p-1.5 rounded-sm border border-edge hover:bg-surface-2 transition-colors text-ink"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link
            to="/login"
            className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest mb-3">
          <Scale size={14} />
          <span>Legal Agreement</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-4 text-balance">
          Axon Terms of Service & Pilot Agreement
        </h1>
        <p className="text-sm font-mono text-muted mb-8">
          Version 1.0.0 · Effective October 2026 · Fail-Closed Operating Model
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-ink-2 leading-relaxed">
          <section className="p-4 rounded-md border border-edge bg-surface">
            <h2 className="text-lg font-bold text-ink mb-2 flex items-center gap-2">
              <CheckSquare size={18} className="text-primary" />
              1. Acceptance of Terms
            </h2>
            <p className="text-sm text-pretty">
              By deploying an Axon agent, configuring an organization, or accessing the Axon control plane,
              you agree to be bound by these Terms of Service. If you are operating Axon on behalf of an
              entity or company, you represent that you possess lawful authority to bind that organization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">2. Permitted Use & Exact-Machine Accountability</h2>
            <p className="text-pretty">
              Axon is designed for controlled, audited execution across Linux servers. You agree that:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>
                You will only install agents on hosts and instances that your organization owns or is expressly authorized to manage.
              </li>
              <li>
                You will maintain explicit, reviewed command allowlists and enforce exact-server targeting before confirming runs.
              </li>
              <li>
                You will not use Axon for unauthorized intrusion, denial of service, cryptomining, or malicious exploitation.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. Human Review & Fail-Closed Invariants</h2>
            <p className="text-pretty">
              Axon enforces intentional human approval. When a command execution result cannot be conclusively verified
              (e.g., due to an agent process crash, network partition, or lease expiration), the system marks the run as
              <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded border border-edge"> UNKNOWN</code> and refuses to automatically re-dispatch.
              You acknowledge that human operator review is required before releasing holds on uncertain targets.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              4. Disclaimer of Warranties
            </h2>
            <p className="text-pretty text-sm">
              Axon is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranty of any kind, express or implied.
              While Axon utilizes digest-pinned containers, monotonic connection fencing, and cryptographic attempt journals,
              the ultimate responsibility for the safety and consequences of executed shell commands rests with the operator
              confirming the execution.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. Limitation of Liability</h2>
            <p className="text-pretty text-sm">
              To the maximum extent permitted by applicable law, Axon and its contributors shall not be liable for any indirect,
              incidental, consequential, special, or exemplary damages, including loss of data, production downtime, or business interruption,
              arising out of or in connection with the use of the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Modifications & Termination</h2>
            <p className="text-pretty text-sm">
              We reserve the right to modify these terms to reflect architectural, security, or regulatory changes.
              Your continued use of the platform following any modifications constitutes acceptance of the revised terms.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-edge bg-surface px-6 py-6 text-center text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-4 max-w-4xl mx-auto w-full">
        <span>© 2026 Axon Control Plane. All rights reserved.</span>
        <div className="flex gap-4">
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <Link to="/security" className="hover:text-ink transition-colors">Security Architecture</Link>
          <Link to="/login" className="hover:text-ink transition-colors">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
