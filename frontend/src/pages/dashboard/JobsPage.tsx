import { useState } from "react";
import { Plus, Play, Pencil, Trash2, Loader2 } from "lucide-react";
import { useJobs } from "../../hooks/useDashboardData";
import { jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "../../hooks/useDashboardData";
import JobFormSlide from "../../components/dashboard/JobFormSlide";
import { useNavigate } from "react-router-dom";

type StatusFilter = "all" | "active" | "paused";

function statusBadge(status: string, enabled: boolean) {
  const effective = status === "active" && enabled ? "active" : "paused";
  return (
    <span className={"badge " + effective}>{effective}</span>
  );
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
  const { data: jobs = [], isLoading } = useJobs();
  const queryClient = useQueryClient();
  const navigate    = useNavigate();
  const [filter,    setFilter]    = useState<StatusFilter>("all");
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState<Job | null>(null);
  const [running,   setRunning]   = useState<Record<string, boolean>>({});
  const [toggling,  setToggling]  = useState<Record<string, boolean>>({});

  const filtered = jobs.filter((j) => {
    if (filter === "all")    return true;
    if (filter === "active") return j.status === "active" || j.enabled;
    return j.status === "paused" || !j.enabled;
  });

  const runNow = async (job: Job) => {
    if (!job._id) return;
    setRunning((r) => ({ ...r, [job._id!]: true }));
    try {
      await jobsAPI.runNow(job._id);
      toast.success("Dispatched", job.name);
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch {
      toast.error("Failed", "Could not dispatch " + job.name);
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

  const deleteJob = async (job: Job) => {
    if (!job._id) return;
    try {
      await jobsAPI.delete(job._id);
      toast.success("Deleted", job.name);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      toast.error("Failed", "Could not delete " + job.name);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>Manual, scheduled, and triggered executions</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={14} /> New job
          </button>
        </div>
      </div>

      <div className="filterbar">
        <div className="seg">
          {(["all", "active", "paused"] as StatusFilter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className="dep-line">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>
            <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Next run</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-faint)", height: 72 }}>
                    No jobs found
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr key={job._id} className="clickable">
                    <td>
                      <span
                        style={{ color: "var(--text)", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => navigate("/dashboard/jobs/" + job._id)}
                      >
                        {job.name}
                      </span>
                    </td>
                    <td><span className="chip">{job.type}</span></td>
                    <td className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-muted)" }}>
                      {formatSchedule(job.schedule)}
                    </td>
                    <td>
                      <div className="row gap-2">
                        <button
                          className={"toggle" + (job.enabled || job.status === "active" ? " on" : "")}
                          disabled={toggling[job._id ?? ""]}
                          onClick={() => toggleJob(job)}
                        />
                        {statusBadge(job.status, job.enabled)}
                      </div>
                    </td>
                    <td style={{ fontSize: "var(--t-xs)", color: "var(--text-muted)" }}>
                      {(job as unknown as { nextRunAt?: string }).nextRunAt
                        ? new Date((job as unknown as { nextRunAt: string }).nextRunAt).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td>
                      <div className="row gap-1" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="icon-btn"
                          title="Run now"
                          disabled={running[job._id ?? ""]}
                          onClick={() => runNow(job)}
                        >
                          {running[job._id ?? ""] ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
                        </button>
                        <button
                          className="icon-btn"
                          title="Edit"
                          onClick={() => { setEditing(job); setFormOpen(true); }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Delete"
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
          </table>
        )}
      </div>

      <JobFormSlide open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </>
  );
}
