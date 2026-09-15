import { useState } from "react";
import { Plus, Play, Pencil, Trash2, Loader2 } from "lucide-react";
import { useJobs } from "../../hooks/useDashboardData";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "../../hooks/useDashboardData";
import JobFormSlide from "../../components/dashboard/JobFormSlide";
import { useNavigate } from "react-router-dom";
import { useConfirmStore } from "../../stores/confirmStore";
import { track } from "@vercel/analytics";

type StatusFilter = "all" | "active" | "paused";

interface LaunchFeedback {
  tone: "success" | "error";
  message: string;
}

function launchMessage(data: unknown, fallback: string) {
  const response = data as { runId?: string; status?: string; message?: string };
  if (response.runId && response.status) return `Run ${response.runId}: ${response.status}`;
  return response.message ?? fallback;
}

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { code?: string; message?: string } } }).response?.data;
  return data?.code && data.message ? `${data.code}: ${data.message}` : data?.message ?? fallback;
}

function formatSchedule(schedule: string): string {
  if (!schedule) return "—";
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hr] = parts;
  if (min === "0" && hr !== "*") return `Daily ${hr}:00`;
  if (min.startsWith("*/")) return `Every ${min.slice(2)}m`;
  if (min === "0" && hr === "*") return "Hourly";
  return schedule;
}

export default function JobsPage() {
  const { data: jobs = [], isLoading, isError } = useJobs();
  const queryClient  = useQueryClient();
  const navigate     = useNavigate();
  const confirmOpen  = useConfirmStore((s) => s.open);
  const [filter,   setFilter]   = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing,  setEditing]  = useState<Job | null>(null);
  const [running,  setRunning]  = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [launchFeedback, setLaunchFeedback] = useState<LaunchFeedback | null>(null);

  const filtered = jobs.filter((j) => {
    if (filter === "all")    return true;
    if (filter === "active") return j.status === "active" || j.enabled;
    return j.status === "paused" || !j.enabled;
  });

  const runNow = async (job: Job) => {
    if (!job._id) return;
    setRunning((r) => ({ ...r, [job._id!]: true }));
    try {
      const response = await jobsAPI.runNow(job._id);
      const message = launchMessage(response.data, "Job triggered manually");
      setLaunchFeedback({ tone: "success", message });
      toast.success("Launch accepted", message);
      track("job_triggered", { jobType: job.type });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch (error) {
      const message = apiErrorMessage(error, "Could not dispatch " + job.name);
      setLaunchFeedback({ tone: "error", message });
      toast.error("Launch rejected", message);
    } finally {
      setRunning((r) => ({ ...r, [job._id!]: false }));
    }
  };

  const toggleJob = async (job: Job) => {
    if (!job._id) return;
    setToggling((t) => ({ ...t, [job._id!]: true }));
    try {
      await jobsAPI.toggle(job._id);
      toast.success(job.enabled ? "Job paused" : "Job enabled", job.name);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      toast.error("Failed", "Could not toggle " + job.name);
    } finally {
      setToggling((t) => ({ ...t, [job._id!]: false }));
    }
  };

  const deleteJob = (job: Job) => {
    confirmOpen({
      title: "Delete Job",
      message: "Are you sure you want to delete this job? This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await jobsAPI.delete(job._id!);
          toast.success("Deleted", job.name);
          track("job_deleted");
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        } catch {
          toast.error("Failed", "Could not delete " + job.name);
        }
      },
    });
  };

  return (
    <>
      <div className="flex items-start justify-between gap-8 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Jobs</h1>
          <p className="text-muted mt-2">Manual, scheduled, and triggered executions</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={14} /> New job
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-0 border border-edge rounded-sm bg-bg">
          {(["all", "active", "paused"] as StatusFilter[]).map((f, idx) => (
            <button key={f} className={`px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f ? "bg-primary text-white" : "text-muted hover:text-ink"
            } ${idx > 0 ? "border-l border-edge" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-muted">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {launchFeedback && (
        <div className={`mb-4 rounded-sm border p-3 text-sm ${launchFeedback.tone === "success" ? "border-green-500/30 text-success" : "border-red-500/30 text-danger"}`} role={launchFeedback.tone === "error" ? "alert" : "status"}>
          {launchFeedback.message}
        </div>
      )}

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        {isLoading ? (
          <div className="py-8 text-center text-muted">
            <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-danger" role="alert">Jobs could not be loaded. Refresh the page and try again.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Name</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Type</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Schedule</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Status</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Next run</th>
                <th className="text-right font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted h-18">
                    No jobs found
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr key={job._id} className="hover:bg-surface-2">
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <span
                        className="text-ink font-bold cursor-pointer hover:underline"
                        onClick={() => navigate("/dashboard/jobs/" + job._id)}
                      >
                        {job.name}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2"><span className="font-mono text-xs bg-surface border border-edge rounded-sm px-2 py-px text-ink-2">{job.type}</span></td>
                    <td className="font-mono text-xs text-muted px-3.5 py-2.5 border-b border-edge text-ink-2">
                      {job.type === "shell" ? "Manual only" : formatSchedule(job.schedule)}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <div className="flex items-center gap-1">
                        {job.type === "http" && <button
                          className={`relative w-8 h-4 rounded-full transition-colors ${job.enabled || job.status === "active" ? "bg-primary" : "bg-disabled"}`}
                          disabled={toggling[job._id ?? ""]}
                          onClick={() => toggleJob(job)}
                          style={{
                            border: "1px solid transparent",
                            cursor: "pointer",
                          }}
                        >
                          <span className={`absolute w-3 h-3 bg-white rounded-full top-0.5 transition-transform ${job.enabled || job.status === "active" ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>}
                        <span className={`inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm ${
                          job.status === "active" && job.enabled ? "text-success bg-green-500/10" : "text-warning bg-amber-500/10"
                        }`}>{job.status === "active" && job.enabled ? "active" : "paused"}</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted px-3.5 py-2.5 border-b border-edge text-ink-2">
                      {(job as unknown as { nextRunAt?: string }).nextRunAt
                        ? new Date((job as unknown as { nextRunAt: string }).nextRunAt).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Run now"
                          disabled={running[job._id ?? ""]}
                          onClick={() => runNow(job)}
                        >
                          {running[job._id ?? ""] ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
                        </button>
                        <button
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2"
                          aria-label="Edit"
                          onClick={() => { setEditing(job); setFormOpen(true); }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-danger hover:bg-surface-2"
                          aria-label="Delete"
                          onClick={() => deleteJob(job)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        )}
      </div>

      <JobFormSlide open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </>
  );
}
