import type { ReactNode } from "react";

interface ProblemCardProps {
  incidentTitle: string;
  incidentBody: string;
  solutionTitle: string;
  solutionBody: ReactNode;
  code: ReactNode;
  number: string;
}

function ProblemCard({ incidentTitle, incidentBody, solutionTitle, solutionBody, code, number }: ProblemCardProps) {
  return (
    <div className="bg-surface border border-edge rounded-md mb-5 relative overflow-hidden grid grid-cols-1 lg:grid-cols-2">
      <div className="p-8 relative z-10 border-l-2 border-danger/30">
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-danger/55 mb-3">The Incident</div>
        <div className="text-base font-semibold text-ink mb-3 leading-tight">{incidentTitle}</div>
        <p className="text-sm text-ink-2 leading-relaxed">{incidentBody}</p>
      </div>
      <div className="p-8 relative z-10 border-l-2 border-primary/30 bg-[rgba(13,24,41,0.4)]">
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-primary/60 mb-3">What Axon Does</div>
        <div className="text-base font-semibold text-ink mb-3 leading-tight">{solutionTitle}</div>
        <p className="text-sm text-ink-2 leading-relaxed mb-4">{solutionBody}</p>
        <div className="bg-term-bg border border-edge rounded-sm p-4 font-mono text-xs text-ink-2 leading-relaxed overflow-x-auto">{code}</div>
      </div>
      <div className="absolute bottom-[-18px] right-2 text-8xl font-bold text-edge leading-none select-none z-0">{number}</div>
    </div>
  );
}

