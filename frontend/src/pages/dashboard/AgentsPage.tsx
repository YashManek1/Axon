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
  const ramPct  = si.ramTotal ? Math.round((si.ramUsed ?? 0) / si.ramTotal * 100) : 0;
  const cpuPct  = si.cpuLoad ?? 0;
  const online  = agent.status !== "offline";
  const lastSeen = agent.lastSeen
    ? new Date(agent.lastSeen).toLocaleTimeString()
    : "never";

  return (
    <div className="panel agent-card" style={{ opacity: online ? 1 : 0.65 }}>
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
      <div className="meta">{si.hostname || "—"} · {si.os || "Linux"} · {si.arch || "x64"}</div>
      <div className="meta" style={{ marginTop: -8 }}>last seen {lastSeen}</div>

      <div className="bars">
        <div className="agent-metric">
          <div className="ml">CPU</div>
          <div className="mv">{cpuPct}%</div>
          <div className="meter"><i className={meterClass(cpuPct)} style={{ width: `${cpuPct}%` }} /></div>
        </div>
        <div className="agent-metric">
          <div className="ml">RAM</div>
          <div className="mv">{si.ramUsed?.toFixed(1) ?? 0} / {si.ramTotal ?? 0} GB</div>
          <div className="meter"><i className={meterClass(ramPct)} style={{ width: `${ramPct}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { data: agents = [], isLoading } = useAgents();
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
          <h1>Agents</h1>
          <p>Connectivity, resource usage, and status across the fleet</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> Register agent
          </button>
        </div>
      </div>

      {offlineCount > 0 && (
        <div className="banner warn">
          <WifiOff size={18} />
          <span className="grow">
            <b>{offlineCount} agent{offlineCount > 1 ? "s" : ""}</b> offline — heartbeat lost. Scheduled jobs targeting them will queue.
          </span>
        </div>
      )}

      {showForm && (
        <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: "var(--t-base)", fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>
            Register a new agent
          </div>
          <form onSubmit={handleRegister}>
            <div className="grid-auto" style={{ marginBottom: 12 }}>
              <div className="field">
                <label className="label">Agent name</label>
                <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="prod-us-east" required />
              </div>
              <div className="field">
                <label className="label">Hardware UUID</label>
                <input className="input mono" value={hwUuid} onChange={(e) => setHwUuid(e.target.value)} placeholder="auto-detected on install" />
              </div>
              <div className="field">
                <label className="label">Org API key</label>
                <input className="input mono" type="password" value={orgApiKey} onChange={(e) => setOrgApiKey(e.target.value)} placeholder="axk_…" required />
              </div>
            </div>
            <div className="term" style={{ fontSize: 12, marginBottom: 12 }}>
              <div className="term-body" style={{ padding: "10px 14px" }}>
                <span style={{ color: "var(--accent)" }}>$</span>
                {" curl -sSL https://install.axon.run | sh\n"}
                <span style={{ color: "var(--text-faint)" }}># /etc/axon-agent/config.env{"\n"}</span>
                {"SERVER_URL=https://api.axon.run\nAGENT_ID=ag_01H...\nAGENT_API_KEY=axk_...\n"}
                <span style={{ color: "var(--accent)" }}>$</span>
                {" systemctl enable --now axon-agent"}
              </div>
            </div>
            <div className="row gap-2">
              <button className="btn btn-primary btn-sm" type="submit" disabled={registering}>
                {registering ? "Registering…" : "Register →"}
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="grid-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel" style={{ height: 180 }}>
              <div className="skel" style={{ height: "100%", borderRadius: "var(--r-md)" }} />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="panel empty">
          <div className="ic"><WifiOff size={22} /></div>
          <h3>No agents registered</h3>
          <p>Install the Axon agent on a server and register it here to start managing it.</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Register agent</button>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {agents.map((agent) => (
            <div key={agent._id} style={{ position: "relative" }}>
              <AgentCard agent={agent} />
              {user?.role === "admin" && (
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
                  <button
                    className="icon-btn"
                    title="Rotate API key"
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
                    onClick={() => handleDecommission(agent._id, agent.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
