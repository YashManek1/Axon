import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  FileText,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Lock,
  Cpu,
  RefreshCw,
  HardDrive,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AxonBrand from "../components/brand/AxonBrand";
import { useThemeStore } from "../stores/themeStore";
import "./home-page.css";

const walkthrough = [
  ["Task", "Choose one known task.", "Start with a repeatable procedure an owner understands, such as reading a staging version file."],
  ["Review", "Review the command and exact machine.", "See what will be requested and where it is intended to run before anyone confirms it."],
  ["Confirm", "A person confirms the reviewed context.", "Approval is an intentional human decision—not an automatic launch from this page."],
  ["Handoff", "Inspect the recorded result for a handoff.", "Use saved evidence to explain what was requested, where it was aimed, and what was recorded."],
] as const;

const outcomes = {
  success: {
    label: "Success recorded",
    icon: CheckCircle2,
    output: "staging-2026.10.01",
    receipt: "Exit code 0 · Result recorded",
    note: "A command reported success. Review the output before treating the application as healthy.",
  },
  failure: {
    label: "Failure recorded",
    icon: TriangleAlert,
    output: "cat: /srv/example/VERSION: No such file or directory",
    receipt: "Nonzero exit · Result recorded",
    note: "The command reported a failure. The saved output gives the next operator a starting point.",
  },
  unknown: {
    label: "Outcome unknown",
    icon: CircleHelp,
    output: "No conclusive result was recorded.",
    receipt: "UNKNOWN · Check before considering another run",
    note: "The command may have run. Check evidence and the server before considering another run.",
  },
} as const;

const architecturePillars = [
  {
    icon: Lock,
    title: "Zero Inbound Firewall Ports",
    desc: "Agents establish an outbound TLS 1.3 tunnel to the control plane. Eliminates open SSH port 22 and perimeter exposure on host fleets.",
  },
  {
    icon: Cpu,
    title: "Digest-Pinned OCI Sandboxing",
    desc: "Executes commands inside container sandboxes pinned by immutable image SHA256 digests with strict process namespace containment.",
  },
  {
    icon: RefreshCw,
    title: "Monotonic Generation Fencing",
    desc: "Atomic connection generation increments on reconnect. Immediately invalidates zombie worker leases during network partitions.",
  },
  {
    icon: HardDrive,
    title: "ARQP Machine Quiescence",
    desc: "Releasing execution holds on disconnected agents requires an agent reboot, process-tree death verification, and a signed certificate.",
  },
];

const faqs = [
  {
    q: "How does Axon ensure server operations do not accidentally damage production?",
    a: "Axon enforces strict exact-server targeting, digest-pinned container isolation, and a fail-closed execution invariant: if an outcome is ambiguous, it is permanently marked UNKNOWN and never automatically retried.",
  },
  {
    q: "Does Axon require opening inbound firewall ports or sharing SSH keys?",
    a: "No. The agent initiates an outbound WebSocket connection over TLS 1.3 to the control plane. No inbound listening ports, public IP addresses, or distributed private keys are needed.",
  },
  {
    q: "What is the fail-closed UNKNOWN execution state?",
    a: "When a socket disconnects mid-flight or a worker restarts, the system cannot verify whether the command finished. Rather than hazarding a duplicate execution, Axon retains the machine hold until human operator review or ARQP verification.",
  },
  {
    q: "How does the ARQP quiescence protocol work?",
    a: "When an agent reconnects with a newer connection generation, it scans its local OS process table. If all descendant processes are dead, it issues a signed Quiescence Certificate authorizing the backend to safely release the target hold without redispatching.",
  },
  {
    q: "Can Axon run alongside existing CI/CD or infrastructure automation?",
    a: "Yes. Axon is designed specifically for operational runbooks, staging version verifications, and controlled maintenance procedures that require deliberate human confirmation and immutable audit receipts.",
  },
];

