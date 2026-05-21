import { useEffect, useState } from "react";
import {
  CheckCircle,
  Play,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "../../stores/toastStore";
import { auditAPI } from "../../services/api";

interface AuditActivity {
  _id: string;
  command: string;
  status: "PENDING" | "DISPATCHED" | "COMPLETED" | "FAILED" | "TIMEOUT" | "CANCELLED";
  startedAt: string;
  durationMs?: number;
}

function timeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function activityPresentation(status: AuditActivity["status"]) {
  switch (status) {
    case "COMPLETED":
      return {
        icon: CheckCircle,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        title: "Job Completed",
        badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
      };
    case "FAILED":
    case "TIMEOUT":
      return {
        icon: XCircle,
        color: "text-red-400",
        bg: "bg-red-500/10",
        title: status === "TIMEOUT" ? "Job Timed Out" : "Job Failed",
        badgeColor: "text-red-400 border-red-500/30 bg-red-500/10",
      };
    case "DISPATCHED":
      return {
        icon: Play,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        title: "Job Dispatched",
        badgeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
      };
    case "CANCELLED":
      return {
        icon: AlertTriangle,
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        title: "Job Cancelled",
        badgeColor: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
      };
    default:
      return {
        icon: RefreshCw,
        color: "text-gray-400",
        bg: "bg-gray-500/10",
        title: "Job Pending",
        badgeColor: "text-gray-400 border-gray-500/30 bg-gray-500/10",
      };
  }
}

export default function RecentActivity() {
  const [activities, setActivities] = useState<AuditActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    auditAPI
      .recent(8)
      .then((response) => {
        if (mounted) {
          setActivities(response.data);
          setError("");
        }
      })
      .catch(() => {
        if (mounted) setError("Could not load recent activity");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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
        {loading && <p className="text-sm text-gray-400">Loading activity...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && activities.length === 0 && (
          <p className="text-sm text-gray-400">No activity yet</p>
        )}
        {!loading &&
          !error &&
          activities.map((activity) => {
            const presentation = activityPresentation(activity.status);
            const Icon = presentation.icon;
            return (
              <div key={activity._id} className="flex gap-3">
                <div
                  className={`w-10 h-10 ${presentation.bg} rounded-full flex items-center justify-center shrink-0`}
                >
                  <Icon className={`w-5 h-5 ${presentation.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      {presentation.title}
                    </h4>
                    <span className="text-xs text-gray-500 shrink-0">
                      {timeAgo(activity.startedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {activity.command}
                    {activity.durationMs ? ` in ${activity.durationMs}ms` : ""}
                  </p>
                  <span
                    className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${presentation.badgeColor}`}
                  >
                    {activity.status}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
