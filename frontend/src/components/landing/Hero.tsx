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
    <header className="pt-40 pb-24">
      <div className="max-w-[1200px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-[54fr_46fr] gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-xs text-ink-2 bg-surface border border-edge rounded-sm p-1.5 px-3">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0 inline-block animate-pulse" />
            Open source agent · self-hostable
          </div>
          <h1 className="text-5xl font-bold leading-tight text-ink tracking-tight mt-6">
            One execution.{" "}
            <br />
            Every time.{" "}
            <br />
            Across every server.
          </h1>
          <p className="text-base text-ink-2 max-w-sm leading-relaxed mt-6">
            Axon is a distributed execution control plane. At-least-once scheduling with idempotent execution across any number of servers. Remote command execution
            without inbound firewall rules. A tamper-proof audit record written
            before anything runs.
          </p>
          <div className="flex gap-4 mt-8">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 font-medium h-10 px-4 rounded-sm border border-transparent cursor-pointer transition-all bg-primary text-white hover:bg-primary-hover hover:shadow-[0_0_20px_rgba(37,99,235,0.25)]"
            >
              Get started →
            </Link>
            <a
              href="#architecture"
              className="inline-flex items-center justify-center gap-2 font-medium h-10 px-4 rounded-sm border border-edge text-ink-2 hover:border-primary hover:text-ink transition-all bg-transparent"
            >
              Read the architecture
            </a>
          </div>
          <p className="text-sm text-muted mt-5 font-mono">No inbound ports required. Agent runs on any Linux server.</p>
        </div>

        <div>
          <div className="text-center">
            <div className="font-mono text-xs text-muted">Dashboard / UI</div>
            <svg
              width="100%" height="36" viewBox="0 0 320 36"
              preserveAspectRatio="none"
              style={{ display: "block", margin: "2px 0" }}
            >
              <line x1="160" y1="0" x2="160" y2="36" stroke="var(--color-edge)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
            <div className="bg-surface border border-edge rounded-md p-3 inline-block">
              <div className="font-semibold text-sm text-ink">Axon Control Plane</div>
              <div className="font-mono text-xs text-muted mt-0.5">Node.js · Redis · BullMQ</div>
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

            <div className="grid grid-cols-3 gap-2.5 mt-0">
              {agents.map((agent) => (
                <div key={agent.host}>
                  <div className="bg-surface border border-edge rounded-sm p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success flex-shrink-0 inline-block animate-pulse" />
                      <span className="font-mono text-sm text-ink">{agent.host}</span>
                    </div>
                    <div className="font-mono text-xs text-ink-2 mt-1.5">CPU {agent.cpu}%&nbsp;&nbsp;RAM {agent.ram}%</div>
                  </div>
                  <div className="font-mono text-xs text-muted mt-1.5">Remote machine</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
