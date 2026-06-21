import { useEffect, useMemo } from "react";
import { track } from "@vercel/analytics";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, Server, Briefcase, Activity, Shield,
  CheckCircle, Clock, Database,
} from "lucide-react";
import {
  useHealth,
  useJobStats,
  useUserStats,
  useOrgAnalytics,
  useAllUsers,
} from "../../hooks/useDashboardData";
import type { OrgStat, AllUser } from "../../hooks/useDashboardData";

const CHART_COLORS = {
  accent:  "#2563eb",
  ok:      "#10b981",
  err:     "#ef4444",
  warn:    "#f59e0b",
  purple:  "#8b5cf6",
  muted:   "#475569",
} as const;

function formatUptime(seconds: number): string {
  const days  = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins  = Math.floor((seconds % 3600) / 60);
  if (days  > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface StatCardProps {
  label:     string;
  value:     string | number;
  sub?:      string;
  icon:      React.ReactNode;
  deltaType?: "up" | "down" | "neutral";
}

function StatCard({ label, value, sub, icon, deltaType = "neutral" }: StatCardProps) {
  return (
    <div className="panel stat">
      <div className="k">{icon}{label}</div>
      <div className="v">{value}</div>
      {sub && (
        <div className="d">
          <span className={deltaType}>{sub}</span>
        </div>
      )}
    </div>
  );
}

interface PieTooltipProps {
  active?:  boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  total:    number;
}

function PieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pct  = total > 0 ? Math.round((item.value / total) * 100) : 0;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: item.payload.color, fontWeight: 600, marginBottom: 2 }}>{item.name}</div>
      <div style={{ color: "var(--text)" }}>{item.value} <span style={{ color: "var(--text-faint)" }}>({pct}%)</span></div>
    </div>
  );
}

interface BarTooltipProps {
  active?:  boolean;
  payload?: Array<{ value: number }>;
  label?:   string;
}

function BarTooltip({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 600 }}>{payload[0].value} jobs</div>
    </div>
  );
}

function OrgRow({ org }: { org: OrgStat }) {
  const agentAvailabilityPct = org.agentCount > 0
    ? Math.round((org.onlineAgents / org.agentCount) * 100)
    : 0;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "var(--t-sm)" }}>{org.orgName}</div>
        {org.orgDescription && (
          <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", marginTop: 1 }}>{org.orgDescription}</div>
        )}
      </td>
      <td className="mono" style={{ fontSize: "var(--t-xs)", textAlign: "center" }}>{org.userCount}</td>
      <td style={{ textAlign: "center" }}>
        <div style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--text)" }}>
          {org.onlineAgents}/{org.agentCount}
        </div>
        {org.agentCount > 0 && (
          <div style={{ fontSize: "var(--t-xs)", color: agentAvailabilityPct === 100 ? "var(--ok)" : agentAvailabilityPct > 50 ? "var(--warn)" : "var(--err)" }}>
            {agentAvailabilityPct}% online
          </div>
        )}
      </td>
      <td style={{ textAlign: "center" }}>
        <div className="row gap-1" style={{ justifyContent: "center" }}>
          <span className="chip">shell&nbsp;{org.shellJobCount}</span>
          <span className="chip">http&nbsp;{org.httpJobCount}</span>
        </div>
      </td>
      <td className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-muted)", textAlign: "center" }}>
        {formatDate(org.createdAt)}
      </td>
    </tr>
  );
}

function UserRow({ user }: { user: AllUser }) {
  const orgName = typeof user.orgId === "object" ? user.orgId.name : user.orgId;
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "var(--t-sm)" }}>{user.username}</div>
      </td>
      <td style={{ fontSize: "var(--t-xs)", color: "var(--text-muted)" }}>{user.email}</td>
      <td>
        <span className="chip">{orgName}</span>
      </td>
      <td>
        <span className={"badge " + (user.role === "admin" ? "active" : "paused")}>{user.role}</span>
      </td>
      <td className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-muted)", textAlign: "right" }}>
        {formatDate(user.createdAt)}
      </td>
    </tr>
  );
}

