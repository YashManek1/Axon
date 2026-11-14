import { Link } from "react-router-dom";
import { useState } from "react";
import { Plus, Key, Trash2, WifiOff } from "lucide-react";
import { useAgents } from "../../hooks/useDashboardData";
import { agentsAPI } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentData } from "../../hooks/useDashboardData";
import { track } from "@vercel/analytics";

function meterClass(pct: number): string {
  if (pct > 90) return "err";
  if (pct >= 75) return "warn";
  return "ok";
}

function AgentCard({ agent }: { agent: AgentData }) {
  const si      = agent.systemInfo || {};
  const ramPct  = si.ramTotal && typeof si.ramUsed === "number" ? Math.round((si.ramUsed / si.ramTotal) * 100) : null;
  const cpuPct  = typeof si.cpuLoad === "number" ? Math.round(si.cpuLoad) : null;
  const online  = agent.status === "online";
  const lastSeen = agent.lastSeen
    ? new Date(agent.lastSeen).toLocaleTimeString()
    : "Not reported";

  return (
    <div className="panel agent-card" style={{ opacity: agent.status === "offline" ? 0.78 : 1 }}>
      <div className="top">
        <span
          className="live-dot"
          style={!online ? { background: "var(--text-faint)" } : undefined}
        />
        <span className="nm">{agent.name}</span>
        <span className="pill" style={{ marginLeft: "auto", fontSize: 10 }}>
          {agent.status}
        </span>
      </div>
      <div className="meta">{si.hostname || "Not reported"} · {si.os || "Not reported"} · {si.arch || "Not reported"}</div>
      <div className="meta" style={{ marginTop: -8 }}>last reported {lastSeen}</div>

      <div className="bars">
        <div className="agent-metric">
          <div className="ml">CPU</div>
          <div className="mv">{cpuPct === null ? "Not reported" : `${cpuPct}%`}</div>
          {cpuPct !== null && <div className="meter"><i className={meterClass(cpuPct)} style={{ width: `${cpuPct}%` }} /></div>}
        </div>
        <div className="agent-metric">
          <div className="ml">RAM</div>
          <div className="mv">{ramPct === null ? "Not reported" : `${si.ramUsed?.toFixed(1)} / ${si.ramTotal} GB`}</div>
          {ramPct !== null && <div className="meter"><i className={meterClass(ramPct)} style={{ width: `${ramPct}%` }} /></div>}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const agentsQuery = useAgents();
  const agents = agentsQuery.data ?? [];
  const { user }      = useAuthStore();
  const queryClient   = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [hwUuid,    setHwUuid]    = useState("");
  const [orgApiKey, setOrgApiKey] = useState("");
  const [registering, setRegistering] = useState(false);

  const offlineCount = agents.filter((a) => a.status === "offline").length;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      await agentsAPI.register({ name: agentName, hardwareUuid: hwUuid }, orgApiKey);
      toast.success("Agent registered", agentName);
      track("agent_registered");
      setShowForm(false);
      setAgentName(""); setHwUuid(""); setOrgApiKey("");
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Registration failed";
      toast.error("Failed", msg);
    } finally {
      setRegistering(false);
    }
  };

  const handleDecommission = async (id: string, name: string) => {
    try {
      await agentsAPI.decommission(id);
      toast.success("Decommissioned", name);
      track("agent_decommissioned");
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch {
      toast.error("Failed", "Could not decommission agent");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Servers</h1>
          <p>Review registered server records and their most recently reported telemetry.</p>
        </div>
        <div className="actions">
          {user?.role === "admin" && <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> Register a server
          </button>}
        </div>
      </div>

      {offlineCount > 0 && (
        <div className="banner warn" role="alert">
          <WifiOff size={18} />
          <span className="grow">
            <b>{offlineCount} server{offlineCount > 1 ? "s" : ""}</b> report a connection unavailable. Inspect the server before running an operation.
          </span>
        </div>
      )}

      {showForm && (
        <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: "var(--t-base)", fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>
            Register a server
          </div>
          <form onSubmit={handleRegister}>
            <div className="grid-auto" style={{ marginBottom: 12 }}>
              <div className="field">
                <label className="label" htmlFor="agent-name">Server name</label>
                <input id="agent-name" name="agentName" className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="nonprod-web-01" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="agent-hw-uuid">Hardware UUID</label>
                <input id="agent-hw-uuid" name="hardwareUuid" className="input mono" value={hwUuid} onChange={(e) => setHwUuid(e.target.value)} placeholder="Provided by setup instructions" />
              </div>
              <div className="field">
                <label className="label" htmlFor="agent-org-key">Org API key</label>
                <input id="agent-org-key" name="orgApiKey" className="input mono" type="password" value={orgApiKey} onChange={(e) => setOrgApiKey(e.target.value)} placeholder="axk_…" required autoComplete="off" />
                <p className="text-xs text-muted mt-1">
                  Don't have one?{" "}
                  <Link to="/dashboard/settings" className="text-primary hover:underline">
                    Create an org API key in Settings
                  </Link>
                  .
                </p>
              </div>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>Use the configured environment's agent setup instructions. This workspace does not provide an installer command or endpoint.</p>
            <div className="row gap-2">
              <button className="btn btn-primary btn-sm" type="submit" disabled={registering}>
                {registering ? "Registering…" : "Register →"}
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {agentsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel" style={{ height: 180 }}>
              <div className="skel" style={{ height: "100%", borderRadius: "var(--r-md)" }} />
            </div>
          ))}
        </div>
      ) : agentsQuery.isError && agents.length === 0 ? (
        <div className="panel empty" role="alert">
          <div className="ic"><WifiOff size={22} /></div>
          <h3>{(agentsQuery.error as { response?: { status?: number } })?.response?.status === 401 || (agentsQuery.error as { response?: { status?: number } })?.response?.status === 403 ? "Servers are not available to this role" : "Server records are unavailable"}</h3>
          <p>Refresh the page or check access to the configured control plane.</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="panel empty">
          <div className="ic"><WifiOff size={22} /></div>
          <h3>No servers registered</h3>
          <p>Use the configured environment's setup instructions, then register a server when its details are available.</p>
          <div className="actions">
            {user?.role === "admin" && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Register a server</button>}
          </div>
        </div>
      ) : (
        <>
        {agentsQuery.isError && <div className="banner warn" role="alert"><WifiOff size={18} /><span>The latest server records could not be refreshed. Showing the last loaded records.</span></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {agents.map((agent) => (
            <div key={agent._id} style={{ position: "relative" }}>
              <AgentCard agent={agent} />
              {user?.role === "admin" && (
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
                  <button
                    className="icon-btn"
                    title="Rotate API key"
                    aria-label={`Rotate API key for ${agent.name}`}
                    onClick={async () => {
                      await agentsAPI.rotateKey(agent._id).catch(() => undefined);
                      toast.info("Key rotated", agent.name);
                    }}
                  >
                    <Key size={13} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Decommission"
                    aria-label={`Decommission agent ${agent.name}`}
                    onClick={() => handleDecommission(agent._id, agent.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </>
  );
}
