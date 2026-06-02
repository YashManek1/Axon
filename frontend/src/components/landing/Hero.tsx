import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

const agents = [
  { host: "prod-us-east", cpu: 42, ram: 61 },
  { host: "prod-eu-west", cpu: 28, ram: 47 },
  { host: "customer-A",   cpu: 11, ram: 33 },
];

export default function Hero() {
  const fanLinesRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!fanLinesRef.current) return;
    const fanPaths = fanLinesRef.current.querySelectorAll<SVGPathElement>(".fan");
    fanPaths.forEach((path, index) => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.style.transition = `stroke-dashoffset 0.4s ease ${0.4 + index * 0.2}s`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          path.style.strokeDashoffset = "0";
        })
      );
    });
  }, []);

  return (
    <header className="hero">
      <div className="wrap hero-grid">
        <div>
          <div className="sysbadge">
            <span className="dot online" />
            v1.0 — Generally Available
          </div>
          <h1 className="hero-h">
            One execution.<br />
            Every time.<br />
            Across every server.
          </h1>
          <p className="hero-sub">
            Axon is a distributed execution control plane. Exactly-once job
            scheduling across any number of servers. Remote command execution
            without inbound firewall rules. A tamper-proof audit record written
            before anything runs.
          </p>
          <div className="hero-cta">
            <Link to="/register" className="btn btn-primary">Get started →</Link>
            <a href="#architecture" className="btn btn-secondary">Read the architecture</a>
          </div>
          <p className="hero-note">No inbound ports required. Agent runs on any Linux server.</p>
        </div>

        <div className="diagram">
          <div style={{ textAlign: "center" }}>
            <div className="dlabel">Dashboard / UI</div>
            <svg
              width="100%" height="36" viewBox="0 0 320 36"
              preserveAspectRatio="none"
              style={{ display: "block", margin: "2px 0" }}
            >
              <line x1="160" y1="0" x2="160" y2="36" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
            <div className="dbox">
              <div className="name">Axon Control Plane</div>
              <div className="tech">Node.js · Redis · BullMQ</div>
            </div>

            <svg
              ref={fanLinesRef}
              width="100%" height="72" viewBox="0 0 320 72"
              preserveAspectRatio="none"
              style={{ display: "block", marginTop: "-1px" }}
            >
              <path className="fan" d="M160 0 C160 36, 53 24, 53 72"  stroke="#2563EB" strokeWidth="1.5" fill="none" />
              <path className="fan" d="M160 0 L160 72"                 stroke="#2563EB" strokeWidth="1.5" fill="none" />
              <path className="fan" d="M160 0 C160 36, 267 24, 267 72" stroke="#2563EB" strokeWidth="1.5" fill="none" />
            </svg>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: "-1px" }}>
              {agents.map((agent) => (
                <div key={agent.host}>
                  <div className="agentbox">
                    <div className="ahead">
                      <span className="dot online" />
                      <span className="ahost">{agent.host}</span>
                    </div>
                    <div className="astat">CPU {agent.cpu}%&nbsp;&nbsp;RAM {agent.ram}%</div>
                  </div>
                  <div className="dlabel" style={{ marginTop: 6 }}>Remote machine</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
