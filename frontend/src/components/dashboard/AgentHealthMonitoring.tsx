import { useState } from "react";

const agents = [
  {
    name: "rust-agent-01",
    region: "us-east-1a",
    status: "Healthy",
    statusColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    cpu: 42.3,
    cpuColor: "bg-blue-500",
    memory: 68.7,
    memColor: "bg-purple-500",
    disk: 34.2,
    diskColor: "bg-green-500",
    network: 52.8,
    netColor: "bg-blue-400",
  },
  {
    name: "rust-agent-02",
    region: "eu-west-2b",
    status: "Healthy",
    statusColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    cpu: 28.6,
    cpuColor: "bg-blue-500",
    memory: 54.2,
    memColor: "bg-purple-500",
    disk: 41.8,
    diskColor: "bg-green-500",
    network: 38.4,
    netColor: "bg-blue-400",
  },
  {
    name: "rust-agent-03",
    region: "ap-south-1c",
    status: "Warning",
    statusColor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    cpu: 71.8,
    cpuColor: "bg-blue-500",
    memory: 82.4,
    memColor: "bg-red-500",
    disk: 58.9,
    diskColor: "bg-yellow-500",
    network: 67.3,
    netColor: "bg-cyan-400",
  },
];

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
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-[#23232f] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={`text-sm font-medium w-14 text-right ${warn && value > 80 ? "text-red-400" : "text-gray-300"}`}
      >
        {value}%
      </span>
    </div>
  );
}

export default function AgentHealthMonitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          Agent Health Monitoring
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Auto-refresh:</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            aria-label="Toggle auto-refresh"
            className={`w-11 h-6 rounded-full transition-colors relative ${autoRefresh ? "bg-blue-600" : "bg-[#23232f]"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoRefresh ? "translate-x-5 left-0.5" : "left-0.5"}`}
            />
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoRefresh ? "left-5.5" : "left-0.5"}`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="bg-[#111118] border border-[#23232f] rounded-xl p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-lg">⚙</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">{agent.name}</h3>
                <p className="text-xs text-gray-400">{agent.region}</p>
              </div>
              <span
                className={`ml-auto px-2.5 py-0.5 text-xs font-medium rounded-full border ${agent.statusColor}`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${agent.status === "Healthy" ? "bg-emerald-400" : "bg-yellow-400"}`}
                />
                {agent.status}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">CPU</span>
                </div>
                <ProgressBar value={agent.cpu} color={agent.cpuColor} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Memory</span>
                </div>
                <ProgressBar value={agent.memory} color={agent.memColor} warn />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Disk</span>
                </div>
                <ProgressBar value={agent.disk} color={agent.diskColor} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Network</span>
                </div>
                <ProgressBar value={agent.network} color={agent.netColor} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
