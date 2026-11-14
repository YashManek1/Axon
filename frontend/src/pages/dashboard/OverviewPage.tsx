import { Link } from "react-router-dom";
import { Activity, ArrowRight, Server, ShieldAlert } from "lucide-react";
import { useAgents, useJobs, useRecentAudit } from "../../hooks/useDashboardData";
import { useAuthStore } from "../../stores/authStore";

function formatRelative(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function isPermissionError(error: unknown): boolean {
  const response = error as { response?: { status?: number }; status?: number } | undefined;
  return response?.response?.status === 401 || response?.response?.status === 403 || response?.status === 401 || response?.status === 403;
}

function QueryNotice({ error, hasData, noun }: { error: unknown; hasData: boolean; noun: string }) {
  if (!error) return null;
  const message = isPermissionError(error)
    ? `You do not have permission to view ${noun}. Ask an administrator for access.`
    : hasData ? `The latest ${noun} could not be refreshed. Showing the last available records.`
      : `${noun[0].toUpperCase() + noun.slice(1)} are unavailable right now. Try again when the control plane is reachable.`;
  return <div className="banner warn" role="alert"><ShieldAlert size={17} /><span>{message}</span></div>;
}

export default function OverviewPage() {
  const agentsQuery = useAgents();
  const jobsQuery = useJobs();
  const recentQuery = useRecentAudit(20);
  const { user } = useAuthStore();
  const agents = agentsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const recent = recentQuery.data ?? [];
  const agentsUnavailable = Boolean(agentsQuery.error) && agents.length === 0;
  const jobsUnavailable = Boolean(jobsQuery.error) && jobs.length === 0;
  const recentUnavailable = Boolean(recentQuery.error) && recent.length === 0;
  const connectedServers = agents.filter((agent) => agent.status === "online").length;
  const enabledOperations = jobs.filter((job) => job.enabled).length;
  const isAdmin = user?.role === "admin";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Controlled non-production use</p>
          <h1>Workspace</h1>
          <p>Review connected servers and approved operations before you dispatch anything.</p>
        </div>
        <div className="actions">
          {isAdmin ? <Link className="btn btn-primary btn-sm" to="/dashboard/agents"><Server size={14} /> Register a server</Link> : <Link className="btn btn-primary btn-sm" to="/dashboard/jobs"><Activity size={14} /> Review operations</Link>}
        </div>
      </div>

      <QueryNotice error={agentsQuery.error} hasData={agents.length > 0} noun="server records" />
      <QueryNotice error={jobsQuery.error} hasData={jobs.length > 0} noun="operation records" />
      <QueryNotice error={recentQuery.error} hasData={recent.length > 0} noun="recent execution records" />

      {/* First run: Overview is the landing screen but the emptiest page in the
          product. Without this a new org sees only zeroes and no way forward. */}
      {!agentsQuery.isLoading && agents.length === 0 && !agentsQuery.error && (
        <section
          aria-labelledby="first-run-heading"
          className="bg-surface border border-edge rounded-md p-4 sm:p-6 mb-4"
        >
          <h2 id="first-run-heading" className="text-base font-semibold text-ink mb-1">
            No servers are registered
          </h2>
          <p className="text-sm text-ink-2 mb-4 max-w-prose">
            {isAdmin ? "Register a non-production server using your configured environment’s setup instructions. Registration does not dispatch an operation." : "An administrator can register a server. You can review operations when one is available."}
          </p>
          {isAdmin && <Link to="/dashboard/agents" className="btn btn-primary btn-sm">Register a server <ArrowRight size={14} /></Link>}
        </section>
      )}

      <div className="stat-grid" aria-label={agentsUnavailable || jobsUnavailable || recentUnavailable ? "Workspace records with unavailable data" : "Loaded workspace records"}>
        <div className="panel stat"><div className="k"><Server size={15} />Connected servers</div><div className="v">{agentsQuery.isLoading || agentsUnavailable ? "—" : connectedServers}</div><div className="d">{agentsUnavailable ? "server records unavailable" : `of ${agents.length} loaded server records`}</div></div>
        <div className="panel stat"><div className="k"><Activity size={15} />Enabled operations</div><div className="v">{jobsQuery.isLoading || jobsUnavailable ? "—" : enabledOperations}</div><div className="d">{jobsUnavailable ? "operation records unavailable" : `of ${jobs.length} loaded operations`}</div></div>
        <div className="panel stat"><div className="k"><Activity size={15} />Recent records</div><div className="v">{recentQuery.isLoading || recentUnavailable ? "—" : recent.length}</div><div className="d">{recentUnavailable ? "recent records unavailable" : "up to 20 most recent records"}</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Recent records</span>
            <span className="grow" />
            <Link className="link" to="/dashboard/audit">View audit log</Link>
          </div>
          <div className="feed">
            {recentQuery.isLoading && <div className="empty-list" role="status" aria-label="Loading recent execution records">Loading recent execution records…</div>}
            {recent.slice(0, 5).map((entry) => (
              <div className="feed-item" key={entry._id}>
                <span className="dot neutral" aria-hidden="true" />
                <div className="bd"><div className="t"><b>{entry.command.slice(0, 48)}{entry.command.length > 48 ? "…" : ""}</b></div><div className="s">{entry.agentId || "Target not reported"} · {entry.outcome || entry.status || "UNKNOWN"}</div></div>
                <span className="when">{formatRelative(entry.startedAt)}</span>
              </div>
            ))}
            {!recentQuery.isLoading && recent.length === 0 && !recentQuery.error && <div className="empty-list">No recent execution records are available.</div>}
            {!recentQuery.isLoading && recent.length === 0 && recentQuery.error && <div className="empty-list">Recent execution records are unavailable.</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Servers</span>
            <span className="grow" />
            <Link className="link" to="/dashboard/agents">View servers</Link>
          </div>
          <div className="feed">
            {agentsQuery.isLoading && <div className="empty-list" role="status" aria-label="Loading server records">Loading server records…</div>}
            {agents.slice(0, 5).map((agent) => (
              <div className="feed-item" key={agent._id}>
                <span className={`dot ${agent.status === "online" ? "online" : agent.status === "offline" ? "offline" : "busy"}`} />
                <div className="bd">
                  <div className="t"><b>{agent.name}</b></div>
                  <div className="s">{agent.systemInfo?.hostname || "Not reported"} · {agent.status === "online" ? "connected" : agent.status === "offline" ? "connection unavailable" : "status not confirmed"}</div>
                </div>
                <span className="when">{agent.lastSeen ? `reported ${formatRelative(agent.lastSeen)}` : "not reported"}</span>
              </div>
            ))}
            {!agentsQuery.isLoading && agents.length === 0 && !agentsQuery.error && (
              <div style={{ padding: 20, color: "var(--text-faint)", fontSize: "var(--t-sm)", textAlign: "center" }}>
                No server records are available
              </div>
            )}
            {!agentsQuery.isLoading && agents.length === 0 && agentsQuery.error && <div className="empty-list">Server records are unavailable.</div>}
          </div>
        </div>
      </div>

    </>
  );
}
