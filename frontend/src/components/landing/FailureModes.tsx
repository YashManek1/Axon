const failureModes = [
  {
    dotClass: "offline",
    title: "Control plane unreachable",
    body: "The agent reconnects with exponential backoff starting at 1 second, capping at 30 seconds. Scheduled jobs that would have fired during the outage queue in Redis. They execute in order when the connection restores. No data loss. No silent failures.",
  },
  {
    dotClass: "busy",
    title: "Agent process killed",
    body: "systemd restarts the agent automatically (Restart=always). Any job mid-execution is marked FAILED with status TIMEOUT in the audit log. The record is preserved — it shows the failure, not silence. The audit trail is never empty.",
  },
  {
    dotClass: "busy",
    title: "Job exceeds timeout",
    body: "Default: 30 seconds per job (configurable per job). On timeout the agent kills the child process, records TIMEOUT as stderr, and reports exit code -1. The audit log captures this. Retries can be configured independently per job.",
  },
  {
    dotClass: "online",
    title: "Two servers enqueue the same job",
    body: "Delivery is at-least-once, not exactly-once — no distributed system can honestly promise the latter. BullMQ deduplicates on a deterministic job ID, so a second enqueue while the first is still pending is dropped at the queue layer. If a duplicate does reach a worker, the fencing token makes the execution a no-op. The guarantee is that the side effect happens once, not that the message arrives once.",
  },
];

export default function FailureModes() {
  return (
    <section className="py-24 border-t border-edge-subtle" id="failure">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">What happens when things go wrong.</h2>
          <p className="text-base text-ink-2 leading-relaxed">We designed Axon assuming the network drops, processes die, and control planes become unreachable. Here's exactly how it behaves.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-7">
          {failureModes.map((mode) => (
            <div className="bg-surface border border-edge rounded-md p-6.5 flex flex-col" key={mode.title}>
              <h3 className="text-base font-semibold text-ink mb-3 flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 inline-block ${
                    mode.dotClass === "online"
                      ? "bg-success animate-pulse"
                      : mode.dotClass === "busy"
                      ? "bg-warning animate-pulse"
                      : "bg-muted"
                  }`}
                />
                {mode.title}
              </h3>
              <p className="text-sm text-ink-2 leading-relaxed">{mode.body}</p>
            </div>
          ))}
        </div>
        <div className="bg-surface border border-l-2 border-l-ink-2 border-edge rounded-md p-6">
          <p className="text-base text-ink leading-relaxed">Axon does not claim to be bug-free. It claims to fail predictably, surface failures clearly, and preserve a record of what happened. Your post-mortem will have answers.</p>
        </div>
      </div>
    </section>
  );
}
