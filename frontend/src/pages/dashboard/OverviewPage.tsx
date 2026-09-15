import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, XCircle, Activity, Server } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { useAgents, useJobs, useRecentAudit } from "../../hooks/useDashboardData";
import type { AuditEntry } from "../../hooks/useDashboardData";

function formatRelative(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: string) {
  if (status === "COMPLETED") return <span className="ic ok"><CheckCircle size={14} /></span>;
  if (status === "FAILED" || status === "TIMEOUT") return <span className="ic err"><XCircle size={14} /></span>;
  return <span className="ic acc"><Activity size={14} /></span>;
}

function buildSparkData(entries: AuditEntry[], now: number) {
  const buckets: Record<number, number> = {};
  for (let i = 23; i >= 0; i--) {
    buckets[i] = 0;
  }
  entries.forEach((e) => {
    const h = Math.floor((now - new Date(e.startedAt).getTime()) / 3_600_000);
    if (h >= 0 && h <= 23) buckets[h] = (buckets[h] || 0) + 1;
  });
  return Object.entries(buckets)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([, v]) => ({ v }));
}

export default function OverviewPage() {
  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const { data: jobs   = [] } = useJobs();
  const { data: recent = [] } = useRecentAudit(20);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineAgents  = agents.filter((a) => a.status !== "offline").length;
  const enabledJobs   = jobs.filter((j) => j.status === "active" || j.enabled).length;
  const execLast24h   = recent.filter((e) => now - new Date(e.startedAt).getTime() < 86_400_000).length;
  const failedLast24h = recent.filter(
    (e) => (e.status === "FAILED" || e.status === "TIMEOUT") &&
      now - new Date(e.startedAt).getTime() < 86_400_000,
  ).length;

  const sparkData = buildSparkData(recent, now);

  const stats = [
    { k: "Online agents",     v: `${onlineAgents} / ${agents.length}`, icon: <Server size={15} />,   delta: onlineAgents === agents.length ? "all connected" : `${agents.length - onlineAgents} offline`, deltaType: onlineAgents === agents.length ? "up" : "down" },
    { k: "Active jobs",       v: String(enabledJobs),                  icon: <Activity size={15} />, delta: `${jobs.length} total`,        deltaType: "up" },
    { k: "Executions (24h)",  v: String(execLast24h),                  icon: <CheckCircle size={15} />, delta: "last 24 hours",             deltaType: "up" },
    { k: "Failures (24h)",    v: String(failedLast24h),                icon: <XCircle size={15} />,  delta: failedLast24h > 0 ? "needs attention" : "clean", deltaType: failedLast24h > 0 ? "down" : "up" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Fleet-wide execution health and recent activity</p>
        </div>
      </div>

      {/* First run: Overview is the landing screen but the emptiest page in the
          product. Without this a new org sees only zeroes and no way forward. */}
      {!agentsLoading && agents.length === 0 && (
        <section
          aria-labelledby="first-run-heading"
          className="bg-surface border border-edge rounded-md p-4 sm:p-6 mb-4"
        >
          <h2 id="first-run-heading" className="text-base font-semibold text-ink mb-1">
            Run your first command
          </h2>
          <p className="text-sm text-ink-2 mb-4 max-w-prose">
            Nothing is connected yet. Two steps and you will have an audited
            execution on a real machine.
          </p>
          <ol className="flex flex-col sm:flex-row gap-3">
            <li className="flex-1 bg-bg border border-edge rounded-sm p-3.5">
              <span className="font-mono text-xs text-muted">Step 1</span>
              <p className="text-sm font-medium text-ink mt-1 mb-2">
                Create an organization API key
              </p>
              <p className="text-xs text-ink-2 mb-3">
                The key authorises a machine to join your fleet. It is shown once.
              </p>
              <Link
                to="/dashboard/settings"
                className="inline-flex items-center justify-center h-8 px-3 rounded-sm text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                Open Settings
              </Link>
            </li>
            <li className="flex-1 bg-bg border border-edge rounded-sm p-3.5">
              <span className="font-mono text-xs text-muted">Step 2</span>
              <p className="text-sm font-medium text-ink mt-1 mb-2">
                Register an agent
              </p>
              <p className="text-xs text-ink-2 mb-3">
                Install the agent on a server, then register it with that key.
              </p>
              <Link
                to="/dashboard/agents"
                className="inline-flex items-center justify-center h-8 px-3 rounded-sm text-xs font-medium border border-edge text-ink hover:bg-surface-2 transition-colors"
              >
                Go to Agents
              </Link>
            </li>
          </ol>
        </section>
      )}

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="panel stat" key={s.k}>
            <div className="k">{s.icon}{s.k}</div>
            <div className="v">{s.v}</div>
            <div className="d">
              <span className={s.deltaType}>{s.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Executions · last 24h</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
                  labelFormatter={() => ""}
                  formatter={(value) => [
                    typeof value === "number" ? value : 0,
                    "executions",
                  ]}
                />
                <Area type="monotone" dataKey="v" stroke="var(--accent)" fill="url(#sparkGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Agents</span>
            <span className="grow" />
            <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>{onlineAgents} online</span>
          </div>
          <div className="feed">
            {agents.slice(0, 5).map((agent) => (
              <div className="feed-item" key={agent._id}>
                <span className={"ic " + (agent.status === "offline" ? "" : "ok")}>
                  <Server size={14} />
                </span>
                <div className="bd">
                  <div className="t"><b>{agent.name}</b></div>
                  <div className="s">{agent.systemInfo?.hostname || "—"} · {agent.status}</div>
                </div>
                <span className="when">{agent.lastSeen ? formatRelative(agent.lastSeen, now) : "—"}</span>
              </div>
            ))}
            {agents.length === 0 && (
              <div style={{ padding: 20, color: "var(--text-faint)", fontSize: "var(--t-sm)", textAlign: "center" }}>
                No agents registered
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Recent activity</span>
            <span className="grow" />
          </div>
          <div className="feed">
            {recent.slice(0, 8).map((entry) => (
              <div className="feed-item" key={entry._id}>
                {statusIcon(entry.status)}
                <div className="bd">
                  <div className="t"><b>{entry.command.slice(0, 48)}{entry.command.length > 48 ? "…" : ""}</b></div>
                  <div className="s">{entry.agentId || "—"} · {entry.triggerType} · {formatDuration(entry.durationMs)}</div>
                </div>
                <span className="when">{formatRelative(entry.startedAt, now)}</span>
              </div>
            ))}
            {recent.length === 0 && (
              <div style={{ padding: 20, color: "var(--text-faint)", fontSize: "var(--t-sm)", textAlign: "center" }}>
                No recent executions
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Single-active leases</span>
          </div>
          <div className="panel-pad">
            <p style={{ fontSize: "var(--t-sm)", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 14 }}>
              Jobs currently owned by a single worker via a Redis{" "}
              <span className="mono">SET NX EX</span> lease. Duplicate workers are rejected until TTL expires.
            </p>
            {jobs.filter((j) => j.status === "active" || j.enabled).slice(0, 2).map((job) => (
              <div className="rb-list-node" style={{ marginBottom: 10 }} key={job._id}>
                <span className="step-no" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>▶</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--t-sm)", color: "var(--text)" }}>{job.name}</div>
                  <div className="dep-line">{job.schedule}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--accent)" }}>active</div>
                  <div className="dep-line">EX 30s</div>
                </div>
              </div>
            ))}
            {jobs.filter((j) => j.status === "active" || j.enabled).length === 0 && (
              <div style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>No active leases</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
