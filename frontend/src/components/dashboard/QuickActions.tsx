import { Plus, Play, Download, Settings } from "lucide-react";

const actions = [
  {
    icon: Plus,
    label: "Deploy Agent",
    desc: "Launch new agent instance",
    color: "bg-blue-500/20",
    iconColor: "text-blue-400",
  },
  {
    icon: Play,
    label: "Run Job",
    desc: "Execute new job task",
    color: "bg-purple-500/20",
    iconColor: "text-purple-400",
  },
  {
    icon: Download,
    label: "Export Data",
    desc: "Download metrics & logs",
    color: "bg-emerald-500/20",
    iconColor: "text-emerald-400",
  },
  {
    icon: Settings,
    label: "Configure",
    desc: "System settings",
    color: "bg-orange-500/20",
    iconColor: "text-orange-400",
  },
];

export default function QuickActions() {
  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.label}
            className="bg-[#0a0a0f] border border-[#23232f] rounded-lg p-4 text-left hover:border-[#3a3a4a] transition-colors group"
          >
            <div
              className={`w-10 h-10 ${action.color} rounded-lg flex items-center justify-center mb-3`}
            >
              <action.icon className={`w-5 h-5 ${action.iconColor}`} />
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
              {action.label}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{action.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
