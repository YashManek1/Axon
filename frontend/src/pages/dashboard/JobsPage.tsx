import { useState } from "react";
import { Plus, Play, Pencil, Trash2, Loader2 } from "lucide-react";
import { useJobs } from "../../hooks/useDashboardData";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "../../hooks/useDashboardData";
import JobFormSlide from "../../components/dashboard/JobFormSlide";
import { Link, useNavigate } from "react-router-dom";
import { useConfirmStore } from "../../stores/confirmStore";
import { track } from "@vercel/analytics";

type StatusFilter = "all" | "active" | "paused";

function formatSchedule(schedule: string): string {
  return schedule || "Not reported";
}

export default function JobsPage() {
  const jobsQuery = useJobs();
  const jobs = jobsQuery.data ?? [];
  const queryClient  = useQueryClient();
  const navigate     = useNavigate();
  const confirmOpen  = useConfirmStore((s) => s.open);
  const [filter,   setFilter]   = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing,  setEditing]  = useState<Job | null>(null);

  const filtered = jobs.filter((j) => {
    if (filter === "all")    return true;
    if (filter === "active") return j.status === "active" || j.enabled;
    return j.status === "paused" || !j.enabled;
  });

  const runNow = (job: Job) => {
    if (!job._id) return;
    navigate("/dashboard/jobs/" + job._id);
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
      <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">Operations</h1>
          <p className="text-muted mt-2">Review an exact server target and approval details before dispatching.</p>
        </div>
        <div className="flex w-full items-center sm:w-auto sm:justify-end">
          <button className="inline-flex min-h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap font-ui font-medium h-auto px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={14} /> New operation
          </button>
        </div>
      </div>

      <aside className="mb-4 rounded-md border border-edge bg-surface p-4" aria-labelledby="staging-version-guide-title">
        <h2 id="staging-version-guide-title" className="font-ui text-sm font-bold text-ink">Check staging application version</h2>
        <p className="mt-1 text-sm text-muted">Example — manual setup, not validated for your server. This procedure is not installed.</p>
        <p className="mt-2 text-sm text-muted">Purpose: help an authorized teammate read the reported staging version without asking the engineer to repeat the check. Before using it, the responsible environment owner must permit the check, confirm the exact Linux staging server, and validate a readable, non-sensitive version file at the illustrative path <code className="break-all font-mono text-ink">/srv/example/VERSION</code>.</p>
        <p className="mt-2 text-sm text-muted">Illustrative read: <code className="break-all font-mono text-ink">cat /srv/example/VERSION</code>. Review the exact server and command in Axon’s approval flow. An expected non-sensitive version string with exit code 0 only reports that this read completed; it does not establish application health or deployment readiness.</p>
        <p className="mt-2 text-sm text-warning">If the target, prerequisite, version text, or exit result is UNKNOWN, stop and ask the responsible owner. Do not blindly repeat the command.</p>
      </aside>

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
        <span className="text-xs text-muted">{filtered.length} operation{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        {jobsQuery.isLoading ? (
          <div className="py-8 text-center text-muted" role="status" aria-label="Loading operations">
            <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        ) : jobsQuery.isError && jobs.length === 0 ? (
          <div className="py-8 text-center text-danger" role="alert">
            {(jobsQuery.error as { response?: { status?: number } })?.response?.status === 401 || (jobsQuery.error as { response?: { status?: number } })?.response?.status === 403 ? "Operations are not available to this role." : "Operations could not be loaded. Refresh the page and try again."}
          </div>
        ) : (
          <>
          {jobsQuery.isError && <div className="banner warn" role="alert">The latest operations could not be refreshed. Showing the last loaded records.</div>}
          <div className="overflow-x-auto"><table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Name</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Type</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Configured schedule</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Status</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Recorded next run</th>
                <th className="text-right font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted h-18">
                    {jobs.length === 0
                      ? "No operations are available. Create one to define a reusable command; review its exact target and approval flow before dispatch."
                      : "No operations match this filter. An operation needs an exact target; dispatch follows its approval flow."}
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr key={job._id} className="hover:bg-surface-2">
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <Link
                        className="text-ink font-bold hover:underline"
                        to={`/dashboard/jobs/${job._id}`}
                      >
                        {job.name}
                      </Link>
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2"><span className="font-mono text-xs bg-surface border border-edge rounded-sm px-2 py-px text-ink-2">{job.type}</span></td>
                    <td className="font-mono text-xs text-muted px-3.5 py-2.5 border-b border-edge text-ink-2">
                      {job.type === "shell" ? "Manual only" : formatSchedule(job.schedule)}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <div className="flex items-center gap-1">
                        {job.type === "http" ? (
                          <span className="inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm text-warning bg-amber-500/10">unsupported in pilot</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm text-warning bg-amber-500/10">manual only</span>
                        )}
                      </div>
                    </td>
                    <td className="text-xs text-muted px-3.5 py-2.5 border-b border-edge text-ink-2">
                      {(job as unknown as { nextRunAt?: string }).nextRunAt
                        ? new Date((job as unknown as { nextRunAt: string }).nextRunAt).toLocaleTimeString()
                        : "Not reported"}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2">
                      <div className="flex items-center justify-end gap-1">
                        {job.type === "shell" && <button
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Review server-bound launch"
                          onClick={() => runNow(job)}
                        >
                          <Play size={14} />
                        </button>}
                        {job.type === "shell" && <button
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-transparent text-muted transition-all hover:text-ink hover:bg-surface-2"
                          aria-label="Edit"
                          onClick={() => { setEditing(job); setFormOpen(true); }}
                        >
                          <Pencil size={14} />
                        </button>}
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
          </>
        )}
      </div>

      <JobFormSlide open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </>
  );
}
