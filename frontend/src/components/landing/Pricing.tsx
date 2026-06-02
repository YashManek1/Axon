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
    <section className="band">
      <div className="wrap">
        <div className="sec-head" style={{ textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          <h2>Start running jobs the right way.</h2>
        </div>
        <div className="pricegrid">
          <div className="price">
            <h3>Self-hosted</h3>
            <div className="amt">Free</div>
            <p className="desc">Run Axon on your own infrastructure. The agent is open source. The control plane is yours to host.</p>
            <ul>
              {selfHostedFeatures.map((feature) => (
                <li key={feature}><CheckIcon />{feature}</li>
              ))}
            </ul>
            <Link to="/register" className="btn btn-secondary">Install the agent →</Link>
            <div className="code" style={{ marginTop: 14, fontSize: 13 }}>
              <span className="c-prompt">$</span>{" curl -sSL https://install.axon.run | sh"}
            </div>
          </div>

          <div className="price feat">
            <h3 style={{ color: "var(--primary)" }}>Enterprise</h3>
            <div className="amt">Talk to us</div>
            <p className="desc">For teams that need SLA guarantees, SSO, and dedicated support from the people who built it.</p>
            <ul>
              {enterpriseFeatures.map((feature) => (
                <li key={feature}><CheckIcon />{feature}</li>
              ))}
            </ul>
            <a href="#" className="btn btn-primary">Book a call →</a>
          </div>
        </div>
      </div>
    </section>
  );
}
