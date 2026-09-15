import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle } from "lucide-react";
import { auditAPI, jobsAPI } from "../../services/api";
import { toast } from "../../stores/toastStore";
import type { Job } from "../../hooks/useDashboardData";

interface AuditRecord {
  _id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  exitCode?: number;
  stderrSummary?: string;
  command?: string;
  runId?: string | null;
  targetExecutionId?: string | null;
  attemptId?: string | null;
  operationId?: string | null;
  targetAgentId?: string | null;
  reasonCode?: string | null;
  outcome?: string | null;
}

const PAGE_SIZE = 10;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "completed", FAILED: "failed", TIMEOUT: "timeout",
    PENDING: "pending", DISPATCHED: "dispatched", UNKNOWN: "pending",
    completed: "completed", rejected: "failed", timed_out: "timeout", cancelled: "cancelled", unknown: "pending",
  };
  return <span className={"badge " + (map[status] || "cancelled")}>{status}</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", fontFamily: "var(--font-mono)" }}>{label}</span>
      <span style={{ fontSize: "var(--t-sm)", color: "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
}

export default function JobDetailPage() {
  const { jobId }       = useParams();
  const navigate        = useNavigate();
  const queryClient     = useQueryClient();
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);

  const jobQuery = useQuery<Job>({
    queryKey: ["jobs", jobId],
    queryFn: async () => { const r = await jobsAPI.getById(jobId!); return r.data; },
    enabled: Boolean(jobId),
  });

  const historyQuery = useQuery<AuditRecord[]>({
    queryKey: ["audit", "job", jobId, page],
    queryFn: async () => { const r = await auditAPI.jobHistory(jobId!, PAGE_SIZE, page * PAGE_SIZE); return r.data; },
    enabled: Boolean(jobId),
    refetchInterval: 10000,
  });

  const job       = jobQuery.data;
  const history   = historyQuery.data ?? [];
  const createdBy = useMemo(() => {
    if (!job) return "-";
    return typeof job.userId === "object" ? job.userId.username : "-";
  }, [job]);

  const runNow = async () => {
    if (!jobId) return;
    setRunning(true);
    try {
      const response = await jobsAPI.runNow(jobId);
      const data = response.data as { runId?: string; status?: string; message?: string };
      const message = data.runId && data.status ? `Run ${data.runId}: ${data.status}` : data.message ?? "Job triggered manually";
      setLaunchFeedback(message);
      toast.success("Launch accepted", message);
      queryClient.invalidateQueries({ queryKey: ["audit", "job", jobId] });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { code?: string; message?: string } } }).response?.data;
      const msg = data?.code && data.message ? `${data.code}: ${data.message}` : data?.message || "Dispatch failed";
      setLaunchFeedback(msg);
      toast.error("Launch rejected", msg);
    } finally {
      setRunning(false);
    }
  };

  if (jobQuery.isLoading) {
    return (
      <div className="bg-surface border border-edge rounded-md p-8 flex items-center justify-center"><Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--muted)" }} /></div>
    );
  }
  if (!job) {
    return (
      <div className="bg-surface border border-edge rounded-md p-8 text-center">
        <h3 className="text-lg font-bold text-ink">Job not found</h3>
        <div className="flex items-center justify-center mt-4"><button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border-1 border-edge text-muted transition-all hover:text-ink hover:bg-surface-2" onClick={() => navigate("/dashboard/jobs")}><ArrowLeft size={14} /> Back to jobs</button></div>
      </div>
    );
  }

  const payload = job.payload as Record<string, unknown>;

  return (
    <>
      <div className="flex items-start justify-between gap-8 mb-8">
        <div>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 mb-2" onClick={() => navigate("/dashboard/jobs")}>
            <ArrowLeft size={14} /> Jobs
          </button>
          <h1 className="text-2xl font-bold text-ink">{job.name}</h1>
          <p className="text-muted mt-2">Job ID: <span className="font-mono">{job._id}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-ui font-bold text-xs uppercase px-2 py-px rounded-sm text-warning bg-amber-500/10">
            {job.type === "http" ? "unsupported in pilot" : "manual only"}
          </span>
          {job.type === "shell" && <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed" disabled={running} onClick={runNow}>
            {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
            Run now
          </button>}
        </div>
      </div>

      {job.type === "http" && (
        <div className="mb-4 rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink-2" role="alert">
          This historical HTTP job is read-only. The pilot profile blocks HTTP execution, webhooks, and external result sinks.
        </div>
      )}

      <div className="bg-surface border border-edge rounded-md overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">Job configuration</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <DetailRow label="Type"     value={job.type} />
          <DetailRow label="Schedule" value={job.type === "shell" ? "Manual only" : job.schedule} />
          {job.type === "http" && <DetailRow label="Retries" value={String(job.retryLimit)} />}
          <DetailRow label="Created by" value={createdBy} />
          {job.type === "shell" && Boolean(payload?.command) && (
            <div className="sm:col-span-2 xl:col-span-4">
              <DetailRow label="Command" value={String(payload.command)} />
            </div>
          )}
          {job.type === "http" && Boolean(payload?.url) && (
            <div className="sm:col-span-2 xl:col-span-4 flex gap-5 flex-wrap">
              <DetailRow label="URL"    value={String(payload.url)} />
              <DetailRow label="Method" value={String(payload.method || "GET")} />
            </div>
          )}
        </div>
      </div>

      {launchFeedback && <div className="mb-4 rounded-sm border border-edge p-3 text-sm text-ink-2" role="status">{launchFeedback}</div>}

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">Execution history</span>
          <span className="flex-1" />
          <span className="text-xs text-muted">Page {page + 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Started</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Status</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Duration</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Exit</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Error</th>
                <th className="text-left font-ui text-xs font-bold uppercase tracking-wider text-muted px-3.5 pb-2.5 border-b border-edge">Run evidence</th>
              </tr>
            </thead>
            <tbody>
              {historyQuery.isLoading ? (
                <tr><td colSpan={6} className="text-center text-muted h-16">Loading...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted h-16">No executions yet</td></tr>
              ) : (
                history.map((run) => (
                  <tr key={run._id}>
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2 hover:bg-surface-2">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2 hover:bg-surface-2">{statusBadge(run.outcome ?? run.status)}</td>
                    <td className="font-mono text-xs whitespace-nowrap px-3.5 py-2.5 border-b border-edge text-ink-2 hover:bg-surface-2">{run.durationMs ? (run.durationMs / 1000).toFixed(1) + "s" : "-"}</td>
                    <td className="px-3.5 py-2.5 border-b border-edge text-ink-2 hover:bg-surface-2">
                      {run.exitCode == null ? (
                        <span className="font-mono text-muted">-</span>
                      ) : run.exitCode === 0 ? (
                        <span className="text-success"><CheckCircle size={14} /></span>
                      ) : (
                        <span className="text-danger"><XCircle size={14} /></span>
                      )}
                    </td>
                    <td className="text-xs text-danger max-w-60 overflow-hidden text-ellipsis px-3.5 py-2.5 border-b border-edge hover:bg-surface-2">
                      {run.reasonCode || run.stderrSummary || "-"}
                    </td>
                    <td className="text-xs font-mono text-muted px-3.5 py-2.5 border-b border-edge hover:bg-surface-2">
                      {[run.runId, run.targetAgentId, run.targetExecutionId, run.attemptId, run.operationId].filter(Boolean).join(" · ") || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex gap-1 px-4 py-3 justify-end">
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>&larr; Prev</button>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={history.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next &rarr;</button>
        </div>
      </div>
    </>
  );
}
