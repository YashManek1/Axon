import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
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
}

const PAGE_SIZE = 10;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "completed", FAILED: "failed", TIMEOUT: "timeout",
    PENDING: "pending", DISPATCHED: "dispatched",
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
    if (!job) return "—";
    return typeof job.userId === "object" ? job.userId.username : "—";
  }, [job]);

  const runNow = async () => {
    if (!jobId) return;
    setRunning(true);
    try {
      await jobsAPI.runNow(jobId);
      toast.success("Dispatched", job?.name ?? jobId);
      queryClient.invalidateQueries({ queryKey: ["audit", "job", jobId] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Dispatch failed";
      toast.error("Failed", msg);
    } finally {
      setRunning(false);
    }
  };

  if (jobQuery.isLoading) {
    return (
      <div className="panel empty"><Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--text-faint)" }} /></div>
    );
  }
  if (!job) {
    return (
      <div className="panel empty">
        <h3>Job not found</h3>
        <div className="actions"><button className="btn btn-ghost btn-sm" onClick={() => navigate("/dashboard/jobs")}><ArrowLeft size={14} /> Back to jobs</button></div>
      </div>
    );
  }

  const payload = job.payload as Record<string, unknown>;

  return (
    <>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dashboard/jobs")} style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Jobs
          </button>
          <h1>{job.name}</h1>
          <p>Job ID: <span className="mono">{job._id}</span></p>
        </div>
        <div className="actions">
          <span className={"badge " + (job.enabled || job.status === "active" ? "active" : "paused")}>
            {job.enabled ? "active" : "paused"}
          </span>
          <button className="btn btn-primary btn-sm" disabled={running} onClick={runNow}>
            {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
            Run now
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><span className="panel-title">Job configuration</span></div>
        <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
          <DetailRow label="Type"     value={job.type} />
          <DetailRow label="Schedule" value={job.schedule} />
          <DetailRow label="Retries"  value={String(job.retryLimit)} />
          <DetailRow label="Created by" value={createdBy} />
          {job.type === "shell" && payload?.command && (
            <div style={{ gridColumn: "1 / -1" }}>
              <DetailRow label="Command" value={String(payload.command)} />
            </div>
          )}
          {job.type === "http" && payload?.url && (
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 20 }}>
              <DetailRow label="URL"    value={String(payload.url)} />
              <DetailRow label="Method" value={String(payload.method || "GET")} />
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Execution history</span>
          <span className="grow" />
          <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>Page {page + 1}</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Exit</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {historyQuery.isLoading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-faint)", height: 64 }}>Loading…</td></tr>
            ) : history.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-faint)", height: 64 }}>No executions yet</td></tr>
            ) : (
              history.map((run) => (
                <tr key={run._id}>
                  <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{statusBadge(run.status)}</td>
                  <td className="mono" style={{ fontSize: "var(--t-xs)" }}>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td>
                    {run.exitCode == null ? (
                      <span className="mono" style={{ color: "var(--text-faint)" }}>—</span>
                    ) : run.exitCode === 0 ? (
                      <span style={{ color: "var(--ok)" }}><CheckCircle size={14} /></span>
                    ) : (
                      <span style={{ color: "var(--err)" }}><XCircle size={14} /></span>
                    )}
                  </td>
                  <td style={{ fontSize: "var(--t-xs)", color: "var(--err)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {run.stderrSummary || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="row gap-2" style={{ padding: "12px 16px", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <button className="btn btn-ghost btn-sm" disabled={history.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>
    </>
  );
}
