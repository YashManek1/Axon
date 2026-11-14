import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Lock, Moon, Sun } from "lucide-react";
import AxonBrand from "../../components/brand/AxonBrand";
import { useThemeStore } from "../../stores/themeStore";

export default function PrivacyPolicyPage() {
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
          <Shield size={14} />
          <span>Governance & Compliance</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-4 text-balance">
          Axon Platform Privacy Policy
        </h1>
        <p className="text-sm font-mono text-muted mb-8">
          Effective Date: October 13, 2026 · Schema Version: 1.0.0 · Immutable Audit Model
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-ink-2 leading-relaxed">
          <section className="p-4 rounded-md border border-edge bg-surface">
            <h2 className="text-lg font-bold text-ink mb-2 flex items-center gap-2">
              <Lock size={18} className="text-primary" />
              1. Fundamental Principle: Zero Telemetry Monopolization
            </h2>
            <p className="text-sm text-pretty">
              Axon is engineered as a deterministic execution control plane for Linux systems.
              We do not monetize your data, inject advertising trackers, or train general AI models
              on your command inputs, execution outputs, or server configuration data.
              Your infrastructure operations remain strictly confidential to your organization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">2. Information We Process</h2>
            <p className="text-pretty">
              To operate the control plane and ensure cryptographically verifiable audit trails,
              Axon processes the following categories of data:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>
                <strong>Identity & Account Metadata:</strong> Usernames, work email addresses,
                role assignments (admin, operator, viewer), and organization memberships.
              </li>
              <li>
                <strong>Agent Device Fingerprints:</strong> Persistent hardware UUIDs, agent names,
                assigned IP/hostname hints, connection generation numbers, and cryptographic public keys
                used to sign Quiescence Certificates (ARQP).
              </li>
              <li>
                <strong>Operation & Audit Records:</strong> Command templates, target agent IDs,
                execution approvals, timestamps, exit codes, stdout/stderr byte logs, and terminal summary
                reconciliation entries.
              </li>
              <li>
                <strong>Session Authentication:</strong> Cryptographic JWTs stored in secure,
                HTTP-only, SameSite cookies to protect web control plane access.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. Immutable Audit Trails & Hold Retention</h2>
            <p className="text-pretty">
              Under Axon’s fail-closed architecture, when an execution outcome is marked as <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded border border-edge">UNKNOWN</code>,
              the execution record and its associated target hold are permanently preserved in an immutable state.
              This guarantees that human operators can audit exactly when an anomaly occurred without historical tampering
              or speculative automated retries.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. Network Boundaries & Inbound Ports</h2>
            <p className="text-pretty">
              The Axon agent communicates with the backend control plane via outbound-only TLS/WebSocket connections.
              Axon never requires inbound firewall exceptions or public SSH exposure on your host fleet.
              All credentials, HMAC dispatch keys, and JWT secrets are bounded to your specific deployment environment.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. Data Retention & Tenant Isolation</h2>
            <p className="text-pretty">
              Organizations operate within strictly partitioned database boundaries. Cross-tenant queries are
              prevented by mandatory tenant filtering middleware at the API, worker, and socket layers.
              When an organization is decommissioned, its database records are permanently purged via verified administrative procedures.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Contact & Data Protection Officer</h2>
            <p className="text-pretty">
              For questions regarding security architecture, audit verification, or data handling,
              contact the Axon Security & Compliance team at <a href="mailto:security@axon.local" className="text-primary hover:underline font-mono">security@axon.local</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-edge bg-surface px-6 py-6 text-center text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-4 max-w-4xl mx-auto w-full">
        <span>© 2026 Axon Control Plane. All rights reserved.</span>
        <div className="flex gap-4">
          <Link to="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
          <Link to="/security" className="hover:text-ink transition-colors">Security Architecture</Link>
          <Link to="/login" className="hover:text-ink transition-colors">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
