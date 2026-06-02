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
    body: "BullMQ uses an atomic Redis SETNX check against the job ID. Only one enqueue succeeds. The second is dropped at the Redis layer before it reaches a worker. This is not application logic — it is queue semantics enforced by Redis atomicity.",
  },
];

export default function FailureModes() {
  return (
    <section className="band" id="failure">
      <div className="wrap">
        <div className="sec-head">
          <h2>What happens when things go wrong.</h2>
          <p>We designed Axon assuming the network drops, processes die, and control planes become unreachable. Here's exactly how it behaves.</p>
        </div>
        <div className="fmgrid">
          {failureModes.map((mode) => (
            <div className="fm" key={mode.title}>
              <h3>
                <span className={"dot " + mode.dotClass} />
                {mode.title}
              </h3>
              <p>{mode.body}</p>
            </div>
          ))}
        </div>
        <div className="callout" style={{ borderLeftColor: "var(--text-2)" }}>
          <p>Axon does not claim to be bug-free. It claims to fail predictably, surface failures clearly, and preserve a record of what happened. Your post-mortem will have answers.</p>
        </div>
      </div>
    </section>
  );
}
