import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { auditAPI, jobsAPI, type ManualRunPreviewResponse } from "../../services/api";
import { toast } from "../../stores/toastStore";
import { useAuthStore } from "../../stores/authStore";
import type { Job } from "../../hooks/useDashboardData";
import SavedRunEvidence from "./SavedRunEvidence";
import ReconciliationPanel from "./ReconciliationPanel";

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

interface PendingApproval {
  version: 1;
  jobId: string;
  previewId: string;
  previewHash: string;
  idempotencyKey: string;
}

type PreviewState = "idle" | "loading" | "ready" | "failure" | "stale" | "expired" | "permission" | "pending";

function pendingStorageKey(orgId: string, userId: string, jobId: string) {
  return `axon.manual-run.pending.v1:${orgId}:${userId}:${jobId}`;
}

function responseCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}

function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status;
}

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

function targetSummary(target: Job["targetAgentId"]) {
  if (!target) return null;
  if (typeof target === "string") return { id: target, label: target };

  const hostname = target.systemInfo?.hostname;
  return { id: target._id, label: [target.name, hostname, target._id].filter(Boolean).join(" · ") };
}

function isUnknownOutcome(run: AuditRecord) {
  return (run.outcome ?? run.status).toUpperCase() === "UNKNOWN";
}

export default function JobDetailPage() {
  const { jobId }       = useParams();
  const navigate        = useNavigate();
  const queryClient     = useQueryClient();
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const [confirmingLaunch, setConfirmingLaunch] = useState(false);
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<ManualRunPreviewResponse | null>(null);
  const [previewContext, setPreviewContext] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingApprovalContext, setPendingApprovalContext] = useState<string | null>(null);
  const [hydratedContext, setHydratedContext] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const user = useAuthStore((state) => state.user);
  const launchTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelLaunchRef = useRef<HTMLButtonElement>(null);
  const dispatchLaunchRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreLaunchFocus = useRef(false);
  const mountedRef = useRef(true);
  const contextKey = user && jobId ? `${user.orgId}:${user._id}:${jobId}` : null;
  const activeContextRef = useRef(contextKey);

  // Keep this synchronous with the rendered tenant, actor, and job so a late
  // response cannot update a newly-selected execution context before effects run.
  if (activeContextRef.current !== contextKey) activeContextRef.current = contextKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const storageKey = user && jobId ? pendingStorageKey(user.orgId, user._id, jobId) : null;

  useEffect(() => {
    // A prior account/job must never remain eligible while this context hydrates.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Deliberate fail-closed readiness reset.
    setHydratedContext(null);

    const restore = window.setTimeout(() => {
      setPage(0);
      setRunning(false);
      setConfirmingLaunch(false);
      setLaunchFeedback(null);
      setPreview(null);
      setPreviewContext(null);
      setPreviewState("idle");
      setPendingApproval(null);
      setPendingApprovalContext(null);
      setNow(Date.now());
      shouldRestoreLaunchFocus.current = false;
      if (!storageKey || !jobId) return;

      let raw: string | null;
      try {
        raw = window.sessionStorage.getItem(storageKey);
      } catch {
        // A read failure cannot distinguish an absent record from an unresolved
        // approval.  Do not erase the key or permit a fresh approval.
        setLaunchFeedback("The browser could not safely recover approval state. No launch can be submitted.");
        return;
      }

      if (raw === null) {
        setHydratedContext(contextKey);
        return;
      }

      try {
        const saved = JSON.parse(raw) as PendingApproval;
        if (saved?.version !== 1 || saved.jobId !== jobId || !saved.previewId || !saved.previewHash || !saved.idempotencyKey) {
          throw new Error("Stored approval identity is incomplete.");
        }
        setPendingApproval(saved);
        setPendingApprovalContext(contextKey);
        setHydratedContext(contextKey);
      } catch {
        // Parsed-but-invalid data is still an uncertain persisted identity.
        // Keep it intact for diagnosis and fail closed rather than replacing it.
        setLaunchFeedback("The browser could not verify recovered approval state. No launch can be submitted.");
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [contextKey, jobId, storageKey]);

  useEffect(() => {
    if (!preview) return;
    const remaining = Date.parse(preview.expiresAt) - Date.now();
    if (remaining <= 0) {
      const expiry = window.setTimeout(() => {
        setNow(Date.now());
        setPreviewState("expired");
      }, 0);
      return () => window.clearTimeout(expiry);
    }
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      setPreviewState("expired");
    }, remaining + 1);
    return () => window.clearTimeout(timer);
  }, [preview]);

  useEffect(() => {
    if (confirmingLaunch) {
      cancelLaunchRef.current?.focus();
    } else if (shouldRestoreLaunchFocus.current && !running) {
      launchTriggerRef.current?.focus();
      shouldRestoreLaunchFocus.current = false;
    }
  }, [confirmingLaunch, running]);

  const closeLaunchConfirmation = () => {
    shouldRestoreLaunchFocus.current = true;
    setConfirmingLaunch(false);
  };
  const createdBy = useMemo(() => {
    if (!job) return "-";
    return typeof job.userId === "object" ? job.userId.username : "-";
  }, [job]);

  const savePending = (pending: PendingApproval | null) => {
    if (pending) {
      if (!storageKey || typeof window === "undefined") return false;
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(pending));
      } catch {
        return false;
      }
    } else if (storageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // A stale durable record is safer than replacing it with a new approval.
      }
    }
    setPendingApproval(pending);
    setPendingApprovalContext(pending ? contextKey : null);
    return true;
  };

  const contextHydrated = Boolean(contextKey) && hydratedContext === contextKey;
  const activePreview = previewContext === contextKey ? preview : null;
  const activePendingApproval = pendingApprovalContext === contextKey ? pendingApproval : null;

  const loadPreview = async () => {
    const requestContext = contextKey;
    const requestJobId = jobId;
    if (!requestJobId || !requestContext || running) return;
    setPreview(null);
    setPreviewContext(null);
    setPreviewState("loading");
    try {
      const response = await jobsAPI.previewRun(requestJobId);
      const next = response.data;
      if (!next?.previewId || next.previewVersion !== 1 || !next.previewHash || !next.expiresAt || !next.preview?.jobId || !next.preview?.jobName || !next.preview?.targetAgentId || !next.preview?.targetLabel || !next.preview?.command || !next.preview?.actionVersion || !Number.isFinite(next.preview?.timeoutMs) || !Number.isFinite(next.preview?.maxOutputBytes) || !next.preview?.requiredReleaseId || !next.preview?.notifications || !Array.isArray(next.preview.notifications.recipients)) {
        throw new Error("The server returned incomplete preview details.");
      }
      if (!mountedRef.current || activeContextRef.current !== requestContext) return;
      setPreview(next);
      setPreviewContext(requestContext);
      setPreviewState(Date.parse(next.expiresAt) <= Date.now() ? "expired" : "ready");
    } catch (error) {
      if (!mountedRef.current || activeContextRef.current !== requestContext) return;
      const status = responseStatus(error);
      const code = responseCode(error);
      setPreviewState(status === 401 || status === 403 ? "permission" : code === "PREVIEW_STALE" ? "stale" : code === "PREVIEW_EXPIRED" ? "expired" : "failure");
    }
  };

  const runNow = async (approval: PendingApproval) => {
    const requestContext = contextKey;
    const requestJobId = jobId;
    if (!requestJobId || !requestContext || running) return;
    setRunning(true);
    try {
      const response = await jobsAPI.runNow(requestJobId, { previewId: approval.previewId, previewHash: approval.previewHash }, approval.idempotencyKey);
      const data = response.data as { runId?: string; status?: string; message?: string; queueStateConfirmed?: boolean };
      const message = data.runId && data.status
        ? data.queueStateConfirmed === false
          ? `Run ${data.runId}: accepted; queue state is unconfirmed. Inspect saved run evidence or refresh.`
          : `Run ${data.runId}: ${data.status}`
        : data.message ?? "Job triggered manually";
      if (!mountedRef.current || activeContextRef.current !== requestContext) return;
      savePending(null);
      setPreview(null);
      setPreviewContext(null);
      setPreviewState("idle");
      setLaunchFeedback(message);
      toast.success("Launch accepted", message);
      queryClient.invalidateQueries({ queryKey: ["audit", "job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["saved-run-evidence", user?.orgId, user?._id, jobId] });
    } catch (err: unknown) {
      if (!mountedRef.current || activeContextRef.current !== requestContext) return;
      const data = (err as { response?: { data?: { code?: string; message?: string } } }).response?.data;
      const status = responseStatus(err);
      const uncertain = !status || (status === 503 && data?.code === "LAUNCH_ACCEPTANCE_UNKNOWN");
      const knownStale = data?.code === "PREVIEW_STALE" || data?.code === "PREVIEW_EXPIRED";
      if (uncertain) {
        savePending(approval);
        setPreviewState("pending");
      } else if (knownStale) {
        savePending(null);
        setPreview(null);
        setPreviewContext(null);
        setPreviewState(data?.code === "PREVIEW_EXPIRED" ? "expired" : "stale");
      }
      const msg = uncertain ? "Acceptance is unknown. Check this same approval; do not start a new run." : data?.code && data.message ? `${data.code}: ${data.message}` : data?.message || "Dispatch failed";
      setLaunchFeedback(msg);
      toast.error(uncertain ? "Acceptance requires checking" : "Launch rejected", msg);
    } finally {
      if (mountedRef.current && activeContextRef.current === requestContext) setRunning(false);
    }
  };

  const confirmLaunch = async () => {
    // Snapshot the current context at the moment of confirmation. If
    // a job or account transition has occurred since the dialog opened,
    // the snapshotted key will not match the originating pending/preview
    // context and the submission is rejected here before any POST.
    const confirmContext = contextKey;
    shouldRestoreLaunchFocus.current = true;
    setConfirmingLaunch(false);
    if (!contextHydrated || confirmContext !== activeContextRef.current) {
      setLaunchFeedback("Approval state is still being recovered for this job. No launch was submitted.");
      return;
    }
    // Re-derive approval from the snapshotted context so stale state
    // from a different job/account cannot be used even if state updates
    // from the zero-delay reset timer are still pending.
    const snappedPending = pendingApprovalContext === confirmContext ? pendingApproval : null;
    const snappedPreview = previewContext === confirmContext ? preview : null;
    const approval = snappedPending ?? (snappedPreview && previewState === "ready" && Date.parse(snappedPreview.expiresAt) > now
      ? (() => {
          const idempotencyKey = globalThis.crypto?.randomUUID?.();
          return idempotencyKey ? { version: 1 as const, jobId: jobId!, previewId: snappedPreview.previewId, previewHash: snappedPreview.previewHash, idempotencyKey } : null;
        })()
      : null);
    if (!approval) {
      setLaunchFeedback("This preview can no longer be approved. Request a new server preview.");
      return;
    }
    if (!snappedPending && !savePending(approval)) {
      setLaunchFeedback("The browser could not preserve this approval identity. No launch was submitted.");
      return;
    }
    await runNow(approval);
  };

  if (jobQuery.isLoading) {
    return (
      <div className="bg-surface border border-edge rounded-md p-8 flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 size={24} aria-hidden="true" style={{ animation: "spin 0.8s linear infinite", color: "var(--muted)" }} />
        <span className="sr-only">Loading job details…</span>
      </div>
    );
  }
  if (jobQuery.isError) {
    const status = (jobQuery.error as { response?: { status?: number } } | null)?.response?.status;
    const permissionDenied = status === 401 || status === 403;
    return (
      <div className="bg-surface border border-edge rounded-md p-8 text-center" role="alert">
        <h3 className="text-lg font-bold text-ink">{permissionDenied ? "You do not have permission to view this job" : "Job details are unavailable"}</h3>
        <p className="mt-2 text-sm text-muted">{permissionDenied ? "Ask an organization administrator for access before trying again." : "The job could not be loaded. Return to jobs and try again when the service is available."}</p>
        <div className="flex items-center justify-center mt-4"><button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border-1 border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={() => navigate("/dashboard/jobs")}><ArrowLeft size={14} /> Back to jobs</button></div>
      </div>
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
  const target = targetSummary(job.targetAgentId);
  const hasUnknownOutcome = history.some(isUnknownOutcome);
  const roleCanRequestPreview = ["admin", "operator", "user"].includes(user?.role ?? "");
  const previewIsCurrent = previewState === "ready" && activePreview && Date.parse(activePreview.expiresAt) > now;

  const openLaunchConfirmation = () => {
    if (!contextHydrated) return;
    setConfirmingLaunch(true);
    if (activePendingApproval) {
      setPreview(null);
      setPreviewContext(null);
      setPreviewState("pending");
      return;
    }
    void loadPreview();
  };

  return (
    <>
      <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm text-muted transition-all hover:text-ink hover:bg-surface-2 mb-2" onClick={() => navigate("/dashboard/jobs")}>
            <ArrowLeft size={14} /> Jobs
          </button>
          <h1 className="text-2xl font-bold text-ink">{job.name}</h1>
          <p className="text-muted mt-2">Job ID: <span className="font-mono">{job._id}</span></p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-ui font-bold text-xs uppercase px-2 py-px rounded-sm text-warning bg-amber-500/10">
            {job.type === "http" ? "unsupported in pilot" : "manual only"}
          </span>
          {job.type === "shell" && <button ref={launchTriggerRef} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap font-ui font-medium h-auto px-3 rounded-sm bg-primary text-white transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed" disabled={running || !contextHydrated} onClick={openLaunchConfirmation}>
            {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
            {activePendingApproval ? "Check pending approval" : "Review & run"}
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
          {job.type === "shell" && <DetailRow label="Exact target" value={target?.label ?? "Missing — launch blocked"} />}
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

      {job.type === "shell" && (
        <section className="bg-surface border border-edge rounded-md p-4 mb-4" aria-labelledby="run-readiness-title">
          <h2 id="run-readiness-title" className="font-ui font-bold text-sm text-ink">Before you run</h2>
          <p className="mt-1 text-sm text-muted">This guide is not an execution clearance. The server preview and explicit approval remain required.</p>
          <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-ink-2">
            <li>
              <strong>Access:</strong> {roleCanRequestPreview
                ? `Signed in as ${user?.role}. The server still checks your access to this job when you request a preview and approve it.`
                : `Signed in as ${user?.role ?? "an unknown role"}. This role cannot request or approve a launch; ask an administrator for access.`}
            </li>
            <li>
              <strong>Exact target:</strong> {target
                ? `${target.label} is saved for this job. Selection alone does not prove the agent is connected, contained, or on the required release.`
                : "No target is saved. A server preview and launch cannot proceed until this job has an exact target."}
            </li>
            <li>
              <strong>Approval recovery:</strong> {!contextHydrated
                ? "Browser approval state is unverified. No approval can be submitted."
                : activePendingApproval
                  ? "An approval is unresolved. Use Check pending approval to check the same identity; do not create another run."
                  : "No unresolved approval is stored for this job in this browser."}
            </li>
            <li>
              <strong>Server preview:</strong> {previewState === "pending"
                ? "Only the saved approval identity may be checked; do not request a new run."
                : previewIsCurrent
                  ? "Loaded for review. Check its exact target, command, release, limits, and notifications before explicitly approving."
                  : previewState === "loading"
                    ? "Loading; approval is not available yet."
                    : previewState === "permission"
                      ? "Permission denied. No approval is available."
                      : previewState === "failure" || previewState === "stale" || previewState === "expired"
                        ? "Unavailable, stale, or expired. Request a new server preview before any approval."
                        : "Not requested. Use Review & run to request a server preview; nothing is submitted by this guide."}
            </li>
            <li>
              <strong>Prior effects:</strong> {hasUnknownOutcome
                ? "An UNKNOWN result appears in this history page. Reconcile the target and saved run evidence before another execution."
                : "Inspect saved run evidence and history before approving. Missing or stale evidence is not proof that a prior command did not run."}
            </li>
          </ol>
        </section>
      )}

      {launchFeedback && <div className="mb-4 rounded-sm border border-edge p-3 text-sm text-ink-2" role="status">{launchFeedback}</div>}

      {hasUnknownOutcome && (
        <div className="mb-4 rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink-2" role="alert">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0 text-warning" size={16} /><span><strong>Execution outcome unknown.</strong> Axon has not received enough evidence to say whether the command completed. Do not run it again until the target and run evidence have been reconciled.</span></div>
        </div>
      )}

      <SavedRunEvidence jobId={jobId!} orgId={user?.orgId} actorId={user?._id} />

      <ReconciliationPanel jobId={jobId!} orgId={user?.orgId} actorId={user?._id} />

      <div className="bg-surface border border-edge rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-ui font-bold text-sm text-ink">Execution history</span>
          <span className="flex-1" />
          {historyQuery.isFetching && !historyQuery.isLoading && <span className="mr-3 text-xs text-muted" role="status">Refreshing evidence…</span>}
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
                <tr><td colSpan={6} className="text-center text-muted h-16" role="status">Loading execution evidence…</td></tr>
              ) : historyQuery.isError && history.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-danger h-16">Execution evidence could not be refreshed.</td></tr>
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
        {historyQuery.isError && (
          <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-ink-2" role="alert">
            The execution-history service is unavailable. Do not assume a missing update means the command failed or succeeded; shown evidence may be stale.
          </div>
        )}
        {historyQuery.dataUpdatedAt > 0 && (
          <div className="border-t border-edge px-4 py-2 text-xs text-muted" role="status">
            Evidence last refreshed {new Date(historyQuery.dataUpdatedAt).toLocaleString()}.
          </div>
        )}
        <div className="flex gap-1 px-4 py-3 justify-end">
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>&larr; Prev</button>
          <button className="inline-flex items-center justify-center gap-2 font-ui font-medium h-8 px-3 rounded-sm border border-edge text-muted transition-all hover:text-ink hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm" disabled={history.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next &rarr;</button>
        </div>
      </div>

      {confirmingLaunch && contextHydrated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="launch-confirmation-title" aria-describedby="launch-confirmation-description" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeLaunchConfirmation();
            return;
          }
          const lastFocusable = dispatchLaunchRef.current ?? cancelLaunchRef.current;
          if (event.key === "Tab" && event.shiftKey && document.activeElement === cancelLaunchRef.current) {
            event.preventDefault();
            lastFocusable?.focus();
          } else if (event.key === "Tab" && !event.shiftKey && document.activeElement === lastFocusable) {
            event.preventDefault();
            cancelLaunchRef.current?.focus();
          }
        }}>
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={closeLaunchConfirmation} />
          <div className="relative w-full max-w-lg rounded-md border border-edge bg-surface p-6 shadow-xl">
            <h2 id="launch-confirmation-title" className="text-lg font-bold text-ink">Review server-bound launch</h2>
            <p id="launch-confirmation-description" className="mt-2 text-sm text-muted">Only the immutable server preview can be approved. Axon will not choose a different target.</p>
            {previewState === "loading" && <p className="mt-4 text-sm text-muted" role="status">Loading the server preview…</p>}
            {previewState === "permission" && <p className="mt-4 text-sm text-danger" role="alert">You do not have permission to request this launch preview.</p>}
            {previewState === "failure" && <p className="mt-4 text-sm text-danger" role="alert">The server preview could not be loaded. No launch was submitted.</p>}
            {previewState === "stale" && <p className="mt-4 text-sm text-warning" role="alert">The server preview is stale. Request a new preview before approving.</p>}
            {previewState === "expired" && <p className="mt-4 text-sm text-warning" role="alert">The server preview has expired. Request a new preview before approving.</p>}
            {previewState === "pending" && <p className="mt-4 text-sm text-warning" role="alert">Acceptance is unknown. Checking sends the identical approval request; it does not create a new run.</p>}
            {activePreview && previewState === "ready" && (
              <dl className="mt-4 space-y-3 rounded-sm border border-edge bg-bg p-3 text-sm">
                <div><dt className="text-xs uppercase tracking-wide text-muted">Server target</dt><dd className="mt-1 font-mono text-ink">{activePreview.preview.targetLabel} · {activePreview.preview.targetAgentId}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Server command</dt><dd className="mt-1 break-words font-mono text-ink">{activePreview.preview.command}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Release</dt><dd className="mt-1 font-mono text-ink">{activePreview.preview.requiredReleaseId}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Limits</dt><dd className="mt-1 font-mono text-ink">Timeout {activePreview.preview.timeoutMs}ms · Maximum output {activePreview.preview.maxOutputBytes} bytes</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted">Notifications</dt><dd className="mt-1 break-words font-mono text-ink">Success {activePreview.preview.notifications.onSuccess ? "on" : "off"} · Failure {activePreview.preview.notifications.onFailure ? "on" : "off"} · {activePreview.preview.notifications.recipients.join(", ") || "No recipients"}</dd></div>
              </dl>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelLaunchRef} className="inline-flex items-center justify-center h-8 px-3 rounded-sm border border-edge text-sm text-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={closeLaunchConfirmation}>Cancel</button>
              {(previewState === "failure" || previewState === "stale" || previewState === "expired") && <button ref={dispatchLaunchRef} className="inline-flex items-center justify-center h-8 px-3 rounded-sm bg-primary text-sm text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={() => void loadPreview()}>Request new preview</button>}
              {(previewState === "ready" || previewState === "pending") && <button ref={dispatchLaunchRef} className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-sm bg-primary text-sm text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50" disabled={running || !contextHydrated || (previewState === "ready" && Date.parse(activePreview?.expiresAt ?? "") <= now)} onClick={confirmLaunch}>
                <Play size={14} /> {previewState === "pending" ? "Check same approval" : "Approve server preview"}
              </button>
              }
            </div>
          </div>
        </div>
      )}
    </>
  );
}
