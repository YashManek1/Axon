import { useEffect, useMemo, useState } from "react";
import { Cpu, MemoryStick, Network } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { agentsAPI } from "../../services/api";

const colors = ["#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#f59e0b"];

interface Agent {
  _id: string;
  name: string;
  status: string;
  systemInfo?: {
    cpuLoad?: number;
    ramTotal?: number;
    ramUsed?: number;
  };
}

interface ChartDatum {
  name: string;
  value: number;
  color: string;
}

interface LabelProps {
  name?: string;
  value?: number;
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
}

function DonutChart({ data }: { data: ChartDatum[] }) {
  const renderLabel = ({
    name,
    value,
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
  }: LabelProps) => {
    if (!cx || !cy || midAngle === undefined || !innerRadius || !outerRadius)
      return null;
    if (!value || name === "Available") return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
      >
        {Math.round(value)}
      </text>
    );
  };

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ name: "No data", value: 1, color: "#3a3a4a" }]}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            strokeWidth={0}
            label={data.length ? renderLabel : undefined}
          >
            {(data.length ? data : [{ name: "No data", value: 1, color: "#3a3a4a" }]).map(
              (entry, i) => (
                <Cell key={i} fill={entry.color} />
              ),
            )}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a24",
              border: "1px solid #2d2d3a",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function toGb(valueMb: number) {
  return valueMb / 1024;
}

export default function ResourceCharts() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    agentsAPI
      .getAll()
      .then((response) => {
        if (mounted) {
          setAgents(response.data);
          setError("");
        }
      })
      .catch(() => {
        if (mounted) setError("Could not load resource telemetry");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const cpuData = agents
      .map((agent, index) => ({
        name: agent.name,
        value: Number(agent.systemInfo?.cpuLoad || 0),
        color: colors[index % colors.length],
      }))
      .filter((item) => item.value > 0);
    const cpuUtilized = cpuData.reduce((sum, item) => sum + item.value, 0);
    const cpuCapacity = agents.length * 100;

    if (cpuCapacity > cpuUtilized) {
      cpuData.push({
        name: "Available",
        value: cpuCapacity - cpuUtilized,
        color: "#3a3a4a",
      });
    }

    const memData = agents
      .map((agent, index) => ({
        name: agent.name,
        value: Number(agent.systemInfo?.ramUsed || 0),
        color: colors[index % colors.length],
      }))
      .filter((item) => item.value > 0);
    const ramUsed = memData.reduce((sum, item) => sum + item.value, 0);
    const ramTotal = agents.reduce(
      (sum, agent) => sum + Number(agent.systemInfo?.ramTotal || 0),
      0,
    );

    if (ramTotal > ramUsed) {
      memData.push({
        name: "Available",
        value: ramTotal - ramUsed,
        color: "#3a3a4a",
      });
    }

    const online = agents.filter((agent) => agent.status === "online").length;
    const offline = agents.length - online;
    const statusData = [
      { name: "Online", value: online, color: "#22c55e" },
      { name: "Offline", value: offline, color: "#ef4444" },
    ].filter((item) => item.value > 0);

    return {
      cpuData,
      cpuCapacity,
      cpuUtilized,
      memData,
      ramTotal,
      ramUsed,
      statusData,
      online,
    };
  }, [agents]);

  if (loading) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5 text-sm text-gray-400">
        Loading resource telemetry...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">CPU Load</h3>
          <Cpu className="w-5 h-5 text-blue-400" />
        </div>
        <DonutChart data={metrics.cpuData} />
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Agents</span>
            <p className="font-semibold text-white">{agents.length}</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Average</span>
            <p className="font-semibold text-emerald-400">
              {agents.length ? `${Math.round(metrics.cpuUtilized / agents.length)}%` : "0%"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Memory Usage</h3>
          <MemoryStick className="w-5 h-5 text-purple-400" />
        </div>
        <DonutChart data={metrics.memData} />
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Total RAM</span>
            <p className="font-semibold text-white">
              {toGb(metrics.ramTotal).toFixed(1)} GB
            </p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Used</span>
            <p className="font-semibold text-emerald-400">
              {toGb(metrics.ramUsed).toFixed(1)} GB
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Agent Status</h3>
          <Network className="w-5 h-5 text-emerald-400" />
        </div>
        <DonutChart data={metrics.statusData} />
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Online</span>
            <p className="font-semibold text-white">{metrics.online}</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Offline</span>
            <p className="font-semibold text-emerald-400">
              {agents.length - metrics.online}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
