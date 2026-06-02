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
    <div className="problem">
      <div className="half incident">
        <div className="eyebrow lab-incident">The Incident</div>
        <div className="phead">{incidentTitle}</div>
        <p className="pbody narr">{incidentBody}</p>
      </div>
      <div className="half solution">
        <div className="eyebrow lab-solution">What Axon Does</div>
        <div className="phead">{solutionTitle}</div>
        <p className="pbody">{solutionBody}</p>
        <div className="code" style={{ fontSize: 11 }}>{code}</div>
      </div>
      <div className="pnum" aria-hidden="true">{number}</div>
    </div>
  );
}

export default function FourProblems() {
  return (
    <section className="band">
      <div className="wrap">
        <div className="sec-head">
          <h2>Four production failures that happen at scale.</h2>
          <p>Every engineering team hits these. Most have no systematic fix.</p>
        </div>

        <ProblemCard
          number="01"
          incidentTitle="The billing cron ran 4 times. Three customers got double-charged."
          incidentBody="It was 12:04am. Your billing service had been scaled to 4 replicas during a traffic spike three days earlier. Nobody touched the cron config. Standard unix cron ran independently on each server. By the time on-call woke up, 3 customers had been charged twice and one had been charged four times. $12,400 in erroneous charges. Six hours of incident response. An RCA that said 'improve cron coordination' but didn't say how."
          solutionTitle="One queue. One execution. Atomic Redis locking at the queue layer."
          solutionBody={<>Every job enqueues into a Redis-backed BullMQ queue with a deterministic, content-addressed job ID. Even if 100 servers enqueue the same job simultaneously, an atomic Redis <span className="mono">SETNX</span> guarantees exactly one executes. A second enqueue before the first completes is dropped at the Redis level — not by application code. The job ID survives server restarts; retries use exponential backoff.</>}
          code={<><span className="c-comment">{"// BullMQ enforces exactly-once by job ID."}{"\n"}{"// Second enqueue before first completes → dropped."}</span>{"\n"}<span className="c-key">jobId</span>{": "}<span className="c-str">"billing:nightly:2024-01-15"</span>{"\n"}<span className="c-key">queue</span>{": "}<span className="c-str">"scheduled-jobs"</span>{"   "}<span className="c-comment">{"// Redis-backed"}</span>{"\n"}<span className="c-key">lock</span>{"  SETNX              "}<span className="c-comment">{"// atomic, survives restart"}</span></>}
        />

        <ProblemCard
          number="02"
          incidentTitle="IT blocked SSH. The enterprise deal has been stalled for 5 months."
          incidentBody="Your largest enterprise prospect has 200 engineers and a strict IT policy: no inbound connections to their servers. Every time something breaks in their environment, your support team waits 2–3 weeks for a firewall exception that IT eventually denies. You've been trying to close this account for 5 months. Your sales team is blaming your infra team. The CTO is losing patience."
          solutionTitle="Agent dials out on port 443. IT cannot object to HTTPS."
          solutionBody="The Axon agent is a Rust binary that installs on the customer machine and dials out to the control plane over port 443 — the same port as HTTPS. No inbound ports, no VPN, no firewall changes. It holds a persistent WebSocket over TLS, reconnecting with exponential backoff (1s → 30s). Jobs dispatched while offline queue in Redis and run on reconnect. The agent is open source — read every line of Rust first."
          code={<><span className="c-comment">{"# 2-minute install. No inbound ports."}</span>{"\n"}<span className="c-prompt">$</span>{" curl -sSL https://install.axon.run | sh\n"}<span className="c-prompt">$</span>{" AGENT_ID=ag_01H... AGENT_API_KEY=axk_... \\\n  axon-agent start\n\n"}<span className="c-comment">{"# Dials out on port 443. Reconnects automatically.\n# Open source. Read the code before you run it."}</span></>}
        />

        <ProblemCard
          number="03"
          incidentTitle="The auditor asked who ran the migration. Nobody could answer."
          incidentBody="Your startup just failed its SOC2 Type II audit. The auditor asked: 'Who ran the database migration at 2:17am on March 3rd, and what did it produce?' You had 8 engineers with root SSH access. Server logs were rotated after 7 days. Three of those engineers had left the company. You couldn't answer the question. The enterprise deal — 18 months of pipeline, $480k ARR — fell through."
          solutionTitle="Immutable audit record written before execution begins."
          solutionBody={<>Before every execution, Axon writes an AuditLog: who triggered it (user ID, IP, user agent), the command, the targeted agent, and start time to the millisecond. After completion it records exit code, stdout/stderr summary, and duration. The fields <span className="mono">startedAt</span>, <span className="mono">jobId</span>, <span className="mono">orgId</span>, <span className="mono">triggeredBy</span> are immutable — a Mongoose pre-save hook rejects any update. This satisfies SOC2, ISO 27001 and HIPAA audit controls.</>}
          code={<><span className="c-comment">{"// Written BEFORE execution starts. Fields immutable."}</span>{"\n{\n  "}<span className="c-key">triggeredBy</span>{": { userId, ipAddress, userAgent },\n  "}<span className="c-key">command</span>{":     "}<span className="c-str">{"\"pg_dump prod | gzip > /backups/...\""}</span>{",\n  "}<span className="c-key">startedAt</span>{":   "}<span className="c-str">"2024-03-03T02:17:00.000Z"</span>{"  "}<span className="c-comment">{"// locked"}</span>{",\n  "}<span className="c-key">exitCode</span>{":    0,                          "}<span className="c-comment">{"// locked after"}</span>{"\n}"}</>}
        />

        <ProblemCard
          number="04"
          incidentTitle="One SSH session to fix one thing turned into 9 undocumented changes."
          incidentBody="You gave your newest engineer production SSH access at 9am to fix one service restart. By noon, they'd fixed the restart, upgraded 3 packages, changed an nginx config file, and modified a cron entry. They didn't tell anyone. You found out on Thursday when something completely unrelated broke and git blame pointed to a config file nobody remembered touching. The post-mortem had no answers because there was no record."
          solutionTitle="Jobs replace shell access. Pre-approved commands only."
          solutionBody="Engineers don't get a shell — they get Jobs: named, pre-approved command payloads defined by someone with access. A junior engineer can trigger 'Restart API Service.' They cannot run anything else. The command, agent, output, and identity are logged immutably before execution. DAG-based job chaining lets complex workflows run as atomic units."
          code={<><span className="c-comment">{"# Engineers run named, pre-approved commands.\n# No shell. No SSH. No surprises. Everything logged.\n\n"}</span><span className="c-prompt">$</span>{" axon run "}<span className="c-str">"Restart API Service"</span>{" --agent prod-us-east\n"}<span className="c-ok">✓</span>{" dispatched → prod-us-east\n"}<span className="c-ok">✓</span>{" AuditLog #al_01H... written\n→ exit 0 in 0.8s"}</>}
        />
      </div>
    </section>
  );
}
