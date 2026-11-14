import { Link } from "react-router-dom";

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

const selfHostedFeatures = [
  "Unlimited agents",
  "Unlimited jobs",
  "Full audit log, immutable",
  "Real-time log streaming",
  "DAG job dependencies",
  "Community support",
];

const enterpriseFeatures = [
  "Everything in self-hosted",
  "SOC2 Type II documentation",
  "SSO / SAML integration",
  "Dedicated Slack support channel",
  "SLA guarantee (99.9% uptime)",
  "Custom retention policies",
];

export default function Pricing() {
  return (
    <section className="py-24 border-t border-edge-subtle">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">Start running jobs the right way.</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="bg-surface border border-edge rounded-md p-9 flex flex-col">
            <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-4">Self-hosted</h3>
            <div className="text-5xl font-bold text-ink mb-1.5">Free</div>
            <p className="text-sm text-ink-2 leading-relaxed mb-6 min-h-16">Run Axon on your own infrastructure. The agent is open source. The control plane is yours to host.</p>
            <ul className="space-y-1.75 mb-6 flex-grow">
              {selfHostedFeatures.map((feature) => (
                <li key={feature} className="text-sm text-ink-2 flex items-center gap-2.5">
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 font-medium h-10 px-4 rounded-sm border border-edge text-ink-2 hover:border-primary hover:text-ink transition-all bg-transparent w-full mb-3.5"
            >
              Install the agent →
            </Link>
            <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto">
              <span className="text-info">$</span>{" curl -sSL https://install.axon.run | sh"}
            </div>
          </div>

          <div className="bg-surface border-2 border-primary rounded-md p-9 flex flex-col">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">Enterprise</h3>
            <div className="text-5xl font-bold text-ink mb-1.5">Talk to us</div>
            <p className="text-sm text-ink-2 leading-relaxed mb-6 min-h-16">For teams that need SLA guarantees, SSO, and dedicated support from the people who built it.</p>
            <ul className="space-y-1.75 mb-6 flex-grow">
              {enterpriseFeatures.map((feature) => (
                <li key={feature} className="text-sm text-ink-2 flex items-center gap-2.5">
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 font-medium h-10 px-4 rounded-sm border border-transparent cursor-pointer transition-all bg-primary text-white hover:bg-primary-hover hover:shadow-[0_0_20px_rgba(37,99,235,0.25)] w-full"
            >
              Book a call →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
