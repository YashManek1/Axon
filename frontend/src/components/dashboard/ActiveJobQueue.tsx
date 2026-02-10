import { useState, useRef, useEffect } from "react";
import {
  Filter,
  Download,
  Play,
  Trash2,
  Eye,
  RotateCcw,
  Pause,
  MoreVertical,
  Loader2,
  Copy,
  FileText,
  Settings,
  Clock,
} from "lucide-react";
import { useJobs } from "../../hooks/useDashboardData";
import { jobsAPI } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "../../hooks/useDashboardData";

const typeColors: Record<string, string> = {
  http: "bg-blue-500/20 text-blue-400",
  shell: "bg-orange-500/20 text-orange-400",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

function JobMoreMenu({
  job,
  open,
  onClose,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const menuItems = [
    { label: "View Job Details", icon: Eye, color: "text-gray-300" },
    { label: "View Execution History", icon: FileText, color: "text-gray-300" },
    {
      label: "Copy Job ID",
      icon: Copy,
      color: "text-gray-300",
      action: () => {
        navigator.clipboard.writeText(job._id);
        alert("Job ID copied!");
      },
    },
    { label: "Edit Schedule", icon: Clock, color: "text-gray-300" },
    { label: "Configure Webhook", icon: Settings, color: "text-gray-300" },
    { label: "Duplicate Job", icon: Copy, color: "text-blue-400" },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 w-56 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg shadow-xl py-1 z-50"
    >
      {menuItems.map((opt) => (
        <button
          key={opt.label}
          onClick={() => {
            onClose();
            opt.action ? opt.action() : alert(`${opt.label} for ${job.name}`);
          }}
          className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-[#23232f] transition-colors ${opt.color}`}
        >
          <opt.icon className="w-4 h-4" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function getJobProgress(job: Job): number {
  if (!job.enabled) return 0;
  if (job.status === "paused") return 0;
  return 100;
}

function getJobDuration(job: Job): string {
  const created = new Date(job.createdAt);
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function ActiveJobQueue() {
  const { data: jobs, isLoading } = useJobs();
  const queryClient = useQueryClient();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const handleToggle = async (id: string) => {
    await jobsAPI.toggle(id);
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this job?")) {
      await jobsAPI.delete(id);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }
  };

  const handleRunNow = async (id: string) => {
    await jobsAPI.runNow(id);
    alert("Job triggered!");
  };

  if (isLoading) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-[#111118] border border-[#23232f] rounded-xl p-10 text-center">
        <p className="text-gray-400">No jobs found. Create your first job!</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111118] border border-[#23232f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Job Queue</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f]">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f]">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-[#23232f]">
              <th className="pb-3 pr-4">Name</th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3 pr-4">Schedule</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Progress</th>
              <th className="pb-3 pr-4">Duration</th>
              <th className="pb-3 pr-4">Created By</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const progress = getJobProgress(job);
              const duration = getJobDuration(job);
              const progressColor = job.enabled
                ? "bg-emerald-500"
                : "bg-gray-500";

              return (
                <tr
                  key={job._id}
                  className="border-b border-[#1a1a24] hover:bg-[#0d0d14] transition-colors"
                >
                  <td className="py-4 pr-4">
                    <p className="text-sm font-medium text-white">{job.name}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {job._id.slice(-8)}
                    </p>
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${typeColors[job.type] || "bg-gray-500/20 text-gray-400"}`}
                    >
                      {job.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <code className="text-xs text-gray-300 bg-[#1a1a24] px-2 py-1 rounded">
                      {job.schedule}
                    </code>
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border ${job.enabled ? statusColors.active : statusColors.paused}`}
                    >
                      {job.enabled ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-[#23232f] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progressColor}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{progress}%</span>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-sm text-white">{duration}</span>
                  </td>
                  <td className="py-4 pr-4 text-sm text-gray-300">
                    {typeof job.userId === "object" ? job.userId.username : "-"}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="Run now"
                        onClick={() => handleRunNow(job._id)}
                        className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-[#23232f] rounded-md transition-colors"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="Toggle"
                        onClick={() => handleToggle(job._id)}
                        className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-[#23232f] rounded-md transition-colors"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="Retry"
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-[#23232f] rounded-md transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="View"
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-[#23232f] rounded-md transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="Delete"
                        onClick={() => handleDelete(job._id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-[#23232f] rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          aria-label="More options"
                          onClick={() =>
                            setOpenMenu(openMenu === job._id ? null : job._id)
                          }
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-[#23232f] rounded-md transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <JobMoreMenu
                          job={job}
                          open={openMenu === job._id}
                          onClose={() => setOpenMenu(null)}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