export default function FourProblems() {
  return (
    <section className="py-24 border-t border-edge-subtle">
      <div className="max-w-[1200px] mx-auto px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-bold text-ink tracking-tight mb-3 leading-tight">Four production failures that happen at scale.</h2>
          <p className="text-base text-ink-2 leading-relaxed">Every engineering team hits these. Most have no systematic fix.</p>
        </div>

        <ProblemCard
          number="01"
          incidentTitle="The billing cron ran 4 times. Three customers got double-charged."
          incidentBody="It was 12:04am. Your billing service had been scaled to 4 replicas during a traffic spike three days earlier. Nobody touched the cron config. Standard unix cron ran independently on each server. By the time on-call woke up, 3 customers had been charged twice and one had been charged four times. $12,400 in erroneous charges. Six hours of incident response. An RCA that said 'improve cron coordination' but didn't say how."
          solutionTitle="One queue. At-least-once delivery. Idempotent execution via fencing tokens."
          solutionBody={<>Every job enqueues into a Redis-backed BullMQ queue with a deterministic, content-addressed job ID. Even if 100 servers enqueue the same job simultaneously, at-least-once delivery with idempotent execution — a fencing token makes duplicate execution a no-op. A second enqueue before the first completes is dropped at the queue layer; the fencing token ensures late arrivals are harmless. The job ID survives server restarts; retries use exponential backoff.</>}
          code={<><span className="text-muted">{"// At-least-once delivery; fencing token makes duplicates a no-op."}{"\n"}{"// Second enqueue before first completes → dropped at queue layer."}</span>{"\n"}<span className="text-primary">jobId</span>{": "}<span className="text-success">"billing:nightly:2024-01-15"</span>{"\n"}<span className="text-primary">queue</span>{": "}<span className="text-success">"scheduled-jobs"</span>{"   "}<span className="text-muted">{"// Redis-backed"}</span>{"\n"}<span className="text-primary">lock</span>{"  fencingToken       "}<span className="text-muted">{"// idempotent, survives restart"}</span></>}
        />

        <ProblemCard
          number="02"
          incidentTitle="IT blocked SSH. The enterprise deal has been stalled for 5 months."
          incidentBody="Your largest enterprise prospect has 200 engineers and a strict IT policy: no inbound connections to their servers. Every time something breaks in their environment, your support team waits 2–3 weeks for a firewall exception that IT eventually denies. You've been trying to close this account for 5 months. Your sales team is blaming your infra team. The CTO is losing patience."
          solutionTitle="Agent dials out on port 443. IT cannot object to HTTPS."
          solutionBody="The Axon agent is a Rust binary that installs on the customer machine and dials out to the control plane over port 443 — the same port as HTTPS. No inbound ports, no VPN, no firewall changes. It holds a persistent WebSocket over TLS, reconnecting with exponential backoff (1s → 30s). Jobs dispatched while offline queue in Redis and run on reconnect. The agent is open source — read every line of Rust first."
          code={<><span className="text-muted">{"# 2-minute install. No inbound ports."}</span>{"\n"}<span className="text-info">$</span>{" curl -sSL https://install.axon.run | sh\n"}<span className="text-info">$</span>{" AGENT_ID=ag_01H... AGENT_API_KEY=axk_... \\\n  axon-agent start\n\n"}<span className="text-muted">{"# Dials out on port 443. Reconnects automatically.\n# Open source. Read the code before you run it."}</span></>}
        />

        <ProblemCard
          number="03"
          incidentTitle="The auditor asked who ran the migration. Nobody could answer."
          incidentBody="Your startup just failed its SOC2 Type II audit. The auditor asked: 'Who ran the database migration at 2:17am on March 3rd, and what did it produce?' You had 8 engineers with root SSH access. Server logs were rotated after 7 days. Three of those engineers had left the company. You couldn't answer the question. The enterprise deal — 18 months of pipeline, $480k ARR — fell through."
          solutionTitle="Immutable audit record written before execution begins."
          solutionBody={<>Before every execution, Axon writes an AuditLog: who triggered it (user ID, IP, user agent), the command, the targeted agent, and start time to the millisecond. After completion it records exit code, stdout/stderr summary, and duration. Immutable fields are hash-chained — any post-write modification breaks the verifiable chain. This gives you the execution evidence auditors ask for under SOC 2, ISO 27001 and HIPAA — a verifiable record of who ran what, when, and what it produced.</>}
          code={<><span className="text-muted">{"// Written BEFORE execution starts. Fields hash-chained."}</span>{"\n{\n  "}<span className="text-primary">triggeredBy</span>{": { userId, ipAddress, userAgent },\n  "}<span className="text-primary">command</span>{":     "}<span className="text-success">{"\"pg_dump prod | gzip > /backups/...\""}</span>{",\n  "}<span className="text-primary">startedAt</span>{":   "}<span className="text-success">"2024-03-03T02:17:00.000Z"</span>{"  "}<span className="text-muted">{"// locked"}</span>{",\n  "}<span className="text-primary">exitCode</span>{":    0,                          "}<span className="text-muted">{"// locked after"}</span>{"\n}"}</>}
        />

        <ProblemCard
          number="04"
          incidentTitle="One SSH session to fix one thing turned into 9 undocumented changes."
          incidentBody="You gave your newest engineer production SSH access at 9am to fix one service restart. By noon, they'd fixed the restart, upgraded 3 packages, changed an nginx config file, and modified a cron entry. They didn't tell anyone. You found out on Thursday when something completely unrelated broke and git blame pointed to a config file nobody remembered touching. The post-mortem had no answers because there was no record."
          solutionTitle="HMAC-signed dispatch. Agents optionally enforce a command allowlist."
          solutionBody="Dispatched payloads are HMAC-signed; agents optionally enforce a local command allowlist. A junior engineer can trigger 'Restart API Service.' The signed payload guarantees the command wasn't tampered with in transit. The command, agent, output, and identity are logged immutably before execution. DAG-based job chaining lets complex workflows run as atomic units."
          code={<><span className="text-muted">{"# Dispatched payloads are HMAC-signed.\n# Agents optionally verify against a local command allowlist.\n\n"}</span><span className="text-info">$</span>{" axon run "}<span className="text-success">"Restart API Service"</span>{" --agent prod-us-east\n"}<span className="text-success">✓</span>{" dispatched → prod-us-east\n"}<span className="text-success">✓</span>{" AuditLog #al_01H... written\n→ exit 0 in 0.8s"}</>}
        />
      </div>
    </section>
  );
}