export default function HomePage() {
  const { theme, toggle } = useThemeStore();
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<keyof typeof outcomes>("success");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const result = outcomes[outcome];
  const OutcomeIcon = result.icon;

  return (
    <div className="axon-home">
      <a className="ah-skip" href="#main-content">
        Skip to content
      </a>

      {/* Header */}
      <header className="ah-header">
        <AxonBrand className="ah-brand" />
        <nav aria-label="Main navigation">
          <a className="ah-nav-link" href="#workflow">
            Workflow
          </a>
          <a className="ah-nav-link" href="#outcomes">
            Outcomes
          </a>
          <a className="ah-nav-link" href="#architecture">
            Architecture
          </a>
          <a className="ah-nav-link" href="#pricing">
            Pricing
          </a>
          <a className="ah-nav-link" href="#faq">
            FAQ
          </a>
          <button
            className="ah-theme"
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <Link className="ah-signin" to="/login">
            Sign in <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="main-content">
        {/* Hero Section */}
        <section className="ah-hero" aria-labelledby="hero-title">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="ah-hero-copy"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-edge bg-surface text-xs font-mono text-primary mb-5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>01 / REVIEWED SERVER WORK · DETERMINISTIC CONTROL</span>
            </div>

            <h1 id="hero-title">
              The server task.<br />The right machine.<br />A clear handoff.
            </h1>

            <p className="ah-lead">
              Axon gives your team one place to review a Linux server command, confirm where it will run, and inspect the result.
            </p>
            <p className="ah-support">
              For teams turning repeatable checks into a shared way of working.
            </p>

            <div className="ah-hero-actions">
              <a className="ah-button ah-button-primary" href="#workflow">
                Explore the workflow <ArrowRight size={17} aria-hidden="true" />
              </a>
              <Link className="ah-text-link" to="/login">
                Existing user? Sign in <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-edge text-xs text-muted font-mono">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
                Controlled pilot · non-production evaluation
              </span>
              <span className="flex items-center gap-1.5">
                <Lock size={14} className="text-success" aria-hidden="true" />
                Zero Inbound Ports
              </span>
            </div>
          </motion.div>

          {/* Interactive Preview Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
            className="ah-preview"
            aria-label="Illustrative operation review"
          >
            <div className="ah-preview-top">
              <span>Operation review</span>
              <span className="ah-example-label">Example — no command is run</span>
            </div>
            <div className="ah-preview-body">
              <p className="ah-small-label">PURPOSE</p>
              <h2>Check staging application version</h2>
              <p className="ah-preview-description">
                Read the deployed version file on one named staging server. This is not a health check.
              </p>
              <div className="ah-target">
                <Server size={22} aria-hidden="true" />
                <div>
                  <span>Selected server</span>
                  <strong>staging-web-01</strong>
                </div>
                <span className="ah-target-badge">Exact target</span>
              </div>
              <div className="ah-command">
                <span>Command to review</span>
                <code>cat /srv/example/VERSION</code>
              </div>
              <div className="ah-preview-check">
                <ShieldCheck size={18} aria-hidden="true" />
                <p>A person reviews the command and selected server before confirmation.</p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="ah-workflow ah-section" aria-labelledby="workflow-title">
          <div className="ah-section-heading">
            <p className="ah-chapter">02 / A SMALL, EXPLICIT WORKFLOW</p>
            <h2 id="workflow-title">Make the next step obvious.</h2>
            <p>This local walkthrough changes only the explanation below. It never launches a command.</p>
          </div>
          <div className="ah-walkthrough">
            <div className="ah-step-list" role="group" aria-label="Workflow steps">
              {walkthrough.map((item, index) => (
                <button
                  key={item[0]}
                  type="button"
                  aria-pressed={step === index}
                  aria-controls="workflow-explanation"
                  onClick={() => setStep(index)}
                  aria-label={"View " + item[0].toLowerCase() + " step"}
                >
                  <span>0{index + 1}</span>
                  {item[0]}
                </button>
              ))}
            </div>
            <article
              className="ah-step-detail"
              id="workflow-explanation"
              role="region"
              aria-label="Workflow explanation"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="ah-step-number">
                0{step + 1} / {walkthrough[step][0].toUpperCase()}
              </p>
              <h3>{walkthrough[step][1]}</h3>
              <p>{walkthrough[step][2]}</p>
              <p className="ah-local-note">
                <FileText size={16} aria-hidden="true" />
                Illustrative only. No request is sent and no command is run.
              </p>
            </article>
          </div>
        </section>

        {/* Real Scenario Section */}
        <section className="ah-scenario ah-section" aria-labelledby="scenario-title">
          <p className="ah-chapter">03 / THE REAL QUESTION</p>
          <div>
            <h2 id="scenario-title">“Which version is on staging?”</h2>
            <p>
              Axon helps a teammate start with the approved procedure, target it deliberately, and leave enough context for the person who picks it up next. The procedure owner still validates that it is the right check.
            </p>
          </div>
        </section>

        {/* Outcomes Section */}
        <section id="outcomes" className="ah-results ah-section" aria-labelledby="results-title">
          <div className="ah-result-copy">
            <p className="ah-chapter">04 / RESULTS NEED CONTEXT</p>
            <h2 id="results-title">Success, failure, or uncertainty.</h2>
            <p>Those are different states. A useful record keeps the distinction visible for the next decision.</p>
            <p className="ah-result-caption">Explore illustrative outcomes. This example does not run a command.</p>
          </div>
          <div className="ah-result-card">
            <div className="ah-result-options" role="group" aria-label="Example outcome">
              {(Object.keys(outcomes) as (keyof typeof outcomes)[]).map((key) => (
                <button
                  key={key}
                  aria-pressed={outcome === key}
                  onClick={() => setOutcome(key)}
                >
                  {key === "success" ? "Success" : key === "failure" ? "Failure" : "Unknown"}
                </button>
              ))}
            </div>
            <div className={`ah-result-content ah-outcome-${outcome}`} aria-live="polite" aria-atomic="true">
              <div className="ah-result-status">
                <OutcomeIcon size={20} aria-hidden="true" />
                <h3>{result.label}</h3>
              </div>
              <p className="ah-receipt">{result.receipt}</p>
              <pre>{result.output}</pre>
              <p className="ah-result-note">{result.note}</p>
            </div>
          </div>
        </section>

        {/* Architecture & Engineering Deep-Dive */}
        <section id="architecture" className="ah-section" aria-labelledby="arch-title">
          <div className="ah-section-heading">
            <p className="ah-chapter">05 / DETERMINISTIC ARCHITECTURE</p>
            <h2 id="arch-title">Engineered to fail closed.</h2>
            <p>Zero speculative retries. Full cryptographic integrity from control plane to Linux host.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            {architecturePillars.map((p, idx) => {
              const Icon = p.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-lg border border-edge bg-surface hover:border-primary/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                      <Icon size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-ink mb-2">{p.title}</h3>
                    <p className="text-sm text-ink-2 leading-relaxed text-pretty">{p.desc}</p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-edge flex items-center justify-between text-xs font-mono text-muted">
                    <span>Subsystem {idx + 1}</span>
                    <span className="text-success flex items-center gap-1">
                      <Check size={13} /> Active
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Production Proof Stats */}
        <section className="ah-section">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-xl border border-edge bg-surface/60">
            <div className="text-center p-4">
              <div className="text-3xl font-extrabold text-ink font-mono tracking-tight">389</div>
              <div className="text-xs text-muted font-mono uppercase tracking-wider mt-1">Backend Tests Pass</div>
            </div>
            <div className="text-center p-4">
              <div className="text-3xl font-extrabold text-ink font-mono tracking-tight">213</div>
              <div className="text-xs text-muted font-mono uppercase tracking-wider mt-1">Frontend Tests Pass</div>
            </div>
            <div className="text-center p-4">
              <div className="text-3xl font-extrabold text-ink font-mono tracking-tight">175</div>
              <div className="text-xs text-muted font-mono uppercase tracking-wider mt-1">Security Guards Pass</div>
            </div>
            <div className="text-center p-4">
              <div className="text-3xl font-extrabold text-success font-mono tracking-tight">100%</div>
              <div className="text-xs text-muted font-mono uppercase tracking-wider mt-1">Fail-Closed Guarantee</div>
            </div>
          </div>
        </section>

        {/* Pricing / Evaluation Tiers */}
        <section id="pricing" className="ah-section" aria-labelledby="pricing-title">
          <div className="ah-section-heading">
            <p className="ah-chapter">06 / COMMERCIAL EVALUATION</p>
            <h2 id="pricing-title">Simple, transparent deployment.</h2>
            <p>Start with a single procedure or schedule a comprehensive workflow review.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 max-w-4xl mx-auto">
            {/* Tier 1 */}
            <div className="p-8 rounded-xl border border-edge bg-surface flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-primary mb-2">Self-Hosted / Local</div>
                <h3 className="text-2xl font-bold text-ink mb-1">Community Pilot</h3>
                <p className="text-sm text-ink-2 mb-6">Complete source and local compose stack for technical evaluation.</p>
                <div className="text-3xl font-mono font-bold text-ink mb-6">Free <span className="text-xs font-normal text-muted font-ui">/ open evaluation</span></div>
                <ul className="space-y-3 text-sm text-ink-2 mb-8">
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success flex-shrink-0" />
                    <span>Exact-server targeting and execution holds</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success flex-shrink-0" />
                    <span>Digest-pinned Docker sandboxed agent</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success flex-shrink-0" />
                    <span>Immutable attempt journaling & audit receipts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-success flex-shrink-0" />
                    <span>Standard community documentation & guides</span>
                  </li>
                </ul>
              </div>
              <Link
                to="/register"
                className="w-full py-3 rounded-md border border-edge hover:bg-surface-2 text-center text-sm font-medium text-ink transition-colors block"
              >
                Create Free Organization
              </Link>
            </div>

            {/* Tier 2 */}
            <div className="p-8 rounded-xl border-2 border-primary bg-surface flex flex-col justify-between relative shadow-lg">
              <div className="absolute -top-3 right-6 bg-primary text-white text-[11px] font-mono px-3 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={12} />
                <span>Supervised</span>
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-primary mb-2">Single Workflow Assessment</div>
                <h3 className="text-2xl font-bold text-ink mb-1">Architecture & Risk Review</h3>
                <p className="text-sm text-ink-2 mb-6">Hands-on review of one critical Linux procedure before deployment.</p>
                <div className="text-3xl font-mono font-bold text-ink mb-6">₹10,000 <span className="text-xs font-normal text-muted font-ui">($120) / one-time</span></div>
                <ul className="space-y-3 text-sm text-ink-2 mb-8">
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-primary flex-shrink-0" />
                    <span>60-minute interactive operational review</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-primary flex-shrink-0" />
                    <span>Single procedure exact-targeting risk map</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-primary flex-shrink-0" />
                    <span>Fail-closed disaster recovery analysis</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-primary flex-shrink-0" />
                    <span>One-page executive implementation roadmap</span>
                  </li>
                </ul>
              </div>
              <Link
                to="/login"
                className="w-full py-3 rounded-md bg-primary hover:bg-primary-hover text-white text-center text-sm font-medium transition-colors block shadow-sm"
              >
                Book Workflow Assessment
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ Section (AEO Optimized) */}
        <section id="faq" className="ah-section" aria-labelledby="faq-title">
          <div className="ah-section-heading">
            <p className="ah-chapter">07 / FREQUENTLY ASKED QUESTIONS</p>
            <h2 id="faq-title">Clear answers on architecture and safety.</h2>
            <p>Everything you need to know about Axon&apos;s execution model.</p>
          </div>
          <div className="mt-10 max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-edge bg-surface overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-ink text-base hover:text-primary transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      size={18}
                      className={`text-muted transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180 text-primary" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-5 pb-5 text-sm text-ink-2 leading-relaxed border-t border-edge/40 pt-3 text-pretty"
                      >
                        {faq.a}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* Where It Fits Section */}
        <section id="fit" className="ah-boundary ah-section" aria-labelledby="boundary-title">
          <div>
            <p className="ah-chapter">08 / WHERE IT FITS</p>
            <h2 id="boundary-title">Start with a procedure, not a promise.</h2>
          </div>
          <div>
            <p>
              Axon is for Linux teams with a repeatable, bounded procedure and an accountable owner. A controlled non-production evaluation is the current fit; installation and customer validation are still underway.
            </p>
            <p>
              It is not monitoring, incident response, deployment automation, or a substitute for an operator deciding what to do.
            </p>
            <Link className="ah-button ah-button-primary" to="/login">
              Existing user sign in <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* Production Footer */}
      <footer className="ah-footer">
        <div className="flex flex-col gap-2">
          <AxonBrand className="ah-footer-brand" />
          <p className="max-w-md">Review the task. Confirm the target. Inspect what was recorded.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs text-muted">
          <Link to="/security" className="hover:text-ink transition-colors">
            Security Architecture
          </Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink transition-colors">
            Terms of Service
          </Link>
          <a href="#main-content" className="hover:text-ink transition-colors">
            Back to top ↑
          </a>
        </div>
      </footer>
    </div>
  );
}
