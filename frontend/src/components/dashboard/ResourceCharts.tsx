import { Cpu, MemoryStick, Network } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const cpuData = [
  { name: "rust-agent-01", value: 16, color: "#3b82f6" },
  { name: "rust-agent-03", value: 12, color: "#22c55e" },
  { name: "rust-agent-02", value: 10, color: "#a855f7" },
  { name: "Available", value: 26, color: "#3a3a4a" },
];

const memData = [
  { name: "rust-agent-01", value: 32, color: "#a855f7" },
  { name: "rust-agent-03", value: 28, color: "#ec4899" },
  { name: "rust-agent-02", value: 24, color: "#f59e0b" },
  { name: "Available", value: 44, color: "#3a3a4a" },
];

const networkData = [
  { time: "1", inbound: 2.1, outbound: 2.0 },
  { time: "2", inbound: 2.3, outbound: 2.1 },
  { time: "3", inbound: 2.5, outbound: 2.3 },
  { time: "4", inbound: 2.4, outbound: 2.5 },
  { time: "5", inbound: 2.8, outbound: 2.4 },
  { time: "6", inbound: 2.6, outbound: 2.6 },
  { time: "7", inbound: 3.0, outbound: 2.7 },
  { time: "8", inbound: 3.2, outbound: 2.8 },
  { time: "9", inbound: 3.5, outbound: 3.0 },
];

interface LabelProps {
  name?: string;
  value?: number;
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
}

function DonutChart({ data }: { data: typeof cpuData }) {
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
    if (name === "Available") return null;
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
        {value}
      </text>
    );
  };

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            strokeWidth={0}
            label={renderLabel}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
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

export default function ResourceCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">CPU Allocation</h3>
          <Cpu className="w-5 h-5 text-blue-400" />
        </div>
        <DonutChart data={cpuData} />
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Total Cores</span>
            <p className="font-semibold text-white">64</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Utilized</span>
            <p className="font-semibold text-emerald-400">38 (59.4%)</p>
          </div>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Memory Usage</h3>
          <MemoryStick className="w-5 h-5 text-purple-400" />
        </div>
        <DonutChart data={memData} />
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Total RAM</span>
            <p className="font-semibold text-white">128 GB</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Utilized</span>
            <p className="font-semibold text-emerald-400">84 GB (65.6%)</p>
          </div>
        </div>
      </div>

      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Network I/O</h3>
          <Network className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23232f" />
              <XAxis dataKey="time" stroke="transparent" />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a24",
                  border: "1px solid #2d2d3a",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Line
                type="monotone"
                dataKey="inbound"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="outbound"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-2">
          <span className="flex items-center gap-1.5 text-sm text-gray-400">
            <span className="w-3 h-0.5 bg-emerald-500 rounded" /> Inbound
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-400">
            <span className="w-3 h-0.5 bg-blue-500 rounded" /> Outbound
          </span>
        </div>
        <div className="flex justify-between text-sm mt-2 pt-3 border-t border-[#23232f]">
          <div>
            <span className="text-gray-400">Bandwidth</span>
            <p className="font-semibold text-white">10 Gbps</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Current</span>
            <p className="font-semibold text-emerald-400">4.2 Gbps</p>
          </div>
        </div>
      </div>
    </div>
  );
}
