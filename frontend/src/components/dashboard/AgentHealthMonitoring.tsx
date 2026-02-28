import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAgents } from "../../hooks/useDashboardData";
import type { AgentData } from "../../hooks/useDashboardData";

function ProgressBar({
  value,
  color,
  warn,
}: {
  value: number;
  color: string;
  warn?: boolean;
}) {
  return (
    <div className="h-2 bg-[#1a1a24] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${warn && value > 80 ? "bg-red-500" : color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case "online":
      return {
        text: "Healthy",
        classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        dotColor: "bg-emerald-400",
      };
    case "busy":
      return {
        text: "Busy",
        classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
        dotColor: "bg-yellow-400",
      };
    default:
      return {
        text: "Offline",
        classes: "bg-gray-500/10 text-gray-400 border-gray-500/30",
        dotColor: "bg-gray-400",
      };
  }
}

export default function AgentHealthMonitoring() {
  const { data: agents, isLoading } = useAgents();
  const [autoRefresh, setAutoRefresh] = useState(true);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-4">
          Agent Health Monitoring
        </h2>
        <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-4">
          Agent Health Monitoring
        </h2>
        <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 text-center">
          <p className="text-gray-400">
            No agents registered. Deploy an agent to see health metrics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          Agent Health Monitoring
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Auto-refresh</span>
          <button
          aria-label="Toggle auto-refresh"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`relative w-11 h-6 rounded-full transition-colors ${autoRefresh ? "bg-blue-600" : "bg-[#2d2d3a]"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoRefresh ? "left-5.5" : "left-0.5"}`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agents.map((agent: AgentData) => {
          const badge = getStatusBadge(agent.status);
          const cpuLoad = agent.systemInfo?.cpuLoad ?? 0;
          const ramTotal = agent.systemInfo?.ramTotal ?? 1;
          const ramUsed = agent.systemInfo?.ramUsed ?? 0;
          const ramPercent =
            ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0;

          return (
            <div
              key={agent._id}
              className="bg-[#111118] border border-[#23232f] rounded-xl p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                  <span className="text-white text-lg">⚙</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">{agent.name}</h3>
                  <p className="text-xs text-gray-400">
                    {agent.systemInfo?.hostname || "Unknown host"}
                  </p>
                </div>
                <span
                  className={`ml-auto px-2.5 py-0.5 text-xs font-medium rounded-full border ${badge.classes}`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${badge.dotColor}`}
                  />
                  {badge.text}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">CPU</span>
                    <span className="text-gray-300">{cpuLoad.toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={cpuLoad} color="bg-blue-500" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Memory</span>
                    <span className="text-gray-300">{ramPercent}%</span>
                  </div>
                  <ProgressBar value={ramPercent} color="bg-purple-500" warn />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
