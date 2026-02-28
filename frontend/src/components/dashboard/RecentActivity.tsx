import {
  CheckCircle,
  Play,
  AlertTriangle,
  Rocket,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "../../stores/toastStore";

const activities = [
  {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Job Completed",
    desc: "rust-agent-01 completed data-sync-job-4521",
    time: "2m ago",
    badge: "Success",
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    icon: Play,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "Job Started",
    desc: "rust-agent-03 started ml-training-job-8842",
    time: "5m ago",
    badge: "Running",
    badgeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
  {
    icon: AlertTriangle,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    title: "High Memory Usage",
    desc: "rust-agent-03 memory usage at 82.4%",
    time: "7m ago",
    badge: "Warning",
    badgeColor: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  },
  {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Job Completed",
    desc: "rust-agent-02 completed backup-job-2341",
    time: "12m ago",
    badge: "Success",
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    icon: Rocket,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    title: "Agent Deployed",
    desc: "rust-agent-02 deployed to eu-west-2b",
    time: "18m ago",
    badge: "Deployment",
    badgeColor: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  },
  {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    title: "Job Failed",
    desc: "rust-agent-01 failed validation-job-7723",
    time: "24m ago",
    badge: "Failed",
    badgeColor: "text-red-400 border-red-500/30 bg-red-500/10",
  },
  {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Job Completed",
    desc: "rust-agent-03 completed indexing-job-5512",
    time: "31m ago",
    badge: "Success",
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    icon: RefreshCw,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "Agent Updated",
    desc: "rust-agent-01 updated to v2.4.1",
    time: "42m ago",
    badge: "Update",
    badgeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
];

export default function RecentActivity() {
  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Recent Activity</h2>
        <button
          onClick={() =>
            toast.info("Activity Log", "Full activity log coming soon")
          }
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          View All
        </button>
      </div>
      <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
        {activities.map((a, i) => (
          <div key={i} className="flex gap-3">
            <div
              className={`w-10 h-10 ${a.bg} rounded-full flex items-center justify-center shrink-0`}
            >
              <a.icon className={`w-5 h-5 ${a.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">{a.title}</h4>
                <span className="text-xs text-gray-500 shrink-0">{a.time}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{a.desc}</p>
              <span
                className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${a.badgeColor}`}
              >
                {a.badge}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
