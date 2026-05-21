import { AlertTriangle, XCircle, Info } from "lucide-react";
import { toast } from "../../stores/toastStore";
import { useAgents } from "../../hooks/useDashboardData";

function timeAgo(value: string | null) {
  if (!value) return "unknown";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function ActiveAlerts() {
  const { data: agents } = useAgents();
  const alerts =
    agents
      ?.flatMap((agent) => {
        const ramTotal = agent.systemInfo?.ramTotal || 0;
        const ramUsed = agent.systemInfo?.ramUsed || 0;
        const ramPercent = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
        const stale =
          agent.status === "online" &&
          (!agent.lastSeen || Date.now() - new Date(agent.lastSeen).getTime() > 60000);

        return [
          ramPercent > 80
            ? {
                icon: AlertTriangle,
                iconColor: "text-yellow-400",
                iconBg: "bg-yellow-500/10",
                title: "High Memory Usage",
                desc: `${agent.name} memory usage is ${ramPercent.toFixed(1)}%`,
                time: timeAgo(agent.lastSeen),
                severity: "Medium",
                severityColor: "text-yellow-400",
                action: "Acknowledge",
                actionColor: "text-blue-400",
              }
            : null,
          stale
            ? {
                icon: XCircle,
                iconColor: "text-red-400",
                iconBg: "bg-red-500/10",
                title: "Stale Agent",
                desc: `${agent.name} has not sent telemetry in over 60 seconds`,
                time: timeAgo(agent.lastSeen),
                severity: "High",
                severityColor: "text-red-400",
                action: "View Details",
                actionColor: "text-blue-400",
              }
            : null,
        ].filter(Boolean);
      })
      .slice(0, 3) || [];

  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Active Alerts</h2>
        <button
          onClick={() =>
            toast.info("Configure Alerts", "Alert configuration coming soon")
          }
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Configure
        </button>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="bg-[#0a0a0f] border border-[#23232f] rounded-lg p-4 flex gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">No active alerts</h4>
              <p className="text-xs text-gray-400 mt-1">
                Agent telemetry is healthy or no agents are connected yet.
              </p>
            </div>
          </div>
        )}
        {alerts.map((alertItem, i) => {
          const Icon = alertItem.icon;
          return (
            <div
              key={`${alertItem.title}-${i}`}
              className="bg-[#0a0a0f] border border-[#23232f] rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 ${alertItem.iconBg} rounded-full flex items-center justify-center shrink-0 mt-0.5`}
                >
                  <Icon className={`w-4 h-4 ${alertItem.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      {alertItem.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {alertItem.time}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{alertItem.desc}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`text-xs font-medium ${alertItem.severityColor}`}
                    >
                      Severity: {alertItem.severity}
                    </span>
                    <button
                      onClick={() =>
                        toast.success(
                          alertItem.action,
                          `${alertItem.action}: ${alertItem.title}`,
                        )
                      }
                      className={`text-xs font-medium ${alertItem.actionColor} hover:underline`}
                    >
                      {alertItem.action}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
