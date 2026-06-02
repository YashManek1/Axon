const facts = [
  {
    title: "Heartbeat: every 5s",
    body: "CPU, RAM, hostname sent every 5 seconds. If 3 consecutive heartbeats are missed, the agent is marked offline.",
  },
  {
    title: "Reconnect: 1s → 30s backoff",
    body: "Agent reconnects automatically after any disconnect. Jobs dispatched while offline queue in Redis and execute on reconnect.",
  },
  {
    title: "Immutable audit: 4 locked fields",
    body: "startedAt, jobId, orgId, triggeredBy cannot be modified after creation. Enforced at the Mongoose model layer.",
  },
  {
    title: "Port 443 outbound only",
    body: "The agent never listens for inbound connections. It is a WebSocket client, not a server. IT has nothing to block.",
  },
];

const rustAgents = [
  { name: "Rust Agent A", tech: "prod-us-east", desc: "WebSocket client only" },
  { name: "Rust Agent B", tech: "prod-eu-west", desc: "WebSocket client only" },
  { name: "Rust Agent C", tech: "customer-A",   desc: "WebSocket client only" },
];

export default function Architecture() {
  return (
    <section className="band" id="architecture">
      <div className="wrap">
        <div className="sec-head">
          <h2>The architecture. No black boxes.</h2>
          <p>Engineers don't use infrastructure they can't see inside.</p>
        </div>

        <div className="arch">
          <div className="arch-layer">
            <div className="arch-node">
              <div className="n">Dashboard / UI</div>
              <div className="t">React frontend</div>
              <div className="d">your control surface</div>
            </div>
          </div>
          <div className="arch-conn">↓&nbsp;&nbsp;HTTPS REST + Socket.IO (TLS)</div>
          <div className="arch-layer">
            <div className="arch-node">
              <div className="n">Node.js Control Plane</div>
              <div className="t">Node.js · scheduler</div>
              <div className="d">enqueues + dispatches jobs</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", color: "var(--muted)" }}>←→</div>
            <div className="arch-node">
              <div className="n">Redis / BullMQ</div>
              <div className="t">queue · SETNX lock</div>
              <div className="d">exactly-once + buffer</div>
            </div>
          </div>
          <div className="arch-conn">↓&nbsp;&nbsp;WebSocket — port 443, outbound from agent</div>
          <div className="arch-layer">
            {rustAgents.map((agent) => (
              <div className="arch-node" key={agent.tech}>
                <div className="n">{agent.name}</div>
                <div className="t">{agent.tech}</div>
                <div className="d">{agent.desc}</div>
              </div>
            ))}
          </div>
          <div className="arch-conn" style={{ color: "var(--text-2)", fontFamily: "var(--font-ui)", fontSize: 13, paddingTop: 14 }}>
            Rust · open source · WebSocket client only — never accepts inbound connections.
          </div>
        </div>

        <div className="factgrid">
          {facts.map((fact) => (
            <div className="fact" key={fact.title}>
              <div className="ft">{fact.title}</div>
              <div className="fb">{fact.body}</div>
            </div>
          ))}
        </div>

        <div className="callout">
          <p>The Axon agent is open source. Read the Rust source before you run it on your production servers. It does exactly what this page describes.</p>
          <a href="#" className="btn btn-secondary">View agent source on GitHub →</a>
        </div>
      </div>
    </section>
  );
}
