import { Monitor, CheckCircle, Database, Gauge } from "lucide-react";

const stats = [
  {
    label: "ACTIVE AGENTS",
    value: "247",
    change: "12.5%",
    up: true,
    icon: Monitor,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
  },
  {
    label: "JOBS SUCCESS RATE",
    value: "98.2%",
    change: "0.3%",
    up: true,
    icon: CheckCircle,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
  },
  {
    label: "DATA SUNK",
    value: "2.4 GB",
    change: "8.1%",
    up: true,
    icon: Database,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
  },
  {
    label: "AVG. LATENCY",
    value: "45ms",
    change: "5.2ms",
    up: false,
    icon: Gauge,
    color: "text-orange-400",
    bg: "bg-orange-500/20",
  },
];

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-[#111118] border border-[#23232f] rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 tracking-wider">
              {s.label}
            </span>
            <div
              className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}
            >
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white mb-1">{s.value}</p>
          <p className="text-sm">
            <span className={s.up ? "text-emerald-400" : "text-red-400"}>
              {s.up ? "↑" : "↓"} {s.change}
            </span>
            <span className="text-gray-500 ml-1">vs last hour</span>
          </p>
        </div>
      ))}
    </div>
  );
}
