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
    <section className="py-24 border-t border-edge-subtle" id="architecture">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">The architecture. No black boxes.</h2>
          <p className="text-base text-ink-2 leading-relaxed">Engineers don't use infrastructure they can't see inside.</p>
        </div>

        <div className="bg-surface border border-edge rounded-md p-4 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-4 mb-2">
            <div className="bg-bg border border-edge rounded-sm p-3.5 text-center w-full sm:w-auto sm:min-w-52">
              <div className="font-semibold text-sm text-ink">Dashboard / UI</div>
              <div className="font-mono text-xs text-muted mt-0.5">React frontend</div>
              <div className="text-xs text-ink-2 mt-1">your control surface</div>
            </div>
          </div>
          <div className="text-center text-muted font-mono text-xs py-1.5">↓&nbsp;&nbsp;HTTPS REST + Socket.IO (TLS)</div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-4 mb-2">
            <div className="bg-bg border border-edge rounded-sm p-3.5 text-center w-full sm:w-auto sm:min-w-52">
              <div className="font-semibold text-sm text-ink">Node.js Control Plane</div>
              <div className="font-mono text-xs text-muted mt-0.5">Node.js · scheduler</div>
              <div className="text-xs text-ink-2 mt-1">enqueues + dispatches jobs</div>
            </div>
            <div className="flex items-center text-muted">←→</div>
            <div className="bg-bg border border-edge rounded-sm p-3.5 text-center w-full sm:w-auto sm:min-w-52">
              <div className="font-semibold text-sm text-ink">Redis / BullMQ</div>
              <div className="font-mono text-xs text-muted mt-0.5">queue · SETNX lock</div>
              <div className="text-xs text-ink-2 mt-1">idempotent retries + buffer</div>
            </div>
          </div>
          <div className="text-center text-muted font-mono text-xs py-1.5">↓&nbsp;&nbsp;WebSocket — port 443, outbound from agent</div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-4 mb-2">
            {rustAgents.map((agent) => (
              <div className="bg-bg border border-edge rounded-sm p-3.5 text-center w-full sm:w-auto sm:min-w-52" key={agent.tech}>
                <div className="font-semibold text-sm text-ink">{agent.name}</div>
                <div className="font-mono text-xs text-muted mt-0.5">{agent.tech}</div>
                <div className="text-xs text-ink-2 mt-1">{agent.desc}</div>
              </div>
            ))}
          </div>
          <div className="text-center text-ink-2 font-ui text-sm pt-3.5">
            Rust · open source · WebSocket client only — never accepts inbound connections.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mt-7">
          {facts.map((fact) => (
            <div className="bg-surface border border-edge rounded-md p-4.5" key={fact.title}>
              <div className="font-mono text-sm text-primary mb-2">{fact.title}</div>
              <div className="text-sm text-ink-2 leading-relaxed">{fact.body}</div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-l-2 border-l-primary border-edge rounded-md p-6 mt-7 flex items-center justify-between gap-6 flex-wrap">
          <p className="text-base text-ink max-w-2xl leading-relaxed">The Axon agent is open source. Read the Rust source before you run it on your production servers. It does exactly what this page describes.</p>
          <a href="#" className="inline-flex items-center justify-center gap-2 font-medium h-10 px-4 rounded-sm border border-edge text-ink-2 hover:border-primary hover:text-ink transition-all bg-transparent flex-shrink-0">View agent source on GitHub →</a>
        </div>
      </div>
    </section>
  );
}
