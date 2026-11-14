import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Lock, Terminal, Cpu, HardDrive, RefreshCw, Moon, Sun, CheckCircle2 } from "lucide-react";
import AxonBrand from "../../components/brand/AxonBrand";
import { useThemeStore } from "../../stores/themeStore";

export default function SecurityPage() {
  const { theme, toggle } = useThemeStore();

  const securityPillars = [
    {
      icon: Lock,
      title: "Zero Inbound Firewall Ports",
      desc: "Agents establish an outbound-only WebSocket tunnel over TLS 1.3 to the control plane. No public SSH port 22 or inbound listener is ever required on your hosts.",
    },
    {
      icon: Terminal,
      title: "HMAC-SHA256 Signed Envelopes",
      desc: "Every command dispatch is cryptographically signed with bounded deadlines, exact-target UUIDs, and immutable argument schemas. Tampered envelopes fail closed.",
    },
    {
      icon: Cpu,
      title: "Digest-Pinned OCI Sandboxing",
      desc: "Workloads execute inside isolated container runtimes pinned by immutable sha256 digests. Host filesystem mounts and root PID sharing are strictly prohibited.",
    },
    {
      icon: RefreshCw,
      title: "Monotonic Generation Fencing",
      desc: "Each agent reconnect advances an atomic connectionGeneration. Stale worker leases are instantly revoked to prevent duplicate execution during network partitions.",
    },
    {
      icon: HardDrive,
      title: "Immutable Local Attempt Journal",
      desc: "Rust agents maintain an append-only AttemptJournal with crash recovery. Corrupted entries trigger immediate quarantine tombstones, preventing rogue re-executions.",
    },
    {
      icon: ShieldCheck,
      title: "ARQP Quiescence Certification",
      desc: "Holds on disconnected agents can only be released after the agent cold-boots, validates PID/process-group death in the OS table, and issues a signed certificate.",
    },
  ];

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

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12">
        <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest mb-3">
          <ShieldCheck size={14} />
          <span>Security Architecture & Verification</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-ink mb-4 text-balance">
          Enterprise Security Architecture
        </h1>
        <p className="text-base text-ink-2 max-w-2xl mb-10 text-pretty">
          Axon eliminates the inherent hazards of remote SSH execution. Every operation is bounded,
          cryptographically verifiable, and guaranteed to fail closed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {securityPillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-md border border-edge bg-surface hover:border-primary/50 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-base font-bold text-ink mb-2">{p.title}</h3>
                  <p className="text-sm text-ink-2 leading-relaxed text-pretty">{p.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-edge flex items-center gap-1.5 text-xs font-mono text-success">
                  <CheckCircle2 size={13} />
                  <span>Enforced at runtime</span>
                </div>
              </div>
            );
          })}
        </div>

        <section className="p-8 rounded-lg border border-edge bg-surface space-y-6">
          <h2 className="text-2xl font-bold text-ink tracking-tight">The Fail-Closed Execution Invariant</h2>
          <p className="text-sm text-ink-2 leading-relaxed text-pretty">
            In standard automation systems (such as cron jobs or unmonitored scripts), when a server process drops
            or encounters an ambiguous socket failure, retry engines blindly re-dispatch the command. If that command
            modified a database or charged a payment gateway, duplicate effects occur.
          </p>
          <div className="p-4 rounded-md border border-edge bg-surface-2 font-mono text-xs text-ink space-y-2">
            <div className="text-warning font-bold uppercase tracking-wider">Axon Invariant Rule:</div>
            <p className="text-muted leading-relaxed">
              If an execution state is uncertain, it is permanently classified as <strong>UNKNOWN</strong>.
              Automated retries are forbidden. The target server hold is retained until human operator confirmation
              or an ARQP Quiescence Certificate proves that no background process survived.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge bg-surface px-6 py-6 text-center text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-4 max-w-5xl mx-auto w-full">
        <span>© 2026 Axon Control Plane. All rights reserved.</span>
        <div className="flex gap-4">
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
          <Link to="/login" className="hover:text-ink transition-colors">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
