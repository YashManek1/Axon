import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "../../stores/toastStore";

const data = [
  { name: "Success", value: 98.2, color: "#22c55e" },
  { name: "Timeout", value: 0.6, color: "#f59e0b" },
  { name: "Validation Error", value: 0.5, color: "#ef4444" },
  { name: "Network Error", value: 0.5, color: "#a855f7" },
  { name: "Other", value: 0.2, color: "#6b7280" },
];

export default function ErrorDistributionChart() {
  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          Error Rate Distribution
        </h2>
        <button
          onClick={() =>
            toast.info("Error Details", "Detailed error breakdown coming soon")
          }
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          View Details
        </button>
      </div>
      <div className="flex items-center gap-6">
        <div className="w-48 h-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                dataKey="value"
                strokeWidth={0}
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
        <div className="space-y-2.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-sm text-gray-300">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
