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
    <div className="bg-surface border border-edge rounded-md p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted text-xs uppercase font-medium">{icon}{label}</div>
      <div className="text-ink text-lg font-bold">{value}</div>
      {sub && (
        <div className="text-xs">
          <span className={deltaType === "up" ? "text-success" : deltaType === "down" ? "text-danger" : "text-muted"}>{sub}</span>
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
        <div className="font-bold text-ink text-sm">{org.orgName}</div>
        {org.orgDescription && (
          <div className="text-xs text-muted mt-px">{org.orgDescription}</div>
        )}
      </td>
      <td className="font-mono text-xs text-center">{org.userCount}</td>
      <td className="text-center">
        <div className="text-sm font-bold text-ink">
          {org.onlineAgents}/{org.agentCount}
        </div>
        {org.agentCount > 0 && (
          <div className={`text-xs ${agentAvailabilityPct === 100 ? "text-success" : agentAvailabilityPct > 50 ? "text-warning" : "text-danger"}`}>
            {agentAvailabilityPct}% online
          </div>
        )}
      </td>
      <td className="text-center">
        <div className="flex gap-1 justify-center">
          <span className="font-mono text-xs bg-surface border border-edge rounded-sm px-2 py-px text-ink-2">shell&nbsp;{org.shellJobCount}</span>
          <span className="font-mono text-xs bg-surface border border-edge rounded-sm px-2 py-px text-ink-2">http&nbsp;{org.httpJobCount}</span>
        </div>
      </td>
      <td className="font-mono text-xs text-muted text-center">
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
        <div className="font-bold text-ink text-sm">{user.username}</div>
      </td>
      <td className="text-xs text-muted">{user.email}</td>
      <td>
        <span className="font-mono text-xs bg-surface border border-edge rounded-sm px-2 py-px text-ink-2">{orgName}</span>
      </td>
      <td>
        <span className={`inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm ${
          user.role === "admin" ? "text-success bg-green-500/10" : "text-warning bg-amber-500/10"
        }`}>{user.role}</span>
      </td>
      <td className="font-mono text-xs text-muted text-right">
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
      <div className="flex items-start justify-between gap-8 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Admin Analytics</h1>
          <p className="text-muted mt-2">Platform-wide health, customer breakdown, and operational metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm text-success bg-green-500/10">
            <Shield size={11} />
            admin only
          </span>
        </div>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Jobs per organisation — horizontal bar */}
        <div className="bg-surface border border-edge rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="font-ui font-bold text-sm text-ink">Jobs per organisation</span>
            <span className="flex-1" />
            <span className="text-xs text-muted">top 10</span>
          </div>
          <div className="p-4">
            {jobsByOrgData.length === 0 ? (
              <div className="py-8 text-center text-muted text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, jobsByOrgData.length * 36)}>
                <BarChart data={jobsByOrgData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-ui)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "var(--surface-2)" }} />
                  <Bar dataKey="jobs" fill={CHART_COLORS.accent} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Job type distribution */}
        <div className="bg-surface border border-edge rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="font-ui font-bold text-sm text-ink">Job types</span>
          </div>
          <div className="p-4 flex flex-col items-center gap-3">
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
            <div className="flex flex-col items-center gap-2">
              {jobTypeData.map((entry) => (
                <span key={entry.name} className="flex items-center gap-1 text-xs text-muted">
                  <i className="w-2 h-2 rounded inline-block flex-shrink-0" style={{ background: entry.color }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Agent fleet status */}
        <div className="bg-surface border border-edge rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="font-ui font-bold text-sm text-ink">Agent fleet status</span>
          </div>
          <div className="p-4 flex flex-col items-center gap-3">
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
            <div className="flex flex-col items-center gap-2">
              {agentStatusData.map((entry) => (
                <span key={entry.name} className="flex items-center gap-1 text-xs text-muted">
                  <i className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: entry.color }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* System health + job health */}
        <div className="bg-surface border border-edge rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="font-ui font-bold text-sm text-ink">System health</span>
            <span className="flex-1" />
            {health && (
              <span className={`text-xs ${health.status === "ok" ? "text-success" : "text-danger"}`}>
                {health.status}
              </span>
            )}
          </div>
          <div className="p-4 flex flex-col gap-3">
            {/* Health rows */}
            {[
              {
                label: "Database",
                value: health ? dbStateLabel[health.dbState] ?? "Unknown" : "—",
                color: health ? dbStateColor[health.dbState] : "var(--muted)",
                icon:  <Database size={13} />,
              },
              {
                label: "Uptime",
                value: health ? formatUptime(health.uptime) : "—",
                color: "var(--success)",
                icon:  <Clock size={13} />,
              },
              {
                label: "Total users",
                value: health?.userCount ?? "—",
                color: "var(--text)",
                icon:  <Users size={13} />,
              },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="text-muted flex items-center">{icon}</span>
                <span className="flex-1 text-sm text-muted">{label}</span>
                <span className="font-mono text-sm font-bold" style={{ color }}>{value}</span>
              </div>
            ))}

            <div className="border-t border-edge pt-3">
              <div className="text-xs text-muted mb-2">Job health</div>
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
                    wrapperStyle={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Organisations table */}
      <div className="bg-surface border border-edge rounded-md overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">Organisations</span>
          <span className="flex-1" />
          <span className="text-xs text-muted">
            {orgAnalytics?.orgs.length ?? 0} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Organisation</th>
                <th className="text-center font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Users</th>
                <th className="text-center font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Agents</th>
                <th className="text-center font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Jobs</th>
                <th className="text-center font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Created</th>
              </tr>
            </thead>
            <tbody>
              {!orgAnalytics ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted h-16">Loading…</td>
                </tr>
              ) : orgAnalytics.orgs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted h-16">No organisations</td>
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
      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">Users</span>
          <span className="flex-1" />
          <span className="text-xs text-muted">
            {allUsers.length} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Username</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Email</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Organisation</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Role</th>
                <th className="text-right font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Joined</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted h-16">No users</td>
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