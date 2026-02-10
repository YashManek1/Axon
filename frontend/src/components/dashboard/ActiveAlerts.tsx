import { AlertTriangle, XCircle, Info } from "lucide-react";

const alerts = [
  {
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-500/10",
    title: "High Memory Usage",
    desc: "rust-agent-03 memory usage exceeded 80% threshold",
    time: "5m ago",
    severity: "Medium",
    severityColor: "text-yellow-400",
    action: "Acknowledge",
    actionColor: "text-blue-400",
  },
  {
    icon: XCircle,
    iconColor: "text-red-400",
    iconBg: "bg-red-500/10",
    title: "Job Failure",
    desc: "validation-job-7723 failed on rust-agent-01",
    time: "24m ago",
    severity: "High",
    severityColor: "text-red-400",
    action: "View Details",
    actionColor: "text-blue-400",
  },
  {
    icon: Info,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
    title: "System Update Available",
    desc: "Version 2.5.0 available for all agents",
    time: "1h ago",
    severity: "Low",
    severityColor: "text-blue-400",
    action: "Update Now",
    actionColor: "text-blue-400",
  },
];

export default function ActiveAlerts() {
  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Active Alerts</h2>
        <button className="text-sm text-blue-400 hover:text-blue-300">
          Configure
        </button>
      </div>

      <div className="space-y-3">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className="bg-[#0a0a0f] border border-[#23232f] rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 ${alert.iconBg} rounded-full flex items-center justify-center shrink-0 mt-0.5`}
              >
                <alert.icon className={`w-4 h-4 ${alert.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">
                    {alert.title}
                  </h4>
                  <span className="text-xs text-gray-500">{alert.time}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{alert.desc}</p>
                <div className="flex items-center justify-between mt-2">
                  <span
                    className={`text-xs font-medium ${alert.severityColor}`}
                  >
                    Severity: {alert.severity}
                  </span>
                  <button
                    className={`text-xs font-medium ${alert.actionColor} hover:underline`}
                  >
                    {alert.action}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
