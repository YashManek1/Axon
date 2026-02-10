import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const data = [
  { time: "10:00", value: 1200 },
  { time: "10:30", value: 1280 },
  { time: "11:00", value: 1350 },
  { time: "11:30", value: 1300 },
  { time: "12:00", value: 1420 },
  { time: "12:30", value: 1380 },
  { time: "13:00", value: 1300 },
  { time: "13:30", value: 1500 },
  { time: "14:00", value: 1520 },
  { time: "14:30", value: 1480 },
  { time: "15:00", value: 1560 },
  { time: "15:30", value: 1540 },
  { time: "16:00", value: 1500 },
  { time: "16:30", value: 1620 },
  { time: "17:00", value: 1680 },
  { time: "17:30", value: 1700 },
  { time: "18:00", value: 1780 },
];

export default function SystemThroughputChart() {
  const [range, setRange] = useState("24H");
  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">System Throughput</h2>
        <div className="flex bg-[#1a1a24] rounded-lg p-0.5">
          {["1H", "24H", "7D"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${range === r ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#23232f" />
            <XAxis
              dataKey="time"
              stroke="#666"
              fontSize={12}
              tickLine={false}
            />
            <YAxis stroke="#666" fontSize={12} tickLine={false} />
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
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