export default function AdminAnalyticsPage() {
  const { data: health }       = useHealth();
  const { data: jobStats }     = useJobStats();
  const { data: userStats }    = useUserStats();
  const { data: orgAnalytics } = useOrgAnalytics();
  const { data: allUsers = [] } = useAllUsers();

  useEffect(() => {
    track("admin_analytics_viewed");
  }, []);

  const totalShellJobs = useMemo(
    () => (orgAnalytics?.orgs ?? []).reduce((sum, org) => sum + org.shellJobCount, 0),
    [orgAnalytics]
  );
  const totalHttpJobs = useMemo(
    () => (orgAnalytics?.orgs ?? []).reduce((sum, org) => sum + org.httpJobCount, 0),
    [orgAnalytics]
  );

  const jobTypeData = [
    { name: "Shell", value: totalShellJobs, color: CHART_COLORS.warn },
    { name: "HTTP",  value: totalHttpJobs,  color: CHART_COLORS.accent },
  ];

  const agentStatusData = [
    { name: "Online",  value: orgAnalytics?.onlineAgents  ?? 0, color: CHART_COLORS.ok },
    { name: "Offline", value: orgAnalytics?.offlineAgents ?? 0, color: CHART_COLORS.muted },
  ];

  const jobHealthData = [
    { name: "Enabled",  value: jobStats?.enabledJobs  ?? 0, color: CHART_COLORS.ok },
    { name: "Disabled", value: jobStats?.disabledJobs ?? 0, color: CHART_COLORS.muted },
  ];

  const jobsByOrgData = useMemo(
    () =>
      [...(jobStats?.jobsByOrg ?? [])]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((org) => ({
          name: org.orgName.length > 18 ? org.orgName.slice(0, 18) + "…" : org.orgName,
          jobs: org.count,
        })),
    [jobStats]
  );

  const totalJobTypePieSum = totalShellJobs + totalHttpJobs;
  const totalAgentSum      = (orgAnalytics?.onlineAgents ?? 0) + (orgAnalytics?.offlineAgents ?? 0);
  const totalJobHealthSum  = (jobStats?.enabledJobs ?? 0) + (jobStats?.disabledJobs ?? 0);

  const dbStateLabel: Record<number, string> = { 0: "Disconnected", 1: "Connected", 2: "Connecting", 3: "Disconnecting" };
  const dbStateColor: Record<number, string> = { 0: "var(--err)", 1: "var(--ok)", 2: "var(--warn)", 3: "var(--warn)" };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin Analytics</h1>
          <p>Platform-wide health, customer breakdown, and operational metrics</p>
        </div>
        <div className="actions">
          <span className="badge active">
            <Shield size={11} style={{ marginRight: 4 }} />
            admin only
          </span>
        </div>
      </div>

      {/* Hero stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", marginBottom: 20 }}>
        <StatCard
          label="Organizations"
          value={orgAnalytics?.totalOrgs ?? "—"}
          sub="registered customers"
          icon={<Briefcase size={15} />}
          deltaType="neutral"
        />
        <StatCard
          label="Users"
          value={userStats?.totalUsers ?? "—"}
          sub="across all orgs"
          icon={<Users size={15} />}
          deltaType="neutral"
        />
        <StatCard
          label="Total Jobs"
          value={jobStats?.totalJobs ?? "—"}
          sub={jobStats ? `${jobStats.enabledJobs} enabled` : undefined}
          icon={<Activity size={15} />}
          deltaType="up"
        />
        <StatCard
          label="Agents"
          value={orgAnalytics?.totalAgents ?? "—"}
          sub={orgAnalytics ? `${orgAnalytics.onlineAgents} online` : undefined}
          icon={<Server size={15} />}
          deltaType={orgAnalytics && orgAnalytics.onlineAgents === orgAnalytics.totalAgents ? "up" : "down"}
        />
        <StatCard
          label="Active (24h)"
          value={jobStats?.jobsRunLast24h ?? "—"}
          sub="distinct jobs run"
          icon={<CheckCircle size={15} />}
          deltaType="up"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Jobs per organisation — horizontal bar */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Jobs per organisation</span>
            <span className="grow" />
            <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>top 10</span>
          </div>
          <div className="chart-wrap">
            {jobsByOrgData.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, jobsByOrgData.length * 36)}>
                <BarChart data={jobsByOrgData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-ui)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "var(--surface-3)" }} />
                  <Bar dataKey="jobs" fill={CHART_COLORS.accent} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Job type distribution */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Job types</span>
          </div>
          <div className="chart-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={jobTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={74}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {jobTypeData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip total={totalJobTypePieSum} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {jobTypeData.map((entry) => (
                <span key={entry.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--t-xs)", color: "var(--text-muted)" }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, display: "inline-block", flexShrink: 0 }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Agent fleet status */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Agent fleet status</span>
          </div>
          <div className="chart-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={agentStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={74}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {agentStatusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip total={totalAgentSum} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {agentStatusData.map((entry) => (
                <span key={entry.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--t-xs)", color: "var(--text-muted)" }}>
                  <i style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, display: "inline-block", flexShrink: 0 }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* System health + job health */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">System health</span>
            <span className="grow" />
            {health && (
              <span style={{ fontSize: "var(--t-xs)", color: health.status === "ok" ? "var(--ok)" : "var(--err)" }}>
                {health.status}
              </span>
            )}
          </div>
          <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Health rows */}
            {[
              {
                label: "Database",
                value: health ? dbStateLabel[health.dbState] ?? "Unknown" : "—",
                color: health ? dbStateColor[health.dbState] : "var(--text-faint)",
                icon:  <Database size={13} />,
              },
              {
                label: "Uptime",
                value: health ? formatUptime(health.uptime) : "—",
                color: "var(--ok)",
                icon:  <Clock size={13} />,
              },
              {
                label: "Total users",
                value: health?.userCount ?? "—",
                color: "var(--text)",
                icon:  <Users size={13} />,
              },
            ].map(({ label, value, color, icon }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--text-faint)", display: "flex", alignItems: "center" }}>{icon}</span>
                <span style={{ flex: 1, fontSize: "var(--t-sm)", color: "var(--text-muted)" }}>{label}</span>
                <span className="mono" style={{ fontSize: "var(--t-sm)", color, fontWeight: 600 }}>{value}</span>
              </div>
            ))}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", marginBottom: 8 }}>Job health</div>
              <ResponsiveContainer width="100%" height={80}>
                <PieChart>
                  <Pie
                    data={jobHealthData}
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={38}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {jobHealthData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip total={totalJobHealthSum} />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: "var(--t-xs)", color: "var(--text-muted)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Organisations table */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <span className="panel-title">Organisations</span>
          <span className="grow" />
          <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>
            {orgAnalytics?.orgs.length ?? 0} total
          </span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Organisation</th>
                <th style={{ textAlign: "center" }}>Users</th>
                <th style={{ textAlign: "center" }}>Agents</th>
                <th style={{ textAlign: "center" }}>Jobs</th>
                <th style={{ textAlign: "center" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {!orgAnalytics ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-faint)", height: 64 }}>Loading…</td>
                </tr>
              ) : orgAnalytics.orgs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-faint)", height: 64 }}>No organisations</td>
                </tr>
              ) : (
                [...orgAnalytics.orgs]
                  .sort((a, b) => b.totalJobCount - a.totalJobCount)
                  .map((org) => <OrgRow key={String(org.orgId)} org={org} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users table */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Users</span>
          <span className="grow" />
          <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>
            {allUsers.length} total
          </span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Organisation</th>
                <th>Role</th>
                <th style={{ textAlign: "right" }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-faint)", height: 64 }}>No users</td>
                </tr>
              ) : (
                allUsers.map((user) => <UserRow key={user._id} user={user} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}